import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { normalizePairCode } from "@/lib/lan-trust";
import { pairErrorText, type RemotePairing } from "@/lib/remote/pairing";

function countdown(expiresAt: number, now: number): string {
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Shown on a phone or browser remote until it pairs. Frame takes commands
 * only from devices that typed the code shown on Frame's own screen.
 */
export function RemotePairScreen({
  pairing,
  onRequest,
  onSubmit,
  onCancel,
}: {
  pairing: RemotePairing;
  onRequest: () => void;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);
  const entering = pairing.phase === "entering" || pairing.phase === "submitting";
  const len = pairing.len && pairing.len >= 4 && pairing.len <= 16 ? pairing.len : 8;
  const clean = normalizePairCode(typed).slice(0, len);
  const error = pairErrorText(pairing.error);

  useEffect(() => {
    if (!entering) {
      setTyped("");
      return;
    }
    fieldRef.current?.focus();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [entering]);

  const expired = entering && pairing.expiresAt != null && now >= pairing.expiresAt;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={26} strokeWidth={1.8} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-ink">{t("Pair with Frame")}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            {entering
              ? t("Type the code Frame is showing on its screen.")
              : t(
                  "Frame only takes commands from devices you pair. Ask for a code, then type the code Frame shows on its screen.",
                )}
          </p>
        </div>

        {entering ? (
          <form
            className="flex w-full flex-col items-stretch gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (clean.length === len && pairing.phase === "entering") onSubmit(clean);
            }}
          >
            <input
              ref={fieldRef}
              value={clean}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck={false}
              maxLength={len + 4}
              aria-label={t("Pairing code")}
              disabled={pairing.phase === "submitting"}
              className="h-14 w-full rounded-xl border border-edge bg-elevated text-center font-mono text-2xl font-semibold tracking-[0.3em] text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={clean.length !== len || pairing.phase === "submitting" || expired}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-canvas transition-opacity disabled:opacity-40"
            >
              {pairing.phase === "submitting" && <Loader2 size={18} className="animate-spin" />}
              {t("Pair")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="h-11 rounded-xl text-sm font-medium text-ink-muted hover:text-ink"
            >
              {t("common.cancel")}
            </button>
            {pairing.expiresAt != null && (
              <p className="text-xs text-ink-subtle" aria-live="polite">
                {expired
                  ? t("That code expired. Ask for a new one.")
                  : t("Code expires in {time}", { time: countdown(pairing.expiresAt, now) })}
              </p>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={onRequest}
            disabled={pairing.phase === "requesting" || pairing.phase === "checking"}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-canvas transition-opacity disabled:opacity-40"
          >
            {(pairing.phase === "requesting" || pairing.phase === "checking") && (
              <Loader2 size={18} className="animate-spin" />
            )}
            {t("Show a code on Frame")}
          </button>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {t(error)}
          </p>
        )}
      </div>
    </div>
  );
}
