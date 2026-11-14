import { useEffect, useState } from "react";
import { subscribeMemoryPressure } from "@/lib/maintenance";
import type { MetaFilter } from "@/lib/view";

const KEEP_ALIVE_MS = 1500;
const IDLE_EVICT_MS = 60 * 1000;
const PRESSURE_EVICT_MS = 1500;

export function useKeepAlive(active: boolean, requested: boolean, pin = false): boolean {
  const [mounted, setMounted] = useState(active && requested);
  useEffect(() => {
    if (!requested) {
      setMounted(false);
      return;
    }
    if (active || pin) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), KEEP_ALIVE_MS);
    return () => clearTimeout(t);
  }, [active, requested, pin]);
  return requested && (mounted || active || pin);
}

export function useIdleEvict(active: boolean, pin = false): boolean {
  const [alive, setAlive] = useState(active);
  const [pressure, setPressure] = useState(false);
  useEffect(() => subscribeMemoryPressure(setPressure), []);
  useEffect(() => {
    if (active || pin) {
      setAlive(true);
      return;
    }
    if (!alive) return;
    const t = setTimeout(() => setAlive(false), pressure ? PRESSURE_EVICT_MS : IDLE_EVICT_MS);
    return () => clearTimeout(t);
  }, [active, alive, pressure, pin]);
  return alive || active || pin;
}

export function filterReactKey(f: MetaFilter): string {
  if (f.kind === "year" || f.kind === "runtime")
    return `filter-${f.kind}-${f.mediaType}-${f.value}`;
  if (f.kind === "country" || f.kind === "language")
    return `filter-${f.kind}-${f.mediaType}-${f.iso}`;
  return `filter-${f.kind}-${f.mediaType}-${f.id}`;
}

export function parseDeepLinkEpisode(
  videoId?: string,
): { season: number; episode: number } | undefined {
  if (!videoId) return undefined;
  const parts = videoId.split(":");
  if (parts.length < 3) return undefined;
  const season = Number(parts[parts.length - 2]);
  const episode = Number(parts[parts.length - 1]);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return undefined;
  return { season, episode };
}
