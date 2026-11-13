use super::*;
use serde_json::json;

fn host() -> Value {
    json!({ "id": "host-1", "name": "Living room", "platform": "windows", "version": "0.3.0" })
}

fn replies(effects: &[Effect]) -> Vec<&Value> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Reply(v) => Some(v),
            _ => None,
        })
        .collect()
}

fn forwarded(effects: &[Effect]) -> Vec<Value> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Forward(raw) => serde_json::from_str(raw).ok(),
            _ => None,
        })
        .collect()
}

fn shown_code(effects: &[Effect]) -> String {
    effects
        .iter()
        .find_map(|e| match e {
            Effect::Emit(PAIR_EVENT, v) if v["action"] == "show" => {
                v["code"].as_str().map(str::to_string)
            }
            _ => None,
        })
        .expect("the code is shown on Frame's screen")
}

fn begin(session: &mut RemoteSession, auth: &mut RemoteAuth, now: u64) -> Vec<Effect> {
    let frame = json!({
        "t": "pair", "step": "begin", "id": "b1",
        "peer": { "id": "phone-1", "name": "Pixel", "platform": "android" }
    });
    session.on_text(&frame.to_string(), auth, &host(), now)
}

fn submit(session: &mut RemoteSession, auth: &mut RemoteAuth, code: &str, now: u64) -> Vec<Effect> {
    let frame = json!({ "t": "pair", "step": "code", "id": "c1", "code": code });
    session.on_text(&frame.to_string(), auth, &host(), now)
}

fn pair(auth: &mut RemoteAuth, client: u64, now: u64) -> String {
    let mut session = RemoteSession::new(client);
    let code = shown_code(&begin(&mut session, auth, now));
    let effects = submit(&mut session, auth, &code, now + 1);
    replies(&effects)[0]["token"]
        .as_str()
        .expect("pairing returns a token")
        .to_string()
}

#[test]
fn an_unpaired_socket_cannot_send_commands() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    let cmd = json!({ "t": "cmd", "id": "x", "command": { "action": "togglePlayback" } });
    let effects = session.on_text(&cmd.to_string(), &mut auth, &host(), 1_000);
    assert!(forwarded(&effects).is_empty(), "{effects:?}");
    assert_eq!(replies(&effects)[0]["ok"], json!(false));
    assert_eq!(replies(&effects)[0]["code"], json!("untrusted"));
    assert!(!session.authorized());
}

#[test]
fn an_origin_free_client_is_not_trusted_either() {
    // Native clients send no Origin header, so the socket's origin check
    // lets them in; the session still refuses them until they pair.
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    for raw in [
        json!({ "t": "cmd", "command": { "action": "setText", "text": "x" } }).to_string(),
        json!({ "t": "cmd", "command": { "action": "setProfile", "id": "kid" } }).to_string(),
        "not json".to_string(),
    ] {
        let effects = session.on_text(&raw, &mut auth, &host(), 1_000);
        assert!(forwarded(&effects).is_empty(), "{raw}: {effects:?}");
    }
}

#[test]
fn hello_says_pairing_is_required_and_is_not_forwarded() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    let hello = json!({ "t": "hello", "client": "harbor-remote", "proto": 1 });
    let effects = session.on_text(&hello.to_string(), &mut auth, &host(), 1_000);
    let reply = replies(&effects)[0];
    assert_eq!(reply["trust"], json!("v1"));
    assert_eq!(reply["paired"], json!(false));
    assert!(forwarded(&effects).is_empty());
}

