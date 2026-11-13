//! Pairing and authorization for LAN remote-control clients.
//!
//! Every socket on `/api/remote` starts untrusted. A device becomes trusted
//! by presenting a token it received when it paired, and pairing needs the
//! code this computer shows on its own screen, so only someone who can see
//! that screen can add a device. Tokens are stored as SHA-256 hashes.
//!
//! The wire format is the one `src/lib/lan-trust.ts` already speaks:
//! `{t:"pair", step:"begin"|"code"|"cancel", id, peer, code}` answered by
//! `{t:"ack", id, ok, code?, token?, expiresAt?, len?, peer?}`.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

pub const CODE_LEN: usize = 8;
pub const CODE_TTL_MS: u64 = 120_000;
/// Wrong codes allowed before the code is burned and pairing starts over.
pub const MAX_CODE_FAILURES: u32 = 5;
/// Wrong tokens one socket may present before it is disconnected.
pub const MAX_BAD_TOKENS: u32 = 5;
const MAX_DEVICES: usize = 32;
const BEGIN_WINDOW_MS: u64 = 60_000;
const MAX_BEGINS_PER_WINDOW: usize = 6;
const LAST_SEEN_PERSIST_MS: u64 = 10 * 60_000;
/// Matches `REMOTE_PROTO` in src/lib/remote/protocol.ts.
pub const REMOTE_PROTO: u64 = 1;
/// Digits and capitals without I, L and O, which `normalizePairCode` in
/// src/lib/lan-trust.ts folds into 1, 1 and 0.
const CODE_ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTUVWXYZ";
const DEVICES_FILE: &str = "remote-devices.json";
pub const PAIR_EVENT: &str = "remote://pair";

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct PeerInfo {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub version: String,
}

impl PeerInfo {
    fn from_value(value: Option<&Value>) -> Self {
        let mut peer: PeerInfo = value
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        peer.id = clip(&peer.id, 64);
        peer.name = clip(&peer.name, 80);
        peer.platform = clip(&peer.platform, 32);
        peer.version = clip(&peer.version, 32);
        peer
    }
}

fn clip(value: &str, max: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    id: String,
    name: String,
    platform: String,
    token_hash: String,
    paired_at: u64,
    last_seen: u64,
}

/// What the settings screen shows; never the token or its hash.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub paired_at: u64,
    pub last_seen: u64,
}

#[derive(Clone, Debug)]
struct Pending {
    code: String,
    expires_at: u64,
    failures: u32,
    client_id: u64,
    peer: PeerInfo,
}

#[derive(Debug, PartialEq)]
pub struct PairOffer {
    pub code: String,
    pub expires_at: u64,
}

#[derive(Debug, PartialEq)]
pub struct Paired {
    pub token: String,
    pub device_id: String,
    pub name: String,
}

#[derive(Debug, Default)]
pub struct RemoteAuth {
    path: Option<PathBuf>,
    devices: Vec<Device>,
    pending: Option<Pending>,
    begins: Vec<u64>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 32 bytes from the OS random source (uuid v4 reads getrandom), mixed so
/// the fixed version bits of the UUIDs do not show through.
fn random_bytes() -> [u8; 32] {
    let mut hasher = Sha256::new();
    for _ in 0..3 {
        hasher.update(uuid::Uuid::new_v4().as_bytes());
    }
    hasher.finalize().into()
}

fn random_code() -> String {
    let mut out = String::with_capacity(CODE_LEN);
    // Rejection sampling keeps every symbol equally likely.
    let limit = (256 / CODE_ALPHABET.len() * CODE_ALPHABET.len()) as u8;
    while out.len() < CODE_LEN {
        for byte in random_bytes() {
            if byte < limit {
                out.push(CODE_ALPHABET[byte as usize % CODE_ALPHABET.len()] as char);
                if out.len() == CODE_LEN {
                    break;
                }
            }
        }
    }
    out
}

fn random_token() -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random_bytes())
}

fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn same(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Same folding as `normalizePairCode` in src/lib/lan-trust.ts.
pub fn normalize_code(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| match c.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        })
        .collect()
}

impl RemoteAuth {
    /// An in-memory store, for tests.
    pub fn in_memory() -> Self {
        Self::default()
    }

