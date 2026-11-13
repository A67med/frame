import { useCallback, useEffect, useRef, useState } from "react";
import {
  REMOTE_PROTO,
  remoteWsUrl,
  type RemoteClientMessage,
  type RemoteCommand,
  type RemoteServerMessage,
  type RemoteSnapshot,
  idleSnapshot,
} from "./protocol";
import {
  forgetRemoteToken,
  pairAckOf,
  pairPhaseAfterHello,
  readRemoteToken,
  remoteDeviceIdentity,
  saveRemoteToken,
  type RemotePairing,
} from "./pairing";
import { normalizePairCode } from "@/lib/lan-trust";

export type RemoteClientStatus = "idle" | "connecting" | "connected" | "error";

const PAIR_ACK_MS = 8000;

const RETRY_BASE_MS = 400;
const RETRY_CAP_MS = 3000;

function defaultHost(): string {
  if (typeof location === "undefined") return "127.0.0.1";
  if (location.hostname && location.hostname !== "localhost") return location.hostname;
  return "127.0.0.1";
}

/**
 * Mobile browsers freeze timers and leave dead WebSockets when the tab is
 * backgrounded. Strategy: drop the socket on hide, open a fresh one on show —
 * never wait on backoff or ping probes after resume.
 */
export function useRemoteClient(initialHost?: string) {
  const [host, setHost] = useState(initialHost || defaultHost());
  const [status, setStatus] = useState<RemoteClientStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RemoteSnapshot>(() => idleSnapshot());
  const wsRef = useRef<WebSocket | null>(null);
  const hostRef = useRef(host);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualClose = useRef(false);
  const parkedRef = useRef(false);
  const ignoreClose = useRef(new WeakSet<WebSocket>());
  const connectRef = useRef<(nextHost?: string) => void>(() => {});
  const unparkCoalesceRef = useRef(false);
  const [pairing, setPairing] = useState<RemotePairing>({ phase: "checking" });
  const pairingRef = useRef(pairing);
  pairingRef.current = pairing;
  const ackWaiters = useRef(new Map<string, (frame: Record<string, unknown> | null) => void>());
  const nonce = useRef(0);

  hostRef.current = host;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const send = useCallback((msg: RemoteClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const sendCommand = useCallback((command: RemoteCommand) => send({ t: "cmd", command }), [send]);

  const disconnect = useCallback(() => {
    manualClose.current = true;
    parkedRef.current = false;
    clearRetryTimer();
    const ws = wsRef.current;
    if (ws) {
      ignoreClose.current.add(ws);
      ws.close();
    }
    wsRef.current = null;
    setStatus("idle");
  }, [clearRetryTimer]);

  const connect = useCallback(
    (nextHost?: string) => {
      const h = (nextHost ?? hostRef.current).trim() || "127.0.0.1";
      setHost(h);
      hostRef.current = h;
      manualClose.current = false;
      parkedRef.current = false;
      clearRetryTimer();

      const prev = wsRef.current;
      if (prev) {
        ignoreClose.current.add(prev);
        prev.close();
        wsRef.current = null;
      }

      setStatus((s) => (s === "error" ? "error" : "connecting"));
      setError(null);
      const ws = new WebSocket(remoteWsUrl(h));
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus("connected");
        const token = readRemoteToken(h);
        // A saved token pairs this socket; without one Frame answers "not paired".
        send({
          t: "hello",
          client: "harbor-remote",
          proto: REMOTE_PROTO,
          ...(token ? { token } : {}),
        } as RemoteClientMessage);
        // Do not castDiscover here — reconnect/refresh storms overlap native
        // DLNA discovery and have hard-crashed the host (heap corruption).
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as RemoteServerMessage | Record<string, unknown>;
          if (msg.t === "snapshot") setSnapshot((msg as { snapshot: RemoteSnapshot }).snapshot);
          if (msg.t === "hello") {
            const hello = msg as Record<string, unknown>;
            setPairing((prev) => {
              const next = pairPhaseAfterHello(prev, hello);
              // Frame no longer knows the saved token: the device was forgotten.
              if (next.phase === "needed" && typeof hello.trust === "string") {
                forgetRemoteToken(h);
              }
              return next;
            });
          }
          if (msg.t === "ack") {
            const frame = msg as Record<string, unknown>;
            const waiter = typeof frame.id === "string" ? ackWaiters.current.get(frame.id) : null;
            if (waiter) {
              ackWaiters.current.delete(frame.id as string);
              waiter(frame);
            }
          }
          if (msg.t === "error") {
            const err = msg as { message?: string; code?: string };
            if (err.code === "untrusted") {
              setPairing((prev) => (prev.phase === "paired" ? { phase: "needed" } : prev));
            } else if (err.message) {
              setError(err.message);
            }
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        if (ignoreClose.current.has(ws) || parkedRef.current) return;
        setError("Could not reach Frame remote WebSocket.");
        setStatus("error");
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        // Frame drops a pairing whose socket closes; say so instead of waiting.
        for (const waiter of ackWaiters.current.values()) waiter(null);
        ackWaiters.current.clear();
        setPairing((prev) =>
          prev.phase === "entering" || prev.phase === "requesting" || prev.phase === "submitting"
            ? { phase: "needed", error: "interrupted" }
            : prev,
        );
        if (ignoreClose.current.has(ws) || manualClose.current || parkedRef.current) return;

        setStatus("error");
        // Don't schedule retries while backgrounded — timers are frozen/throttled
        // and leave you waiting after the phone comes back.
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

        const delay = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** retryRef.current);
        retryRef.current += 1;
        clearRetryTimer();
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (!manualClose.current && !parkedRef.current) connectRef.current(h);
        }, delay);
      };
    },
    [clearRetryTimer, send],
  );

  connectRef.current = connect;

  const ask = useCallback(
    (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
      nonce.current += 1;
      const id = `r${Date.now().toString(36)}${nonce.current}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          ackWaiters.current.delete(id);
          resolve(null);
        }, PAIR_ACK_MS);
        ackWaiters.current.set(id, (frame) => {
          clearTimeout(timer);
          resolve(frame);
        });
        if (!send({ ...body, id } as unknown as RemoteClientMessage)) {
          clearTimeout(timer);
          ackWaiters.current.delete(id);
          resolve(null);
        }
      });
    },
    [send],
  );

  /** Asks Frame to show a pairing code on its own screen. */
  const requestPairing = useCallback(async () => {
    setPairing({ phase: "requesting" });
    const frame = await ask({ t: "pair", step: "begin", peer: remoteDeviceIdentity() });
    const result = pairAckOf(frame);
    if (!result.ok) {
      setPairing({ phase: "needed", error: result.code });
      return;
    }
    const expiresAt = typeof frame?.expiresAt === "number" ? frame.expiresAt : Date.now() + 120_000;
    const len = typeof frame?.len === "number" ? frame.len : 8;
    setPairing({ phase: "entering", expiresAt, len });
  }, [ask]);

  /** Sends the code the user read off Frame's screen. */
  const submitPairingCode = useCallback(
    async (code: string) => {
      const before = pairingRef.current;
      if (before.phase !== "entering") return;
      setPairing({ ...before, phase: "submitting", error: undefined });
      const frame = await ask({ t: "pair", step: "code", code: normalizePairCode(code) });
      const result = pairAckOf(frame);
      const token = typeof frame?.token === "string" ? frame.token : "";
      if (result.ok && token) {
        saveRemoteToken(hostRef.current, token);
        setPairing({ phase: "paired" });
        return;
      }
      const failure = result.ok ? "refused" : result.code;
      // A wrong code keeps the same code on Frame's screen, so stay on the form.
      setPairing(
        failure === "badCode"
          ? { ...before, phase: "entering", error: failure }
          : { phase: "needed", error: failure },
      );
    },
    [ask],
  );

  const cancelPairing = useCallback(() => {
    void ask({ t: "pair", step: "cancel" });
    setPairing({ phase: "needed" });
  }, [ask]);

  /** App/tab backgrounded: tear down WS now so resume isn't stuck on a zombie. */
  const park = useCallback(() => {
    if (manualClose.current) return;
    parkedRef.current = true;
    clearRetryTimer();
    const ws = wsRef.current;
    if (!ws) return;
    ignoreClose.current.add(ws);
    ws.close();
    wsRef.current = null;
  }, [clearRetryTimer]);

  /** App/tab foregrounded: always open a new socket immediately. */
  const unpark = useCallback(() => {
    if (manualClose.current) return;
    if (unparkCoalesceRef.current) return;
    unparkCoalesceRef.current = true;
    queueMicrotask(() => {
      unparkCoalesceRef.current = false;
      if (manualClose.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      parkedRef.current = false;
      clearRetryTimer();
      retryRef.current = 0;

      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      connectRef.current();
    });
  }, [clearRetryTimer]);

  useEffect(() => {
    connect();
    return () => {
      manualClose.current = true;
      clearRetryTimer();
      const ws = wsRef.current;
      if (ws) {
        ignoreClose.current.add(ws);
        ws.close();
      }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") park();
      else unpark();
    };
    const onPageHide = () => park();
    const onPageShow = () => unpark();
    const onFreeze = () => park();
    const onResume = () => unpark();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
    };
  }, [park, unpark]);

  return {
    host,
    setHost,
    status,
    error,
    snapshot,
    connect,
    disconnect,
    sendCommand,
    pairing,
    requestPairing,
    submitPairingCode,
    cancelPairing,
  };
}