#[test]
fn pairing_with_the_code_on_screen_trusts_the_device() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(7);
    let opened = begin(&mut session, &mut auth, 1_000);
    assert_eq!(replies(&opened)[0]["ok"], json!(true));
    assert_eq!(replies(&opened)[0]["len"], json!(CODE_LEN));
    let code = shown_code(&opened);
    assert_eq!(code.len(), CODE_LEN);
    assert!(
        replies(&opened)
            .iter()
            .all(|r| !r.to_string().contains(&code)),
        "the code never travels to the device"
    );

    let done = submit(&mut session, &mut auth, &code.to_lowercase(), 2_000);
    let reply = replies(&done)[0];
    assert_eq!(reply["ok"], json!(true));
    assert_eq!(reply["peer"]["id"], json!("host-1"));
    let token = reply["token"].as_str().unwrap();
    assert!(
        (8..=64).contains(&token.len()),
        "fits validToken in lan-trust.ts"
    );
    assert!(done.contains(&Effect::Authorized("phone-1".into())));
    assert!(session.authorized());

    let cmd = json!({ "t": "cmd", "command": { "action": "pause" } });
    let effects = session.on_text(&cmd.to_string(), &mut auth, &host(), 3_000);
    assert_eq!(forwarded(&effects).len(), 1);
    assert_eq!(auth.list()[0].name, "Pixel");
}

#[test]
fn a_saved_token_trusts_a_new_socket_and_is_stripped_before_forwarding() {
    let mut auth = RemoteAuth::in_memory();
    let token = pair(&mut auth, 1, 1_000);
    let mut later = RemoteSession::new(2);
    let cmd = json!({ "t": "cmd", "id": "q", "token": token, "command": { "action": "pause" } });
    let effects = later.on_text(&cmd.to_string(), &mut auth, &host(), 5_000);
    assert!(effects.contains(&Effect::Authorized("phone-1".into())));
    let sent = forwarded(&effects);
    assert_eq!(sent.len(), 1);
    assert!(sent[0].get("token").is_none(), "{sent:?}");
}

#[test]
fn a_wrong_or_forgotten_token_is_refused() {
    let mut auth = RemoteAuth::in_memory();
    let token = pair(&mut auth, 1, 1_000);
    let mut stranger = RemoteSession::new(2);
    let forged = json!({ "t": "cmd", "id": "q", "token": format!("{token}x"), "command": {} });
    let effects = stranger.on_text(&forged.to_string(), &mut auth, &host(), 2_000);
    assert!(forwarded(&effects).is_empty());
    assert_eq!(replies(&effects)[0]["code"], json!("untrusted"));

    assert!(auth.forget("phone-1"));
    let mut again = RemoteSession::new(3);
    let stale = json!({ "t": "hello", "token": token });
    let effects = again.on_text(&stale.to_string(), &mut auth, &host(), 3_000);
    assert_eq!(replies(&effects)[0]["paired"], json!(false));
    assert!(forwarded(&effects).is_empty());
}

#[test]
fn repeated_bad_tokens_disconnect_the_socket() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    let mut closed = false;
    for n in 0..=MAX_BAD_TOKENS {
        let frame = json!({ "t": "hello", "token": format!("guess-{n}-xxxxxxxx") });
        closed = session
            .on_text(&frame.to_string(), &mut auth, &host(), 1_000)
            .contains(&Effect::Close);
    }
    assert!(closed);
}

#[test]
fn wrong_codes_burn_the_code_after_a_few_tries() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    let code = shown_code(&begin(&mut session, &mut auth, 1_000));
    let wrong = if code == "00000000" {
        "11111111"
    } else {
        "00000000"
    };
    for _ in 1..MAX_CODE_FAILURES {
        let effects = submit(&mut session, &mut auth, wrong, 1_100);
        assert_eq!(replies(&effects)[0]["code"], json!("badCode"));
    }
    let last = submit(&mut session, &mut auth, wrong, 1_200);
    assert_eq!(replies(&last)[0]["code"], json!("expired"));
    assert!(last
        .iter()
        .any(|e| matches!(e, Effect::Emit(PAIR_EVENT, v) if v["action"] == "hide")));
    // The real code no longer works either.
    let late = submit(&mut session, &mut auth, &code, 1_300);
    assert_eq!(replies(&late)[0]["ok"], json!(false));
    assert!(!session.authorized());
}

