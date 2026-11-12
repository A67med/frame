import { invoke } from "@tauri-apps/api/core";

const SECRET_PREFIXES = [
  "harbor.lastfm.v1",
  "harbor.sports.api-sports.v1",
  "harbor.simkl.session.v1",
  "harbor.trakt.session.v1",
  "harbor.mal.session.v1",
  "harbor.anilist.session.v1",
  "harbor.media-server.token.v1",
  "harbor.plex-auth.device.v1",
  "harbor.lastfm.v1",
];

let store: Record<string, string> = {};
let rustAvailable = false;
let loaded = false;
let persistTimer: number | null = null;
let retryTimer: number | null = null;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
let retryDelayMs = RETRY_BASE_MS;
let lastPersistError: unknown = null;
/** Keys changed in memory since the last write that reached disk. */
const unsaved = new Set<string>();

/** Thrown by flushSecrets when the native store did not accept the write. */
export class SecretPersistError extends Error {
  constructor(cause: unknown) {
    super(`secrets_write failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "SecretPersistError";
  }
}

export function isSecretKey(key: string): boolean {
  return SECRET_PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
}

/** Rewrites a session key so it targets a specific profile, used when restoring a backup. */
export function secretKeyForProfile(key: string, profileId: string): string {
  for (const prefix of SECRET_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return `${prefix}.${profileId}`;
  }
  return key;
}

/** Snapshot of the Rust-persisted secret store, for backup/export use. */
export function getAllSecrets(): Record<string, string> {
  return { ...store };
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes the whole store to the native file. A localStorage copy of a key is
 * only dropped after the write that contains it succeeded, and keys whose write
 * failed are mirrored back to localStorage so they survive a restart; the next
 * loadSecrets() picks them up again.
 */
async function persist(): Promise<boolean> {
  if (!rustAvailable) return true;
  const written = new Map<string, string | undefined>();
  for (const key of unsaved) written.set(key, store[key]);
  unsaved.clear();
  try {
    await invoke("secrets_write", { content: JSON.stringify(store) });
  } catch (error) {
    for (const [key, value] of written) {
      unsaved.add(key);
      try {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        /* localStorage is the fallback; nothing more can be done here */
      }
    }
    lastPersistError = error;
    scheduleRetry();
    return false;
  }
  lastPersistError = null;
  retryDelayMs = RETRY_BASE_MS;
  for (const [key, value] of written) {
    // Leave a copy that was changed again after this write started alone.
    if (unsaved.has(key)) continue;
    if (value != null && readLocal(key) !== value) continue;
    try {
      localStorage.removeItem(key);
    } catch {
      /* the copy equals the saved value, so loading it again changes nothing */
    }
  }
  return true;
}

function scheduleRetry(): void {
  if (retryTimer != null || typeof window === "undefined") return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (unsaved.size > 0) void persist();
  }, delay);
}

function schedulePersist(): void {
  if (persistTimer != null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persist();
  }, 200);
}

/**
 * Flushes any pending secret writes immediately, for callers about to leave the
 * page. Rejects with SecretPersistError when the native store refused the write,
 * so a caller never reports success for credentials that only exist in memory.
 */
export async function flushSecrets(): Promise<void> {
  if (persistTimer != null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!rustAvailable) return;
  if (unsaved.size === 0 && lastPersistError == null) return;
  if (!(await persist())) throw new SecretPersistError(lastPersistError);
}

export async function loadSecrets(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await invoke<string | null>("secrets_read");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        store = parsed as Record<string, string>;
      }
    }
    rustAvailable = true;
  } catch {
    // An unreadable or corrupt native file is never overwritten: secrets keep
    // living in localStorage for this session.
    store = {};
    rustAvailable = false;
    return;
  }

  // Copies in localStorage are either pre-migration values or the fallback a
  // failed write left behind. Both are at least as new as the native file, so
  // they win. Migration is idempotent: the copies are removed only after a
  // write that contains them succeeds, and a failed write keeps them in place.
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !isSecretKey(key)) continue;
      const val = localStorage.getItem(key);
      if (val == null) continue;
      if (store[key] !== val) store[key] = val;
      unsaved.add(key);
    }
  } catch {
    void 0;
  }

  if (unsaved.size > 0) await persist();

  // Readers that mounted before this resolved saw an empty store. Tell them now.
  try {
    window.dispatchEvent(new Event(SECRETS_READY));
  } catch {
    void 0;
  }
}

/** Fires once the persisted store is in memory, so session readers can re-read. */
export const SECRETS_READY = "harbor:secrets-ready";

export function subscribeSecretsReady(fn: () => void): () => void {
  if (loaded && rustAvailable) fn();
  window.addEventListener(SECRETS_READY, fn);
  return () => window.removeEventListener(SECRETS_READY, fn);
}

export function getSecret(key: string): string | null {
  if (rustAvailable) {
    if (store[key] != null) return store[key];
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSecret(key: string, value: string | null): void {
  if (rustAvailable) {
    if (value == null) delete store[key];
    else store[key] = value;
    unsaved.add(key);
    // An older fallback copy must not resurrect on the next load; a failed
    // write mirrors the new value back (see persist).
    try {
      localStorage.removeItem(key);
    } catch {
      void 0;
    }
    schedulePersist();
    return;
  }
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    void 0;
  }
}