    pub fn load(path: PathBuf) -> Self {
        let devices = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Vec<Device>>(&text).ok())
            .unwrap_or_default();
        Self {
            path: Some(path),
            devices,
            ..Self::default()
        }
    }

    fn save(&self) {
        let Some(path) = &self.path else {
            return;
        };
        let Ok(text) = serde_json::to_string_pretty(&self.devices) else {
            return;
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, text).is_ok() && std::fs::rename(&tmp, path).is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
    }

    /// The device a token belongs to, or `None` for an unknown token.
    pub fn verify(&mut self, token: &str, now: u64) -> Option<String> {
        if token.is_empty() || token.len() > 128 {
            return None;
        }
        let hash = hash_token(token);
        let index = self
            .devices
            .iter()
            .position(|d| same(d.token_hash.as_bytes(), hash.as_bytes()))?;
        let device = &mut self.devices[index];
        let stale = now.saturating_sub(device.last_seen) > LAST_SEEN_PERSIST_MS;
        device.last_seen = now;
        let id = device.id.clone();
        if stale {
            self.save();
        }
        Some(id)
    }

    fn expire(&mut self, now: u64) {
        if self.pending.as_ref().is_some_and(|p| now >= p.expires_at) {
            self.pending = None;
        }
    }

    pub fn pending_for(&self, client_id: u64) -> bool {
        self.pending
            .as_ref()
            .is_some_and(|p| p.client_id == client_id)
    }

    pub fn begin(
        &mut self,
        client_id: u64,
        peer: PeerInfo,
        now: u64,
    ) -> Result<PairOffer, &'static str> {
        self.expire(now);
        if self
            .pending
            .as_ref()
            .is_some_and(|p| p.client_id != client_id)
        {
            return Err("busy");
        }
        self.begins
            .retain(|at| now.saturating_sub(*at) < BEGIN_WINDOW_MS);
        if self.begins.len() >= MAX_BEGINS_PER_WINDOW {
            return Err("busy");
        }
        self.begins.push(now);
        let offer = PairOffer {
            code: random_code(),
            expires_at: now + CODE_TTL_MS,
        };
        self.pending = Some(Pending {
            code: offer.code.clone(),
            expires_at: offer.expires_at,
            failures: 0,
            client_id,
            peer,
        });
        Ok(offer)
    }

    pub fn submit(&mut self, client_id: u64, code: &str, now: u64) -> Result<Paired, &'static str> {
        self.expire(now);
        let Some(pending) = self.pending.as_mut() else {
            return Err("expired");
        };
        if pending.client_id != client_id {
            return Err("busy");
        }
        let typed = normalize_code(code);
        if !same(typed.as_bytes(), pending.code.as_bytes()) {
            pending.failures += 1;
            if pending.failures >= MAX_CODE_FAILURES {
                self.pending = None;
                return Err("expired");
            }
            return Err("badCode");
        }
        let pending = self.pending.take().expect("checked above");
        let token = random_token();
        let device_id = if pending.peer.id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            pending.peer.id.clone()
        };
        let name = if pending.peer.name.is_empty() {
            "Unnamed device".to_string()
        } else {
            pending.peer.name.clone()
        };
        self.devices.retain(|d| d.id != device_id);
        self.devices.push(Device {
            id: device_id.clone(),
            name: name.clone(),
            platform: pending.peer.platform.clone(),
            token_hash: hash_token(&token),
            paired_at: now,
            last_seen: now,
        });
        if self.devices.len() > MAX_DEVICES {
            self.devices.sort_by_key(|d| std::cmp::Reverse(d.last_seen));
            self.devices.truncate(MAX_DEVICES);
        }
        self.save();
        Ok(Paired {
            token,
            device_id,
            name,
        })
    }

    /// Ends the pending pairing, or only `client_id`'s when given. True when
    /// one was ended.
    pub fn cancel(&mut self, client_id: Option<u64>) -> bool {
        let matches = match (&self.pending, client_id) {
            (Some(p), Some(id)) => p.client_id == id,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if matches {
            self.pending = None;
        }
        matches
    }

    pub fn list(&self) -> Vec<PairedDevice> {
        let mut rows: Vec<PairedDevice> = self
            .devices
            .iter()
            .map(|d| PairedDevice {
                id: d.id.clone(),
                name: d.name.clone(),
                platform: d.platform.clone(),
                paired_at: d.paired_at,
                last_seen: d.last_seen,
            })
            .collect();
        rows.sort_by_key(|d| std::cmp::Reverse(d.paired_at));
        rows
    }

    pub fn forget(&mut self, id: &str) -> bool {
        let before = self.devices.len();
        self.devices.retain(|d| d.id != id);
        let removed = self.devices.len() != before;
        if removed {
            self.save();
        }
        removed
    }

    pub fn forget_all(&mut self) -> Vec<String> {
        let ids = self.devices.iter().map(|d| d.id.clone()).collect();
        self.devices.clear();
        self.save();
        ids
    }
}

