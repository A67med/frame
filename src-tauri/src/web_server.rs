use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Response, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex as AsyncMutex};

use crate::remote_auth::{self, Effect, RemoteSession};

pub const WEB_PORT: u16 = 11471;
const DEV_FRONTEND: &str = "http://127.0.0.1:1420";

/// True when built/run via `tauri dev` (CLI sets `--cfg dev`).
fn is_tauri_dev() -> bool {
    tauri::is_dev()
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static NEXT_CLIENT_ID: AtomicU64 = AtomicU64::new(1);

/// A frame Frame broadcasts. Only `public` frames (the TV hand-off offers)
/// reach sockets that have not paired.
#[derive(Clone)]
struct Outbound {
    payload: String,
    public: bool,
}

enum Direct {
    Text(String),
    Close,
}

struct ClientHandle {
    device: Option<String>,
    authorized: Arc<AtomicBool>,
    direct: mpsc::UnboundedSender<Direct>,
}

#[derive(Clone)]
struct ServeState {
    app: AppHandle,
    outbound: broadcast::Sender<Outbound>,
    clients: Arc<AsyncMutex<HashMap<u64, ClientHandle>>>,
}

fn shutdown_slot() -> &'static Mutex<Option<oneshot::Sender<()>>> {
    static S: OnceLock<Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn serve_state_slot() -> &'static Mutex<Option<ServeState>> {
    static S: OnceLock<Mutex<Option<ServeState>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn is_spa_path(raw_path: &str) -> bool {
    raw_path == "/"
        || raw_path.is_empty()
        || raw_path == "/remote"
        || raw_path.starts_with("/remote/")
        || raw_path == "/setup"
        || raw_path.starts_with("/setup/")
        || raw_path == "/reader"
        || raw_path.starts_with("/reader/")
}

fn serve_bundled_asset(app: &AppHandle, raw_path: &str) -> Response<Body> {
    let resolver = app.asset_resolver();
    let path = if is_spa_path(raw_path) {
        "/index.html".to_string()
    } else {
        raw_path.to_string()
    };
    let asset = resolver
        .get(path.clone())
        .or_else(|| resolver.get("/index.html".to_string()));
    match asset {
        Some(a) => {
            let cache = if path.ends_with(".html") || path == "/index.html" {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, a.mime_type)
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(a.bytes))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(
                "Frame web assets are not available in this build.",
            ))
            .unwrap(),
    }
}

/// In `tauri dev`, the desktop window loads Vite live assets, but `:11471`
/// previously only served Tauri's asset resolver (often stale). Proxy those
/// requests to the Vite dev server so phone `/remote` tracks HMR.
async fn proxy_dev_frontend(path_and_query: &str) -> Option<Response<Body>> {
    if !is_tauri_dev() {
        return None;
    }
    let url = format!("{DEV_FRONTEND}{path_and_query}");
    let client = reqwest::Client::new();
    let upstream = client.get(&url).send().await.ok()?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let headers = upstream.headers().clone();
    let bytes = upstream.bytes().await.ok()?;
    let mut builder = Response::builder().status(status);
    let mut out_headers = HeaderMap::new();
    for (name, value) in headers.iter() {
        let skip = matches!(
            name.as_str(),
            "transfer-encoding" | "content-length" | "connection" | "content-encoding"
        );
        if skip {
            continue;
        }
        if let Ok(n) = HeaderName::from_bytes(name.as_str().as_bytes()) {
            if let Ok(v) = HeaderValue::from_bytes(value.as_bytes()) {
                out_headers.insert(n, v);
            }
        }
    }
    out_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    *builder.headers_mut().unwrap() = out_headers;
    builder.body(Body::from(bytes)).ok()
}

async fn serve_http(State(state): State<ServeState>, uri: axum::http::Uri) -> Response<Body> {
    let path_and_query = uri
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());
    if let Some(proxied) = proxy_dev_frontend(&path_and_query).await {
        return proxied;
    }
    serve_bundled_asset(&state.app, uri.path())
}

/// Whether a browser page from `origin` may open the remote-control socket.
/// Browsers always send `Origin` on a WebSocket upgrade and a page cannot
/// forge it, so this stops any other website (opened in a normal browser on
/// this machine or the LAN) from driving Frame. Allowed: clients that send no
/// Origin (native apps), the page this server serves itself (same host and
/// port), another Frame install (Tauri's app origins, used by Play on LAN),
/// and the dev frontend.
fn remote_origin_allowed(origin: Option<&str>, host: Option<&str>) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    let origin = origin.trim().trim_end_matches('/').to_ascii_lowercase();
    if matches!(
        origin.as_str(),
        "http://tauri.localhost"
            | "https://tauri.localhost"
            | "tauri://localhost"
            | "http://localhost:1420"
            | "http://127.0.0.1:1420"
    ) {
        return true;
    }
    let Some(host) = host else {
        return false;
    };
    let host = host.trim().to_ascii_lowercase();
    origin == format!("http://{host}") || origin == format!("https://{host}")
}