#[test]
fn codes_expire() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    let code = shown_code(&begin(&mut session, &mut auth, 1_000));
    let effects = submit(&mut session, &mut auth, &code, 1_000 + CODE_TTL_MS);
    assert_eq!(replies(&effects)[0]["code"], json!("expired"));
    assert!(!session.authorized());
}

#[test]
fn another_socket_cannot_use_or_steal_a_pending_code() {
    let mut auth = RemoteAuth::in_memory();
    let mut owner = RemoteSession::new(1);
    let code = shown_code(&begin(&mut owner, &mut auth, 1_000));
    let mut other = RemoteSession::new(2);
    assert_eq!(
        replies(&begin(&mut other, &mut auth, 1_100))[0]["code"],
        json!("busy")
    );
    assert_eq!(
        replies(&submit(&mut other, &mut auth, &code, 1_200))[0]["code"],
        json!("busy")
    );
    assert!(!other.authorized());
}

#[test]
fn pairing_requests_are_rate_limited() {
    let mut auth = RemoteAuth::in_memory();
    let mut refused = false;
    for n in 0..=MAX_BEGINS_PER_WINDOW as u64 {
        let mut session = RemoteSession::new(10 + n);
        let effects = begin(&mut session, &mut auth, 1_000 + n);
        refused = replies(&effects)[0]["code"] == json!("busy");
        session.on_close(&mut auth);
    }
    assert!(refused);
}

#[test]
fn closing_the_socket_abandons_its_pairing() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    begin(&mut session, &mut auth, 1_000);
    let effects = session.on_close(&mut auth);
    assert!(matches!(&effects[0], Effect::Emit(PAIR_EVENT, v) if v["action"] == "hide"));
    assert!(!auth.pending_for(1));
}

#[test]
fn hand_off_frames_reach_frame_without_pairing() {
    let mut auth = RemoteAuth::in_memory();
    let mut session = RemoteSession::new(1);
    let frame = json!({ "t": "harborSetup", "proto": 1, "nonce": "n", "cmd": {} });
    let effects = session.on_text(&frame.to_string(), &mut auth, &host(), 1_000);
    assert_eq!(forwarded(&effects).len(), 1);
    assert!(!session.authorized());
}

#[test]
fn broadcasts_reach_only_paired_sockets_unless_public() {
    assert!(!delivers(false, false));
    assert!(delivers(false, true));
    assert!(delivers(true, false));
}

#[test]
fn listings_never_include_tokens() {
    let mut auth = RemoteAuth::in_memory();
    let token = pair(&mut auth, 1, 1_000);
    let listed = serde_json::to_string(&auth.list()).unwrap();
    assert!(!listed.contains(&token));
    assert!(!listed.contains(&hash_token(&token)));
}

#[test]
fn paired_devices_survive_a_restart_and_forget_all_clears_them() {
    let root = std::env::var_os("HARBOR_TEST_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(format!("remote-auth-{}", uuid::Uuid::new_v4()));
    let path = root.join("remote-devices.json");
    let token = {
        let mut auth = RemoteAuth::load(path.clone());
        pair(&mut auth, 1, 1_000)
    };
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(!text.contains(&token), "only the hash is stored");

    let mut reloaded = RemoteAuth::load(path.clone());
    assert_eq!(reloaded.verify(&token, 2_000).as_deref(), Some("phone-1"));
    assert_eq!(reloaded.forget_all(), vec!["phone-1".to_string()]);
    assert_eq!(RemoteAuth::load(path).verify(&token, 3_000), None);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn codes_use_only_unambiguous_symbols() {
    for _ in 0..200 {
        let code = random_code();
        assert_eq!(code.len(), CODE_LEN);
        assert_eq!(normalize_code(&code), code);
    }
    assert_eq!(normalize_code("ab-cd o1l"), "ABCD011");
}
