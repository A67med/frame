import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { pickRandom } from "@/lib/feed/tags";
import { tmdbMovieImages } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useLocalizedOverview } from "@/lib/use-localized-overview";
import { useLiveImdbRating } from "@/lib/live-imdb";
import { useT } from "@/lib/i18n";
import { ImdbIcon } from "../icons/imdb-icon";
import type { LightboxState } from "./types";
import { artAtWidth } from "@/lib/image-rung";

export function SidePanel({
  meta,
  activeIndex,
  total,
  onOpenLightbox,
}: {
  meta: Meta;
  activeIndex: number;
  total: number;
  onOpenLightbox: (state: LightboxState) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [stills, setStills] = useState<string[]>([]);
  const description = useLocalizedOverview(meta);
  const live = useLiveImdbRating(meta);

  useEffect(() => {
    if (!settings.tmdbKey) {
      setStills([]);
      return;
    }
    let cancelled = false;
    tmdbMovieImages(settings.tmdbKey, meta.id)
      .then((urls) => {
        if (cancelled) return;
        setStills(urls);
      })
      .catch(() => {
        if (cancelled) return;
        setStills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [meta.id, settings.tmdbKey]);

  const fallbackBackdrop = meta.background ?? meta.poster;

  // Four distinct stills fill the grid. With fewer (always, without a TMDB key) show what
  // there is instead of repeating the same backdrop in every tile.
  const tiles = useMemo(() => {
    if (stills.length >= 4) {
      return stills.length > 4 ? pickRandom(stills, 4, Date.now() ^ stills.length) : stills;
    }
    if (stills.length >= 2) return stills.slice(0, 2);
    const only = stills[0] ?? fallbackBackdrop;
    return only ? [only] : [];
  }, [stills, fallbackBackdrop]);

  const lightboxImages = stills.length > 0 ? stills : fallbackBackdrop ? [fallbackBackdrop] : [];

  const openAt = (tileSrc: string | undefined) => {
    if (!tileSrc || lightboxImages.length === 0) return;
    const startIndex = Math.max(0, lightboxImages.indexOf(tileSrc));
    onOpenLightbox({ images: lightboxImages, startIndex, title: meta.name });
  };

  return (
    <aside className="flex flex-col gap-3 self-start rounded-2xl border border-edge-soft bg-elevated/35 p-4">
      <div className="flex flex-col gap-1">
        <h4 className="line-clamp-1 font-display text-[19px] font-medium tracking-tight text-ink">
          {meta.name}
        </h4>
        <span className="text-[12px] uppercase tracking-[0.16em] text-ink-subtle">
          {String(activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((src, i) => (
          <Still
            key={`${meta.id}-${i}`}
            src={src}
            wide={tiles.length === 1}
            alt={meta.name}
            expandLabel={t("Expand {title} image", { title: meta.name })}
            onClick={lightboxImages.length > 0 ? () => openAt(src) : undefined}
          />
        ))}
      </div>
      {description && (
        <p className="text-[12.5px] leading-snug text-ink-muted line-clamp-3">{description}</p>
      )}
      {live.value && (
        <div className="mt-auto flex items-center gap-1.5 rounded-full border border-edge-soft bg-canvas/40 px-2.5 py-1 text-[12px] font-semibold text-ink self-start">
          {live.isImdb ? (
            <ImdbIcon className="h-[12px] w-auto rounded-[2px]" />
          ) : (
            <Star
              className="h-[12px] w-[12px] text-amber-400"
              fill="currentColor"
              strokeWidth={0}
            />
          )}
          <span>{live.value}</span>
          <span className="text-ink-subtle">· {t("Top Rated")}</span>
        </div>
      )}
    </aside>
  );
}

function Still({
  src,
  alt,
  onClick,
  expandLabel,
  wide = false,
}: {
  src: string | undefined;
  alt: string;
  onClick?: () => void;
  expandLabel: string;
  wide?: boolean;
}) {
  // The tile color doubles as the placeholder while the image loads.
  const span = wide ? "col-span-2" : "";
  if (!src) {
    return <div className={`aspect-[16/9] rounded-md bg-elevated/45 ${span}`} />;
  }
  if (!onClick) {
    return (
      <div
        className={`relative aspect-[16/9] overflow-hidden rounded-md border border-edge-soft bg-elevated/45 ${span}`}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expandLabel}
      className={`group/still relative aspect-[16/9] overflow-hidden rounded-md border border-edge-soft bg-elevated/45 transition-colors duration-200 hover:border-ink ${span}`}
    >
      <img
        src={artAtWidth(src, wide ? 400 : 200)}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover/still:scale-[1.04]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-canvas/0 transition-colors duration-200 group-hover/still:bg-canvas/20"
      />
    </button>
  );
}
