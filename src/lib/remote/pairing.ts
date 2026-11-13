/**
 * Phone side of remote pairing. Frame only takes commands from a device that
 * paired with the code shown on Frame's own screen; the token it hands back
 * is saved here, per host, and sent with the first frame of every socket.
 */

const TOKENS_KEY = "harbor.remote.tokens.v1";
const DEVICE_KEY = "harbor.remote.device.v1";

export type RemotePairPhase =
  | "checking"
  | "needed"
  | "requesting"
  | "entering"
  | "submitting"
  | "paired";

export type RemotePairing = {
  phase: RemotePairPhase;
  /** Why the last step failed: an ack code from Frame, or "interrupted"/"no-response". */
  error?: string;
  expiresAt?: number;
  len?: number;
};

function readTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [host, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof token === "string" && token) out[host] = token;
    }
    return out;
  } catch {
    return {};
  }
}

function writeTokens(tokens: Record<string, string>): void {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    void 0;
  }
}

export function readRemoteToken(host: string): string | null {
  return readTokens()[host] ?? null;
}

export function saveRemoteToken(host: string, token: string): void {
  writeTokens({ ...readTokens(), [host]: token });
}

export function forgetRemoteToken(host: string): void {
  const tokens = readTokens();
  if (!(host in tokens)) return;
  delete tokens[host];
  writeTokens(tokens);
}

function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && /^[0-9a-z-]{8,64}$/i.test(saved)) return saved;
    const fresh =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}

/** A readable name for the settings list ("iPhone", "Android phone", ...). */
export function deviceNameFromAgent(agent: string): string {
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return /Mobile/i.test(agent) ? "Android phone" : "Android tablet";
  if (/Windows/i.test(agent)) return "Windows browser";
  if (/Macintosh|Mac OS X/i.test(agent)) return "Mac browser";
  if (/Linux|CrOS/i.test(agent)) return "Linux browser";
  return "Browser";
}

export function remoteDeviceIdentity(): { id: string; name: string; platform: string } {
  const agent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return { id: deviceId(), name: deviceNameFromAgent(agent), platform: "web" };
}

/**
 * What a `hello` from Frame means for pairing. Frame's own socket answers with
 * `trust` and `paired`; a Frame too old to know pairing sends a plain hello
 * and takes commands without it.
 */
export function pairPhaseAfterHello(
  prev: RemotePairing,
  hello: Record<string, unknown>,
): RemotePairing {
  if (typeof hello.trust === "string") {
    if (hello.paired === true) return { phase: "paired" };
    // Mid-pairing, a fresh hello (another tab, a reconnect) must not wipe the form.
    if (prev.phase === "entering" || prev.phase === "submitting" || prev.phase === "requesting") {
      return prev;
    }
    return { phase: "needed", error: prev.error };
  }
  return prev.phase === "checking" ? { phase: "paired" } : prev;
}

export function pairAckOf(
  frame: Record<string, unknown> | null,
): { ok: true } | { ok: false; code: string } {
  if (!frame) return { ok: false, code: "no-response" };
  if (frame.ok === true) return { ok: true };
  return { ok: false, code: typeof frame.code === "string" ? frame.code : "refused" };
}

/** English text for a pairing failure; the caller passes it through `t`. */
export function pairErrorText(code: string | undefined): string | null {
  switch (code) {
    case undefined:
    case "":
      return null;
    case "badCode":
      return "That code did not match. Check the code on Frame's screen and try again.";
    case "expired":
      return "That code expired or was entered wrong too many times. Ask for a new one.";
    case "busy":
      return "Frame is pairing with another device. Try again in a minute.";
    case "interrupted":
      return "The connection to Frame dropped while pairing. Ask for a new code.";
    case "no-response":
      return "Frame did not answer. Check that this device is on the same network.";
    default:
      return "Frame refused to pair. Try again.";
  }
}
