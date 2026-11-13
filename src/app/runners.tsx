import { useEffect } from "react";
import { TogetherChatToast } from "@/components/together-chat-toast";
import { TogetherCursors } from "@/components/together-cursors";
import { useAutoDownloadRunner } from "@/lib/auto-download/runner";
import type { Meta } from "@/lib/cinemeta";
import { useTogether } from "@/lib/together/provider";
import type { ParticipantLocation } from "@/lib/together/protocol";
import { useView } from "@/lib/view";

export function TogetherFloater() {
  const { chromeHidden } = useView();
  if (chromeHidden) return null;
  return (
    <>
      <TogetherChatToast />
      <TogetherCursors />
    </>
  );
}

export function AutoDownloadRunner() {
  useAutoDownloadRunner();
  return null;
}

export function TogetherLocationPublisher() {
  const { topKind, meta, personId, picker, player, service, addonDetailId } = useView();
  const { snapshot, sendPresence } = useTogether();
  const inSession = snapshot.state === "joined";
  const participantsCount = snapshot.participants.length;
  useEffect(() => {
    if (!inSession) return;
    const location = computeLocation();
    sendPresence(location ?? undefined);
    const id = window.setInterval(() => sendPresence(location ?? undefined), 6000);
    return () => window.clearInterval(id);
    function computeLocation(): ParticipantLocation | null {
      const metaToLoc = (m: Meta) => ({
        id: m.id,
        type: (m.type === "series" ? "series" : "movie") as "movie" | "series",
        name: m.name,
        poster: m.poster,
        background: m.background,
        releaseInfo: m.releaseInfo,
        logo: m.logo,
      });
      if (player) {
        return {
          kind: "player" as const,
          meta: metaToLoc(player.meta),
          episode: player.episode
            ? {
                season: player.episode.season,
                episode: player.episode.episode,
                name: player.episode.name,
              }
            : undefined,
        };
      }
      if (picker) {
        return {
          kind: "picker" as const,
          meta: metaToLoc(picker.meta),
          episode: picker.episode
            ? {
                season: picker.episode.season,
                episode: picker.episode.episode,
                name: picker.episode.name,
              }
            : undefined,
        };
      }
      if (topKind === "meta" && meta) return { kind: "meta" as const, meta: metaToLoc(meta) };
      if (topKind === "person" && personId != null) return { kind: "person" as const, personId };
      if (topKind === "service" && service) return { kind: "service" as const, service };
      if (topKind === "addon-detail" && addonDetailId)
        return { kind: "addon-detail" as const, addonId: addonDetailId };
      if (topKind === "home") return { kind: "home" };
      if (topKind === "discover") return { kind: "discover" };
      if (topKind === "queue") return { kind: "queue" };
      if (topKind === "addons") return { kind: "addons" };
      if (topKind === "library") return { kind: "home" };
      if (topKind === "settings") return { kind: "settings" };
      return null;
    }
  }, [
    inSession,
    sendPresence,
    topKind,
    meta?.id,
    personId,
    picker?.meta.id,
    picker?.episode?.season,
    picker?.episode?.episode,
    player?.meta.id,
    player?.episode?.season,
    player?.episode?.episode,
    service,
    addonDetailId,
    participantsCount,
  ]);
  return null;
}

export function RevealOnMount({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}