/// What the socket handler should do after a frame.
#[derive(Debug, PartialEq)]
pub enum Effect {
    /// Send this frame to the sending socket only.
    Reply(Value),
    /// Hand this frame to Frame's own interface as `remote://cmd`.
    Forward(String),
    /// Emit an event to Frame's own interface.
    Emit(&'static str, Value),
    /// The socket is now trusted as this device.
    Authorized(String),
    /// Disconnect the socket.
    Close,
}

/// Per-socket gatekeeper. It decides, frame by frame, what an untrusted or a
/// paired client may do. It does no I/O, so tests can drive it directly.
#[derive(Debug)]
pub struct RemoteSession {
    client_id: u64,
    authorized: bool,
    bad_tokens: u32,
}

fn ack(id: &Value, ok: bool) -> serde_json::Map<String, Value> {
    let mut frame = serde_json::Map::new();
    frame.insert("t".into(), json!("ack"));
    frame.insert("id".into(), id.clone());
    frame.insert("ok".into(), json!(ok));
    frame
}

fn refusal(id: &Value, code: &str) -> Value {
    let mut frame = ack(id, false);
    frame.insert("code".into(), json!(code));
    Value::Object(frame)
}

impl RemoteSession {
    pub fn new(client_id: u64) -> Self {
        Self {
            client_id,
            authorized: false,
            bad_tokens: 0,
        }
    }

    pub fn authorized(&self) -> bool {
        self.authorized
    }

    /// The device this socket paired as was forgotten.
    pub fn revoke(&mut self) {
        self.authorized = false;
    }

    pub fn on_text(
        &mut self,
        raw: &str,
        auth: &mut RemoteAuth,
        host: &Value,
        now: u64,
    ) -> Vec<Effect> {
        let mut frame = match serde_json::from_str::<Value>(raw) {
            Ok(Value::Object(map)) => map,
            // Malformed text: Frame answers paired clients with an error, and
            // untrusted ones get nothing.
            _ if self.authorized => return vec![Effect::Forward(raw.to_string())],
            _ => return Vec::new(),
        };
        let kind = frame
            .get("t")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let id = frame.get("id").cloned().unwrap_or(json!(""));
        let mut effects = Vec::new();

        if let Some(token) = frame.remove("token") {
            if !self.authorized {
                match token.as_str().and_then(|t| auth.verify(t, now)) {
                    Some(device) => {
                        self.authorized = true;
                        effects.push(Effect::Authorized(device));
                    }
                    None => {
                        self.bad_tokens += 1;
                        if self.bad_tokens > MAX_BAD_TOKENS {
                            return vec![Effect::Close];
                        }
                    }
                }
            }
        }

        match kind.as_str() {
            "pair" => effects.extend(self.on_pair(&frame, &id, auth, host, now)),
            "hello" => {
                effects.push(Effect::Reply(json!({
                    "t": "hello",
                    "proto": REMOTE_PROTO,
                    "server": "harbor-remote",
                    "trust": "v1",
                    "paired": self.authorized,
                })));
                if self.authorized {
                    effects.push(Effect::Forward(Value::Object(frame).to_string()));
                }
            }
            // The TV setup hand-off carries its own one-time token, which
            // Frame checks before it accepts anything from the phone.
            "harborSetup" => effects.push(Effect::Forward(Value::Object(frame).to_string())),
            _ if self.authorized => effects.push(Effect::Forward(Value::Object(frame).to_string())),
            _ => {
                if frame.contains_key("id") {
                    effects.push(Effect::Reply(refusal(&id, "untrusted")));
                }
                effects.push(Effect::Reply(json!({
                    "t": "error",
                    "code": "untrusted",
                    "message": "Pair this device with Frame first.",
                })));
            }
        }
        effects
    }

