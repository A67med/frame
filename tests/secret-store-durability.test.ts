import assert from "node:assert/strict";
import { test } from "node:test";

// Each case loads a fresh copy of the module (its store is module state) against
// a scripted native backend and an in-memory localStorage. Only synthetic values.

type Native = {
  file: string | null;
  failWrites: number;
  failRead?: boolean;
  writes: number;
};

const local = new Map<string, string>();
let native: Native;

(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => void local.set(k, String(v)),
  removeItem: (k: string) => void local.delete(k),
  clear: () => local.clear(),
  key: (i: number) => [...local.keys()][i] ?? null,
  get length() {
    return local.size;
  },
};

(globalThis as Record<string, unknown>).window = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string }) => {
      if (cmd === "secrets_read") {
        if (native.failRead) throw new Error("read denied");
        return native.file;
      }
      if (cmd === "secrets_write") {
        native.writes += 1;
        if (native.failWrites > 0) {
          native.failWrites -= 1;
          throw new Error("disk full");
        }
        native.file = args.content ?? null;
        return null;
      }
      throw new Error(`unexpected command ${cmd}`);
    },
    transformCallback: () => 0,
  },
};

let generation = 0;
async function freshStore() {
  generation += 1;
  return (await import(
    `../src/lib/secret-store.ts?case=${generation}`
  )) as typeof import("../src/lib/secret-store");
}

const KEY = "harbor.trakt.session.v1.default";
const OTHER = "harbor.simkl.session.v1.default";

function reset(file: Record<string, string> | null, failWrites = 0) {
  local.clear();
  native = { file: file ? JSON.stringify(file) : null, failWrites, writes: 0 };
}

test("migration keeps the localStorage copy when the native write fails", async () => {
  reset(null, 1);
  local.set(KEY, "synthetic-token-a");
  const secrets = await freshStore();
  await secrets.loadSecrets();
  assert.equal(native.writes, 1);
  assert.equal(native.file, null);
  assert.equal(local.get(KEY), "synthetic-token-a", "source copy must survive a failed write");
  assert.equal(secrets.getSecret(KEY), "synthetic-token-a");
});

test("a later launch retries the migration and only then removes the source", async () => {
  reset(null, 1);
  local.set(KEY, "synthetic-token-a");
  await (await freshStore()).loadSecrets();
  assert.equal(local.get(KEY), "synthetic-token-a");

  // Next launch: the disk accepts the write.
  const secrets = await freshStore();
  await secrets.loadSecrets();
  assert.deepEqual(JSON.parse(native.file ?? "{}"), { [KEY]: "synthetic-token-a" });
  assert.equal(local.has(KEY), false);
  assert.equal(secrets.getSecret(KEY), "synthetic-token-a");

  // And a third launch is a no-op: idempotent.
  const writesBefore = native.writes;
  await (await freshStore()).loadSecrets();
  assert.equal(native.writes, writesBefore);
});

test("flushSecrets rejects when the native store refuses the write", async () => {
  reset({});
  const secrets = await freshStore();
  await secrets.loadSecrets();
  native.failWrites = 1;
  secrets.setSecret(OTHER, "synthetic-token-b");
  await assert.rejects(secrets.flushSecrets(), { name: "SecretPersistError" });
  // The value was mirrored to localStorage so a restart still finds it.
  assert.equal(local.get(OTHER), "synthetic-token-b");

  // A retry that succeeds resolves and removes the fallback copy.
  await secrets.flushSecrets();
  assert.deepEqual(JSON.parse(native.file ?? "{}"), { [OTHER]: "synthetic-token-b" });
  assert.equal(local.has(OTHER), false);
});

test("a fallback copy left by a failed write wins over the older native value", async () => {
  reset({ [KEY]: "synthetic-old" });
  local.set(KEY, "synthetic-new");
  const secrets = await freshStore();
  await secrets.loadSecrets();
  assert.equal(secrets.getSecret(KEY), "synthetic-new");
  assert.deepEqual(JSON.parse(native.file ?? "{}"), { [KEY]: "synthetic-new" });
  assert.equal(local.has(KEY), false);
});

test("an unreadable native store is never overwritten and keeps localStorage", async () => {
  reset({ [KEY]: "synthetic-native" });
  native.failRead = true;
  local.set(OTHER, "synthetic-local");
  const secrets = await freshStore();
  await secrets.loadSecrets();
  assert.equal(native.writes, 0);
  assert.equal(local.get(OTHER), "synthetic-local");
  secrets.setSecret(OTHER, "synthetic-local-2");
  assert.equal(local.get(OTHER), "synthetic-local-2");
  await secrets.flushSecrets();
  assert.equal(native.writes, 0);
});

test("flushSecrets with nothing pending resolves without writing", async () => {
  reset({ [KEY]: "synthetic" });
  const secrets = await freshStore();
  await secrets.loadSecrets();
  await secrets.flushSecrets();
  assert.equal(native.writes, 0);
});
