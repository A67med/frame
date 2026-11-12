import "./_indexeddb-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

// Synthetic data only. localStorage and the native commands are scripted so
// each failure can be injected at a known point of the restore.

const local = new Map<string, string>();
let refuseWritesTo: string | null = null;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (refuseWritesTo != null && k.startsWith(refuseWritesTo)) throw new Error("write denied");
    local.set(k, String(v));
  },
  removeItem: (k: string) => void local.delete(k),
  clear: () => local.clear(),
  key: (i: number) => [...local.keys()][i] ?? null,
  get length() {
    return local.size;
  },
};

const native = {
  secrets: "{}",
  failSecretWrites: false,
  failSafetyCopy: false,
  safetyCopies: [] as string[],
};

(globalThis as Record<string, unknown>).window = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: unknown) => clearTimeout(id as never),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  __TAURI_INTERNALS__: {
    transformCallback: () => 0,
    invoke: async (cmd: string, args: { content?: string }) => {
      switch (cmd) {
        case "secrets_read":
          return native.secrets;
        case "secrets_write":
          if (native.failSecretWrites) throw new Error("disk full");
          native.secrets = args.content ?? "{}";
          return null;
        case "backup_save_safety_copy":
          if (native.failSafetyCopy) throw new Error("disk full");
          native.safetyCopies.push(args.content ?? "");
          return `C:/synthetic/backups/pre-restore-${native.safetyCopies.length}.framex`;
        default:
          throw new Error(`unexpected command ${cmd}`);
      }
    },
  },
};

const backupModule = await import("../src/lib/backup.ts");
const crypto = await import("../src/lib/backup-crypto.ts");
const secrets = await import("../src/lib/secret-store.ts");
await secrets.loadSecrets();
const { applyBackup, parseBackup, previewRestore, BackupRestoreError, buildBackup } = backupModule;

function file(extra: Record<string, unknown>) {
  return JSON.stringify({
    format: "harbor-backup",
    version: 1,
    app: "0.2.0",
    exportedAt: "2026-11-01T00:00:00.000Z",
    data: { "harbor.search.recent.default": '["synthetic"]' },
    sections: ["searchHistory"],
    ...extra,
  });
}

function reset() {
  local.clear();
  refuseWritesTo = null;
  native.failSecretWrites = false;
  native.failSafetyCopy = false;
  native.safetyCopies = [];
}

test("backups from a newer format version are rejected before restore", () => {
  const parsed = parseBackup(file({ version: 2 }));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error, /newer version of Frame/);
});

test("malformed version, array data and damaged library are rejected", () => {
  for (const bad of [
    file({ version: "1" }),
    file({ version: 0 }),
    file({ version: 1.5 }),
    file({ data: { "harbor.library.local.v1": "{not an array" } }),
  ]) {
    const parsed = parseBackup(bad);
    assert.equal(parsed.ok, false, bad);
  }
  assert.equal(parseBackup(file({ data: ["harbor.x"] })).ok, false);
});

test("oversized files are refused without parsing", () => {
  const huge = " ".repeat(backupModule.MAX_BACKUP_TEXT_LENGTH + 1);
  assert.deepEqual(parseBackup(huge), { ok: false, error: "This backup is too large to restore." });
});

test("files without a version still restore as version 1", () => {
  const legacy = JSON.parse(file({}));
  delete legacy.version;
  assert.equal(parseBackup(JSON.stringify(legacy)).ok, true);
});

test("legacy full backups preview the entries they will remove", () => {
  reset();
  local.set("harbor.search.recent.default", '["old"]');
  local.set("harbor.search.recent.p_abc_def", '["other profile"]');
  local.set("harbor.settings.default", "{}");
  const legacy = JSON.parse(file({}));
  delete legacy.sections;
  const parsed = parseBackup(JSON.stringify(legacy));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const preview = previewRestore(parsed.backup);
  assert.equal(preview.replacesWholeSections, true);
  // Only the search section is covered; the other profile's entry is removed,
  // settings are not touched.
  assert.equal(preview.removes, 1);
  // Previewing wrote nothing.
  assert.equal(local.get("harbor.search.recent.default"), '["old"]');
});

test("sectioned backups never remove anything", () => {
  reset();
  local.set("harbor.search.recent.p_abc_def", '["other"]');
  const parsed = parseBackup(file({}));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(previewRestore(parsed.backup), {
    entries: 1,
    replacesWholeSections: false,
    removes: 0,
  });
});

