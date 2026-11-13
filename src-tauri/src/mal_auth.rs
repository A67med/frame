use axum::extract::Query;
use axum::response::Html;
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex};

// Must match the App Redirect URL registered on the MAL client (MAL_REDIRECT_URI in src/lib/mal/config.ts).
const PORT: u16 = 47321;
const PATH: &str = "/harbor-mal";

const PAGE_OK: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>Frame</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#0d0f14;color:#e9ebf2}.c{text-align:center;max-width:380px;padding:32px}h1{font-size:21px;margin:0 0 10px;font-weight:600}p{color:#9aa1ad;font-size:14px;line-height:1.55;margin:0}</style></head><body><div class="c"><h1>You're signed in</h1><p>You can close this tab and head back to Frame.</p></div></body></html>"#;

const PAGE_FAIL: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>Frame</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;background:#0d0f14;color:#e9ebf2}.c{text-align:center;max-width:380px;padding:32px}p{color:#9aa1ad;font-size:14px;line-height:1.55}</style></head><body><div class="c"><p>MyAnimeList sent no sign-in code. Return to Frame and try again.</p></div></body></html>"#;

#[derive(Clone, Serialize)]
struct MalAuthPayload {
    code: String,
    state: String,
}

static ACTIVE: Mutex<Option<oneshot::Sender<()>>> = Mutex::const_new(None);

// Listens for MAL's redirect once; returns false when the port is taken, so the UI falls back to pasting the address.
#[tauri::command]
pub async fn mal_auth_start(app: AppHandle) -> Result<bool, String> {
    if let Some(previous) = ACTIVE.lock().await.take() {
        let _ = previous.send(());
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let listener = match TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], PORT))).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[harbor::mal_auth] port {} unavailable: {}", PORT, e);
            return Ok(false);
        }
    };

    let (tx, rx) = oneshot::channel::<()>();
    let done = Arc::new(Mutex::new(Some(tx)));
    let (stop_tx, stop_rx) = oneshot::channel::<()>();
    *ACTIVE.lock().await = Some(stop_tx);
    let app_handle = app.clone();

    let router = Router::new().route(
        PATH,
        get(move |Query(params): Query<HashMap<String, String>>| {
            let app = app_handle.clone();
            let done = done.clone();
            async move {
                let code = params.get("code").cloned().unwrap_or_default();
                if code.is_empty() {
                    return Html(PAGE_FAIL);
                }
                let state = params.get("state").cloned().unwrap_or_default();
                let _ = app.emit("mal-auth", MalAuthPayload { code, state });
                if let Some(sender) = done.lock().await.take() {
                    let _ = sender.send(());
                }
                Html(PAGE_OK)
            }
        }),
    );

    tokio::spawn(async move {
        let shutdown = async {
            tokio::select! {
                _ = rx => {}
                _ = stop_rx => {}
                _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {}
            }
        };
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown)
            .await;
    });

    Ok(true)
}