async fn remote_ws_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(state): State<ServeState>,
) -> Response<Body> {
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    let host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
    if !remote_origin_allowed(origin, host) {
        eprintln!("[web-serve] refused remote socket from origin {:?}", origin);
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Body::from("origin not allowed"))
            .unwrap_or_default();
    }
    ws.on_upgrade(move |socket| handle_remote_socket(socket, state))
        .into_response()
}

async fn handle_remote_socket(socket: WebSocket, state: ServeState) {
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::SeqCst);
    let authorized = Arc::new(AtomicBool::new(false));
    let (direct, mut direct_rx) = mpsc::unbounded_channel::<Direct>();
    {
        let mut clients = state.clients.lock().await;
        clients.insert(
            client_id,
            ClientHandle {
                device: None,
                authorized: authorized.clone(),
                direct: direct.clone(),
            },
        );
    }
    let _ = state.app.emit(
        "remote://client",
        serde_json::json!({ "action": "join", "clientId": client_id }),
    );

    let (mut sender, mut receiver) = socket.split();
    let mut outbound_rx = state.outbound.subscribe();
    let send_authorized = authorized.clone();

    let send_task = tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                broadcast = outbound_rx.recv() => match broadcast {
                    Ok(frame) => {
                        let trusted = send_authorized.load(Ordering::SeqCst);
                        if !remote_auth::delivers(frame.public, trusted) {
                            continue;
                        }
                        if sender.send(Message::Text(frame.payload.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                own = direct_rx.recv() => match own {
                    Some(Direct::Text(text)) => {
                        if sender.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Some(Direct::Close) | None => {
                        let _ = sender.send(Message::Close(None)).await;
                        break;
                    }
                },
            }
        }
    });

    let host = serde_json::to_value(crate::harbor_lan::identity()).unwrap_or_default();
    let mut session = RemoteSession::new(client_id);
    'frames: while let Some(Ok(msg)) = receiver.next().await {
        let text = match msg {
            Message::Text(text) => text.to_string(),
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Binary(_) => continue,
        };
        // Forgetting a device clears the flag; keep the session in step.
        if session.authorized() && !authorized.load(Ordering::SeqCst) {
            session.revoke();
        }
        let effects = match remote_auth::shared(&state.app).lock() {
            Ok(mut auth) => session.on_text(&text, &mut auth, &host, remote_auth::now_ms()),
            Err(_) => break,
        };
        for effect in effects {
            match effect {
                Effect::Reply(frame) => {
                    let _ = direct.send(Direct::Text(frame.to_string()));
                }
                Effect::Forward(raw) => {
                    let _ = state.app.emit(
                        "remote://cmd",
                        serde_json::json!({ "clientId": client_id, "raw": raw }),
                    );
                }
                Effect::Emit(event, payload) => {
                    let _ = state.app.emit(event, payload);
                }
                Effect::Authorized(device) => {
                    authorized.store(true, Ordering::SeqCst);
                    if let Some(client) = state.clients.lock().await.get_mut(&client_id) {
                        client.device = Some(device);
                    }
                    let _ = state.app.emit(
                        "remote://client",
                        serde_json::json!({ "action": "auth", "clientId": client_id }),
                    );
                }
                Effect::Close => {
                    let _ = direct.send(Direct::Close);
                    break 'frames;
                }
            }
        }
    }

    let closing = match remote_auth::shared(&state.app).lock() {
        Ok(mut auth) => session.on_close(&mut auth),
        Err(_) => Vec::new(),
    };
    for effect in closing {
        if let Effect::Emit(event, payload) = effect {
            let _ = state.app.emit(event, payload);
        }
    }
    let _ = direct.send(Direct::Close);
    let _ = send_task.await;
    {
        let mut clients = state.clients.lock().await;
        clients.remove(&client_id);
    }
    let _ = state.app.emit(
        "remote://client",
        serde_json::json!({ "action": "leave", "clientId": client_id }),
    );
}

