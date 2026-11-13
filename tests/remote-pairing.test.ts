import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  deviceNameFromAgent,
  forgetRemoteToken,
  pairAckOf,
  pairErrorText,
  pairPhaseAfterHello,
  readRemoteToken,
  remoteDeviceIdentity,
  saveRemoteToken,
} from "../src/lib/remote/pairing.ts";
import { normalizePairCode, validToken } from "../src/lib/lan-trust.ts";
import { REMOTE_PROTO } from "../src/lib/remote/protocol.ts";

const rust = readFileSync("src-tauri/src/remote_auth.rs", "utf8");

test("Frame's hello decides whether the phone must pair", () => {
  const checking = { phase: "checking" as const };
  assert.equal(
    pairPhaseAfterHello(checking, { t: "hello", trust: "v1", paired: true }).phase,
    "paired",
  );
  assert.equal(
    pairPhaseAfterHello(checking, { t: "hello", trust: "v1", paired: false }).phase,
    "needed",
  );
  // A Frame from before pairing sends a plain hello and takes commands as before.
  assert.equal(
    pairPhaseAfterHello(checking, { t: "hello", server: "harbor-remote" }).phase,
    "paired",
  );
  // The plain hello Frame broadcasts after pairing never undoes "needed".
  assert.equal(
    pairPhaseAfterHello({ phase: "needed" }, { t: "hello", server: "harbor-remote" }).phase,
    "needed",
  );
});

test("a reconnect mid-pairing keeps the code form open", () => {
  const entering = { phase: "entering" as const, expiresAt: 10, len: 8 };
  assert.deepEqual(
    pairPhaseAfterHello(entering, { t: "hello", trust: "v1", paired: false }),
    entering,
  );
});

test("acks map to a result, and silence is a failure", () => {
  assert.deepEqual(pairAckOf({ t: "ack", ok: true }), { ok: true });
  assert.deepEqual(pairAckOf({ t: "ack", ok: false, code: "badCode" }), {
    ok: false,
    code: "badCode",
  });
  assert.deepEqual(pairAckOf(null), { ok: false, code: "no-response" });
  for (const code of ["badCode", "expired", "busy", "interrupted", "no-response", "other"]) {
    assert.ok(pairErrorText(code), code);
  }
  assert.equal(pairErrorText(undefined), null);
});

test("tokens are kept per Frame and can be forgotten", () => {
  saveRemoteToken("192.168.1.20", "token-aaaaaaaa");
  saveRemoteToken("192.168.1.30", "token-bbbbbbbb");
  assert.equal(readRemoteToken("192.168.1.20"), "token-aaaaaaaa");
  forgetRemoteToken("192.168.1.20");
  assert.equal(readRemoteToken("192.168.1.20"), null);
  assert.equal(readRemoteToken("192.168.1.30"), "token-bbbbbbbb");
});

test("the phone names itself and keeps one id", () => {
  assert.equal(deviceNameFromAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "iPhone");
  assert.equal(
    deviceNameFromAgent("Mozilla/5.0 (Linux; Android 14) Mobile Safari"),
    "Android phone",
  );
  assert.equal(deviceNameFromAgent("curl/8.0"), "Browser");
  const first = remoteDeviceIdentity();
  assert.ok(first.id.length >= 8);
  assert.equal(remoteDeviceIdentity().id, first.id);
});

test("codes Frame shows survive the phone's normalization", () => {
  const alphabet = /const CODE_ALPHABET: &\[u8\] = b"([0-9A-Z]+)";/.exec(rust)?.[1];
  assert.ok(alphabet, "found CODE_ALPHABET in remote_auth.rs");
  for (const ch of alphabet) assert.equal(normalizePairCode(ch), ch, ch);
  for (const ambiguous of ["I", "L", "O"]) assert.ok(!alphabet.includes(ambiguous), ambiguous);
  const len = Number(/pub const CODE_LEN: usize = (\d+);/.exec(rust)?.[1]);
  assert.equal(len, 8);
});

test("Rust and the app agree on the protocol version", () => {
  const proto = Number(/pub const REMOTE_PROTO: u64 = (\d+);/.exec(rust)?.[1]);
  assert.equal(proto, REMOTE_PROTO);
  // Frame mints base64url tokens of 32 bytes: 43 characters with - and _, which lan-trust.ts accepts.
  assert.ok(validToken("q7-Xc_0aZbYw4Lk9N2mRtV8sJpHfGdE3uIoQ1yW6nBe"));
});

test("only hand-off offers are broadcast to devices that have not paired", () => {
  const host = readFileSync("src/lib/remote/host-mount.tsx", "utf8");
  const handoff = readFileSync("src/lib/tv-handoff/handoff-host.ts", "utf8");
  assert.doesNotMatch(host, /public:\s*true/);
  assert.match(
    handoff,
    /remote_ws_broadcast", \{ payload: JSON\.stringify\(msg\), public: true \}/,
  );
});