test("a refused write rolls every touched key back and throws", async () => {
  reset();
  local.set("harbor.search.recent.default", '["before"]');
  local.set("harbor.player.volume", "50");
  const parsed = parseBackup(
    file({
      data: {
        "harbor.search.recent.default": '["after"]',
        "harbor.player.volume": "90",
        "harbor.player.layout.new": "{}",
      },
      sections: ["searchHistory", "playerLayouts"],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  refuseWritesTo = "harbor.player.layout.new";
  await assert.rejects(applyBackup(parsed.backup), (error: unknown) => {
    assert.ok(error instanceof BackupRestoreError);
    assert.equal(error.reason, "storage-refused");
    assert.equal(error.rolledBack, true);
    assert.deepEqual(error.failedKeys, ["harbor.player.layout.new"]);
    return true;
  });
  refuseWritesTo = null;
  assert.equal(local.get("harbor.search.recent.default"), '["before"]');
  assert.equal(local.get("harbor.player.volume"), "50");
  assert.equal(local.has("harbor.player.layout.new"), false);
  assert.equal(native.safetyCopies.length, 1, "a safety copy is written before the restore");
});

test("no write happens when the safety copy cannot be saved", async () => {
  reset();
  local.set("harbor.search.recent.default", '["before"]');
  native.failSafetyCopy = true;
  const parsed = parseBackup(file({ data: { "harbor.search.recent.default": '["after"]' } }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  await assert.rejects(applyBackup(parsed.backup), { name: "BackupRestoreError" });
  assert.equal(local.get("harbor.search.recent.default"), '["before"]');
});

test("sign-ins that cannot be saved roll the restore back", async () => {
  reset();
  local.set("harbor.search.recent.default", '["before"]');
  const parsed = parseBackup(
    file({
      data: {
        "harbor.search.recent.default": '["after"]',
        "harbor.trakt.session.v1.default": '{"synthetic":true}',
      },
      sections: ["searchHistory", "sessions"],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  native.failSecretWrites = true;
  await assert.rejects(applyBackup(parsed.backup), (error: unknown) => {
    assert.ok(error instanceof BackupRestoreError);
    assert.equal(error.reason, "secrets-not-saved");
    return true;
  });
  native.failSecretWrites = false;
  assert.equal(local.get("harbor.search.recent.default"), '["before"]');
  assert.equal(secrets.getSecret("harbor.trakt.session.v1.default"), null);
});

test("a successful restore reports where the safety copy went", async () => {
  reset();
  const parsed = parseBackup(file({}));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const result = await applyBackup(parsed.backup);
  assert.match(result.safetyCopyPath ?? "", /pre-restore-1\.framex$/);
  assert.equal(local.get("harbor.search.recent.default"), '["synthetic"]');
  const copy = JSON.parse(native.safetyCopies[0]);
  assert.equal(copy.format, "harbor-backup");
});

test("exports hold only app-managed keys, never media files", async () => {
  reset();
  local.set("harbor.search.recent.default", '["x"]');
  local.set("unrelated.key", "y");
  const backup = await buildBackup(["searchHistory"]);
  for (const key of Object.keys(backup.data)) assert.ok(key.startsWith("harbor."), key);
  assert.equal(backup.data["unrelated.key"], undefined);
});

// Low iteration count keeps the suite fast; the default is 600,000.
const FAST = 100_000;

test("encrypted backups round-trip and restore through the normal parser", async () => {
  const plain = file({});
  const sealed = await crypto.encryptBackupText(plain, "correct horse", FAST);
  assert.equal(crypto.isEncryptedBackup(sealed), true);
  assert.equal(crypto.isEncryptedBackup(plain), false);
  assert.equal(sealed.includes("synthetic"), false, "plaintext must not leak");
  assert.equal(parseBackup(sealed).ok, false, "envelopes are not plain backups");
  const opened = await crypto.decryptBackupText(sealed, "correct horse");
  assert.equal(opened, plain);
  assert.equal(parseBackup(opened).ok, true);
});

test("wrong passwords and tampered envelopes fail authentication", async () => {
  const sealed = await crypto.encryptBackupText(file({}), "correct horse", FAST);
  await assert.rejects(crypto.decryptBackupText(sealed, "wrong horse!"), {
    reason: "wrong-password-or-damaged",
  });

  const env = JSON.parse(sealed);
  const bytes = Buffer.from(env.ciphertext, "base64");
  bytes[0] ^= 1;
  await assert.rejects(
    crypto.decryptBackupText(
      JSON.stringify({ ...env, ciphertext: bytes.toString("base64") }),
      "correct horse",
    ),
    { reason: "wrong-password-or-damaged" },
  );

  // Changing a header field breaks the authenticated data even with the right password.
  const iv = Buffer.from(env.cipher.iv, "base64");
  iv[0] ^= 1;
  await assert.rejects(
    crypto.decryptBackupText(
      JSON.stringify({ ...env, cipher: { ...env.cipher, iv: iv.toString("base64") } }),
      "correct horse",
    ),
    { reason: "wrong-password-or-damaged" },
  );
  await assert.rejects(
    crypto.decryptBackupText(
      JSON.stringify({ ...env, kdf: { ...env.kdf, iterations: FAST + 1 } }),
      "correct horse",
    ),
    { reason: "wrong-password-or-damaged" },
  );
});

test("unsupported, truncated and resource-heavy envelopes are refused", async () => {
  const sealed = JSON.parse(await crypto.encryptBackupText(file({}), "correct horse", FAST));
  await assert.rejects(
    crypto.decryptBackupText(JSON.stringify({ ...sealed, version: 2 }), "correct horse"),
    { reason: "unsupported-version" },
  );
  await assert.rejects(
    crypto.decryptBackupText(
      JSON.stringify({ ...sealed, kdf: { ...sealed.kdf, iterations: 50_000_000 } }),
      "x",
    ),
    {
      reason: "malformed",
    },
  );
  await assert.rejects(
    crypto.decryptBackupText(
      JSON.stringify({ ...sealed, kdf: { ...sealed.kdf, iterations: 1000 } }),
      "x",
    ),
    {
      reason: "malformed",
    },
  );
  const truncated = { ...sealed, ciphertext: sealed.ciphertext.slice(0, 8) };
  await assert.rejects(crypto.decryptBackupText(JSON.stringify(truncated), "correct horse"), {
    reason: "wrong-password-or-damaged",
  });
  await assert.rejects(crypto.decryptBackupText("{not json", "x"), { reason: "malformed" });
});

test("short passwords are refused at export", async () => {
  assert.equal(crypto.backupPasswordProblem("short"), "too-short");
  await assert.rejects(crypto.encryptBackupText("{}", "short"));
});
