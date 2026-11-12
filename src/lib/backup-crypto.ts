/**
 * Optional password protection for backup files.
 *
 * The envelope wraps the plain backup JSON unchanged, so the restore path after
 * decryption is the same one plain `.framex` and legacy `.harbx` files take.
 * Only WebCrypto primitives are used: PBKDF2-SHA-256 derives an AES-256-GCM key,
 * and the serialized header is bound as additional authenticated data, so a
 * changed salt, iteration count or ciphertext fails authentication before any
 * byte of the backup is parsed. There is no recovery without the password.
 */

export const ENCRYPTED_BACKUP_FORMAT = "frame-backup-encrypted";
export const ENCRYPTED_BACKUP_VERSION = 1;

const KDF_ITERATIONS = 600_000;
// Bounds on what a file may ask for: below the floor is too weak to accept,
// above the ceiling would let a crafted file stall the app.
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSWORD_LENGTH = 8;

type EnvelopeHeader = {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: number;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
};

type Envelope = EnvelopeHeader & { ciphertext: string };

export type BackupDecryptError =
  | "wrong-password-or-damaged"
  | "unsupported-version"
  | "malformed"
  | "unavailable";

export class BackupCryptoError extends Error {
  readonly reason: BackupDecryptError;

  constructor(reason: BackupDecryptError) {
    super(reason);
    this.name = "BackupCryptoError";
    this.reason = reason;
  }
}

export function backupPasswordProblem(password: string): "too-short" | null {
  return password.length < MIN_PASSWORD_LENGTH ? "too-short" : null;
}

export const BACKUP_PASSWORD_MIN_LENGTH = MIN_PASSWORD_LENGTH;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new BackupCryptoError("unavailable");
  return s;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Key order is fixed here so the authenticated bytes never depend on parsing. */
function headerBytes(h: EnvelopeHeader): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      h.format,
      h.version,
      h.kdf.name,
      h.kdf.hash,
      h.kdf.iterations,
      h.kdf.salt,
      h.cipher.name,
      h.cipher.iv,
    ]),
  );
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const s = subtle();
  const base = await s.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return s.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** True when the text is an encrypted envelope (checked without the password). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const json = JSON.parse(text) as { format?: unknown } | null;
    return !!json && typeof json === "object" && json.format === ENCRYPTED_BACKUP_FORMAT;
  } catch {
    return false;
  }
}

export async function encryptBackupText(
  plain: string,
  password: string,
  iterations: number = KDF_ITERATIONS,
): Promise<string> {
  if (backupPasswordProblem(password)) throw new Error("backup password is too short");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const header: EnvelopeHeader = {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
  };
  const key = await deriveKey(password, salt, iterations);
  const sealed = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: headerBytes(header) },
    key,
    new TextEncoder().encode(plain),
  );
  const envelope: Envelope = { ...header, ciphertext: toBase64(new Uint8Array(sealed)) };
  return JSON.stringify(envelope, null, 2);
}

function readEnvelope(text: string): Envelope {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupCryptoError("malformed");
  }
  const e = json as Partial<Envelope> | null;
  if (!e || typeof e !== "object" || e.format !== ENCRYPTED_BACKUP_FORMAT) {
    throw new BackupCryptoError("malformed");
  }
  if (e.version !== ENCRYPTED_BACKUP_VERSION) throw new BackupCryptoError("unsupported-version");
  const kdf = e.kdf;
  const cipher = e.cipher;
  if (
    !kdf ||
    kdf.name !== "PBKDF2" ||
    kdf.hash !== "SHA-256" ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < MIN_ITERATIONS ||
    kdf.iterations > MAX_ITERATIONS ||
    typeof kdf.salt !== "string" ||
    !cipher ||
    cipher.name !== "AES-GCM" ||
    typeof cipher.iv !== "string" ||
    typeof e.ciphertext !== "string"
  ) {
    throw new BackupCryptoError("malformed");
  }
  return e as Envelope;
}

/** Decrypts an envelope back to the plain backup JSON text. */
export async function decryptBackupText(text: string, password: string): Promise<string> {
  const envelope = readEnvelope(text);
  let salt: Uint8Array;
  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    salt = fromBase64(envelope.kdf.salt);
    iv = fromBase64(envelope.cipher.iv);
    data = fromBase64(envelope.ciphertext);
  } catch {
    throw new BackupCryptoError("malformed");
  }
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) {
    throw new BackupCryptoError("malformed");
  }
  const key = await deriveKey(password, salt, envelope.kdf.iterations);
  let opened: ArrayBuffer;
  try {
    opened = await subtle().decrypt(
      { name: "AES-GCM", iv, additionalData: headerBytes(envelope) },
      key,
      data,
    );
  } catch {
    // GCM cannot tell a wrong password from a modified file, by design.
    throw new BackupCryptoError("wrong-password-or-damaged");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(opened);
  } catch {
    throw new BackupCryptoError("wrong-password-or-damaged");
  }
}