    fn on_pair(
        &mut self,
        frame: &serde_json::Map<String, Value>,
        id: &Value,
        auth: &mut RemoteAuth,
        host: &Value,
        now: u64,
    ) -> Vec<Effect> {
        match frame.get("step").and_then(Value::as_str).unwrap_or("") {
            "begin" => {
                let peer = PeerInfo::from_value(frame.get("peer"));
                match auth.begin(self.client_id, peer.clone(), now) {
                    Ok(offer) => {
                        let mut reply = ack(id, true);
                        reply.insert("expiresAt".into(), json!(offer.expires_at));
                        reply.insert("len".into(), json!(CODE_LEN));
                        vec![
                            Effect::Reply(Value::Object(reply)),
                            Effect::Emit(
                                PAIR_EVENT,
                                json!({
                                    "action": "show",
                                    "code": offer.code,
                                    "expiresAt": offer.expires_at,
                                    "name": peer.name,
                                    "platform": peer.platform,
                                }),
                            ),
                        ]
                    }
                    Err(code) => vec![Effect::Reply(refusal(id, code))],
                }
            }
            "code" => {
                let code = frame.get("code").and_then(Value::as_str).unwrap_or("");
                match auth.submit(self.client_id, code, now) {
                    Ok(paired) => {
                        self.authorized = true;
                        let mut reply = ack(id, true);
                        reply.insert("token".into(), json!(paired.token));
                        reply.insert("peer".into(), host.clone());
                        vec![
                            Effect::Reply(Value::Object(reply)),
                            Effect::Emit(
                                PAIR_EVENT,
                                json!({ "action": "hide", "reason": "paired", "name": paired.name }),
                            ),
                            Effect::Authorized(paired.device_id),
                        ]
                    }
                    Err(code) => {
                        let mut effects = vec![Effect::Reply(refusal(id, code))];
                        if code != "busy" && !auth.pending_for(self.client_id) {
                            effects.push(Effect::Emit(
                                PAIR_EVENT,
                                json!({ "action": "hide", "reason": "failed" }),
                            ));
                        }
                        effects
                    }
                }
            }
            "cancel" => {
                let mut effects = vec![Effect::Reply(Value::Object(ack(id, true)))];
                if auth.cancel(Some(self.client_id)) {
                    effects.push(Effect::Emit(
                        PAIR_EVENT,
                        json!({ "action": "hide", "reason": "cancelled" }),
                    ));
                }
                effects
            }
            _ => vec![Effect::Reply(refusal(id, "badRequest"))],
        }
    }

    /// The socket closed: an unfinished pairing from it is abandoned.
    pub fn on_close(&mut self, auth: &mut RemoteAuth) -> Vec<Effect> {
        if auth.cancel(Some(self.client_id)) {
            vec![Effect::Emit(
                PAIR_EVENT,
                json!({ "action": "hide", "reason": "cancelled" }),
            )]
        } else {
            Vec::new()
        }
    }
}

/// Whether a frame Frame broadcasts reaches this socket. Public frames are
/// the hand-off offers, which carry no secrets; everything else (library,
/// playback state, the metadata keys the phone remote needs) is for paired
/// devices only.
pub fn delivers(public: bool, authorized: bool) -> bool {
    public || authorized
}

pub fn shared(app: &AppHandle) -> &'static Mutex<RemoteAuth> {
    static AUTH: OnceLock<Mutex<RemoteAuth>> = OnceLock::new();
    AUTH.get_or_init(|| {
        let auth = match app.path().app_data_dir() {
            Ok(dir) => RemoteAuth::load(dir.join(DEVICES_FILE)),
            Err(_) => RemoteAuth::in_memory(),
        };
        Mutex::new(auth)
    })
}

#[tauri::command]
pub fn remote_devices_list(app: AppHandle) -> Vec<PairedDevice> {
    shared(&app)
        .lock()
        .map(|auth| auth.list())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn remote_device_forget(app: AppHandle, id: String) -> Result<bool, String> {
    let removed = shared(&app).lock().map_err(|e| e.to_string())?.forget(&id);
    if removed {
        crate::web_server::disconnect_devices(&[id]).await;
    }
    Ok(removed)
}

#[tauri::command]
pub async fn remote_devices_forget_all(app: AppHandle) -> Result<usize, String> {
    let ids = shared(&app).lock().map_err(|e| e.to_string())?.forget_all();
    crate::web_server::disconnect_devices(&ids).await;
    Ok(ids.len())
}

#[tauri::command]
pub fn remote_pair_cancel(app: AppHandle) {
    let cancelled = shared(&app)
        .lock()
        .map(|mut auth| auth.cancel(None))
        .unwrap_or(false);
    if cancelled {
        let _ = app.emit(
            PAIR_EVENT,
            json!({ "action": "hide", "reason": "cancelled" }),
        );
    }
}

#[cfg(test)]
#[path = "remote_auth_tests.rs"]
mod tests;
