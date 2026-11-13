import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, Smartphone } from "lucide-react";
import { useT } from "@/lib/i18n";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const PAIRED_NOTE_MS = 4000;

type PairEvent =
  | { action: "show"; code: string; expiresAt: number; name?: string; platform?: string }
  | { action: "hide"; reason?: string; name?: string };

type Offer = { code: string; expiresAt: number; name: string };

/** "K7Q2M9XF" reads as "K7Q2 M9XF". */
export function groupPairCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

function countdown(expiresAt: number, now: number): string {
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Shows the pairing code on Frame's own screen when a phone or another Frame
 * asks to pair. Only someone who can see this screen can finish pairing.
 */
export function RemotePairPrompt() {
  const t = useT();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let noteTimer = 0;
    void listen<PairEvent>("remote://pair", (e) => {
      const event = e.payload;
      if (!event) return;
      if (event.action === "show") {
        window.clearTimeout(noteTimer);
        setPairedName(null);
        setNow(Date.now());
        setOffer({ code: event.code, expiresAt: event.expiresAt, name: event.name ?? "" });
        return;
      }
      setOffer(null);
      if (event.reason === "paired") {
        setPairedName(event.name || "");
        window.clearTimeout(noteTimer);
        noteTimer = window.setTimeout(() => setPairedName(null), PAIRED_NOTE_MS);
      }
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      window.clearTimeout(noteTimer);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= offer.expiresAt) setOffer(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [offer]);

  if (!offer && pairedName === null) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[9990] flex justify-center px-4">
      {offer ? (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-labelledby="harbor-pair-title"
          aria-describedby="harbor-pair-code"
          className="pointer-events-auto flex w-full max-w-md items-center gap-4 rounded-2xl border border-edge bg-elevated/95 p-5 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Smartphone size={22} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p id="harbor-pair-title" className="text-sm font-semibold text-ink">
              {offer.name
                ? t("{name} wants to control Frame", { name: offer.name })
                : t("A device wants to control Frame")}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {t("Type this code on that device to pair it. Expires in {time}.", {
                time: countdown(offer.expiresAt, now),
              })}
            </p>
            <p
              id="harbor-pair-code"
              className="mt-2 font-mono text-[28px] font-semibold leading-none tracking-[0.18em] text-ink"
            >
              {groupPairCode(offer.code)}
            </p>
          </div>
          <button
            type="button"
            data-focusable="true"
            onClick={() => void invoke("remote_pair_cancel").catch(() => {})}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas/60 hover:text-ink"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-canvas shadow-lg"
        >
          <Check size={16} strokeWidth={2.6} />
          {pairedName
            ? t("{name} can now control Frame", { name: pairedName })
            : t("The device can now control Frame")}
        </div>
      )}
    </div>
  );
}