/// Disconnects every socket that paired as one of `ids` (devices the user
/// just forgot), so a forgotten phone loses control at once.
pub async fn disconnect_devices(ids: &[String]) {
    let state = {
        let guard = serve_state_slot().lock().unwrap();
        guard.clone()
    };
    let Some(state) = state else {
        return;
    };
    let clients = state.clients.lock().await;
    for client in clients.values() {
        if client.device.as_ref().is_some_and(|d| ids.contains(d)) {
            client.authorized.store(false, Ordering::SeqCst);
            let _ = client.direct.send(Direct::Close);
        }
    }
}

#[tauri::command]
pub async fn web_serve_start(app: AppHandle) -> Result<u16, String> {
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(WEB_PORT);
    }
    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], WEB_PORT)))
        .await
        .map_err(|e| format!("port {} unavailable: {}", WEB_PORT, e))?;
    let (tx, rx) = oneshot::channel::<()>();
    *shutdown_slot().lock().unwrap() = Some(tx);

    let (outbound, _) = broadcast::channel::<Outbound>(256);
    let state = ServeState {
        app: app.clone(),
        outbound,
        clients: Arc::new(AsyncMutex::new(HashMap::new())),
    };
    *serve_state_slot().lock().unwrap() = Some(state.clone());
    RUNNING.store(true, Ordering::SeqCst);

    let router = axum::Router::new()
        .route("/api/remote", get(remote_ws_handler))
        .fallback(serve_http)
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
        RUNNING.store(false, Ordering::SeqCst);
        *serve_state_slot().lock().unwrap() = None;
    });
    if is_tauri_dev() {
        eprintln!(
            "[web-serve] Frame remote WS on 0.0.0.0:{} (UI proxied from {})",
            WEB_PORT, DEV_FRONTEND
        );
    } else {
        eprintln!(
            "[web-serve] Frame web UI + remote WS listening on 0.0.0.0:{}",
            WEB_PORT
        );
    }
    Ok(WEB_PORT)
}

#[tauri::command]
pub fn web_serve_stop() {
    if let Some(tx) = shutdown_slot().lock().unwrap().take() {
        let _ = tx.send(());
    }
    *serve_state_slot().lock().unwrap() = None;
    RUNNING.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn web_serve_status() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// Push a JSON text frame to every paired remote client, or to every
/// connected client when `public` (only for frames that carry no secrets).
#[tauri::command]
pub fn remote_ws_broadcast(payload: String, public: Option<bool>) -> Result<(), String> {
    let guard = serve_state_slot().lock().unwrap();
    let Some(state) = guard.as_ref() else {
        return Ok(());
    };
    let _ = state.outbound.send(Outbound {
        payload,
        public: public.unwrap_or(false),
    });
    Ok(())
}

/// Send a JSON text frame to one paired client (a command's ack).
#[tauri::command]
pub async fn remote_ws_send(client_id: u64, payload: String) -> Result<(), String> {
    let state = {
        let guard = serve_state_slot().lock().unwrap();
        guard.clone()
    };
    let Some(state) = state else {
        return Ok(());
    };
    if let Some(client) = state.clients.lock().await.get(&client_id) {
        if client.authorized.load(Ordering::SeqCst) {
            let _ = client.direct.send(Direct::Text(payload));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn remote_ws_client_count() -> Result<usize, String> {
    let state = {
        let guard = serve_state_slot().lock().unwrap();
        guard.clone()
    };
    let Some(state) = state else {
        return Ok(0);
    };
    let count = state
        .clients
        .lock()
        .await
        .values()
        .filter(|c| c.authorized.load(Ordering::SeqCst))
        .count();
    Ok(count)
}

#[cfg(test)]
mod origin_tests {
    use super::remote_origin_allowed;

    #[test]
    fn allows_native_clients_same_origin_pages_and_frame_installs() {
        assert!(remote_origin_allowed(None, Some("192.168.1.20:11471")));
        assert!(remote_origin_allowed(
            Some("http://192.168.1.20:11471"),
            Some("192.168.1.20:11471")
        ));
        assert!(remote_origin_allowed(Some("http://tauri.localhost"), None));
        assert!(remote_origin_allowed(Some("tauri://localhost"), None));
        assert!(remote_origin_allowed(Some("http://localhost:1420/"), None));
    }

    #[test]
    fn refuses_other_websites() {
        let host = Some("192.168.1.20:11471");
        assert!(!remote_origin_allowed(Some("https://evil.example"), host));
        assert!(!remote_origin_allowed(
            Some("http://192.168.1.20:8080"),
            host
        ));
        assert!(!remote_origin_allowed(
            Some("http://192.168.1.20.evil.example:11471"),
            host
        ));
        assert!(!remote_origin_allowed(Some("null"), host));
        assert!(!remote_origin_allowed(Some("https://evil.example"), None));
    }
}
