import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import { FollowedPeopleChip } from "@/components/followed-people-chip";
import { PersonSuggestionCard } from "@/components/person-suggestion-card";
import { PickCard } from "@/components/pick-card";
import { Row, ScrollRootContext } from "@/components/row";
import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/auth";
import type { Meta } from "@/lib/cinemeta";
import { getVoteEntries } from "@/lib/feed/preferences";
import type { FollowAttribution } from "@/lib/follow-credits";
import { useFollowCredits } from "@/lib/follow-credits";
import { useFollows } from "@/lib/follows";
import { useT } from "@/lib/i18n";
import { fetchForYou, type ForYouResult, type TasteInput } from "@/lib/radar/for-you";
import { discoverPeople, type PersonHit } from "@/lib/radar/people";
import {
  fetchReleases,
  fetchTrendingPopular,
  type RadarItem,
  type RadarPage,
} from "@/lib/radar/radar";
import { appendUnique, localIsoDay, type ReleaseKind } from "@/lib/radar/release-dates";
import { useMyRatings } from "@/lib/ratings/store";
import { useSettings } from "@/lib/settings";
import { library } from "@/lib/stremio";
import { useScrollMemory, useView } from "@/lib/view";
import { readLocalEntries, subscribeWatchlist } from "@/lib/watchlist";
import { openUrl } from "@/lib/window";
import { fmtDate } from "./person/person-utils";

const BLURAY_CALENDAR_URL = "https://www.blu-ray.com/digital/releasedates.php";

const PILL =
  "flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition-colors disabled:opacity-60";

/** A poster card with an optional followed-people chip under it. */
const RadarCard = Object.assign(
  function RadarCard({
    meta,
    reason,
    people = [],
  }: {
    meta: Meta;
    reason?: string;
    people?: FollowAttribution[];
  }) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <PickCard meta={meta} reason={reason} />
        <FollowedPeopleChip people={people} />
      </div>
    );
  },
  { isPosterCard: true as const },
);

function RowMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-40 items-center gap-3 text-[13px] text-ink-subtle">{children}</div>
  );
}

function RetryMessage({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <RowMessage>
      {t("TMDB didn't answer.")}
      <button type="button" onClick={onRetry} className="text-accent hover:underline">
        {t("Try again")}
      </button>
    </RowMessage>
  );
}

type PagedState = {
  items: RadarItem[];
  page: number;
  totalPages: number;
  loading: boolean;
  error: boolean;
};

const EMPTY_PAGED: PagedState = { items: [], page: 0, totalPages: 1, loading: true, error: false };

function usePagedSection(loadPage: (page: number) => Promise<RadarPage>) {
  const [state, setState] = useState<PagedState>(EMPTY_PAGED);
  const busy = useRef(false);
  const generation = useRef(0);

  const load = useCallback(
    async (page: number, reset: boolean) => {
      if (busy.current && !reset) return;
      const run = ++generation.current;
      busy.current = true;
      setState((s) => ({ ...(reset ? EMPTY_PAGED : s), loading: true, error: false }));
      try {
        const res = await loadPage(page);
        if (run !== generation.current) return;
        setState((s) => ({
          items: appendUnique(reset ? [] : s.items, res.items),
          page,
          totalPages: res.totalPages,
          loading: false,
          error: false,
        }));
      } catch {
        if (run === generation.current) setState((s) => ({ ...s, loading: false, error: true }));
      } finally {
        if (run === generation.current) busy.current = false;
      }
    },
    [loadPage],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  return {
    ...state,
    hasMore: state.page > 0 && state.page < state.totalPages,
    more: () => void load(state.page + 1, false),
    retry: () =>
      void load(Math.max(1, state.page + (state.items.length ? 1 : 0)), !state.items.length),
  };
}

function ShowMore({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`${PILL} text-ink-subtle ring-edge-soft hover:text-ink`}
    >
      {loading && <Spinner size={12} />}
      {t("Show more")}
    </button>
  );
}

function useTasteInput(authKey: string | null): TasteInput {
  const ratings = useMyRatings();
  // readLocalEntries builds a new array on each call, so it can't be a store snapshot.
  const [watchlist, setWatchlist] = useState(readLocalEntries);
  useEffect(() => subscribeWatchlist(() => setWatchlist(readLocalEntries())), []);
  const [watched, setWatched] = useState<TasteInput["watched"]>([]);
  useEffect(() => {
    if (!authKey) {
      setWatched([]);
      return;
    }
    let cancelled = false;
    library(authKey)
      .then((items) => {
        if (cancelled) return;
        setWatched(
          items
            .filter((i) => !i.removed && !i.temp && (i.state?.timeWatched ?? 0) > 0)
            .sort((a, b) => (b.state?.lastWatched ?? "").localeCompare(a.state?.lastWatched ?? ""))
            .map((i) => ({ id: i._id, type: i.type, name: i.name })),
        );
      })
      // Viewing history is one signal among several, so For You still works without it.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authKey]);
  return useMemo(
    () => ({ ratings, watchlist, watched, votes: getVoteEntries() }),
    [ratings, watchlist, watched],
  );
}

function ForYouSection({ tmdbKey }: { tmdbKey: string }) {
  const t = useT();
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const { people } = useFollows();
  const { credits, loading: creditsLoading } = useFollowCredits(tmdbKey, people);
  const taste = useTasteInput(authKey);
  const genres = settings.customCalendar.genres;
  const [result, setResult] = useState<ForYouResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (creditsLoading) return;
    let cancelled = false;
    setResult(null);
    fetchForYou(tmdbKey, { taste, follows: credits, genres, today: localIsoDay(Date.now()) })
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch(() => {
        if (!cancelled) setResult({ items: [], hasSignals: true, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbKey, taste, credits, genres, creditsLoading, attempt]);

  let body: React.ReactNode;
  if (!result) {
    body = (
      <RowMessage>
        <Spinner />
      </RowMessage>
    );
  } else if (result.failed) {
    body = <RetryMessage onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (result.items.length === 0) {
    body = (
      <RowMessage>
        {result.hasSignals
          ? t("Nothing new to recommend right now.")
          : t("Follow people, rate titles or add to your watchlist to get recommendations.")}
      </RowMessage>
    );
  } else {
    body = result.items.map((item) => (
      <RadarCard
        key={item.meta.id}
        meta={item.meta}
        people={item.people}
        reason={
          item.becauseOf
            ? t("Because of {title}", { title: item.becauseOf })
            : item.matchesGenres
              ? t("Matches your genres")
              : undefined
        }
      />
    ));
  }
  return (
    <Row
      title={t("For You")}
      headerDescription={t("Picked from who you follow and what you watch, rate and save.")}
      min={148}
      shape="portrait"
      scrollKey="radar:for-you"
    >
      {body}
    </Row>
  );
}

function TrendingSection({ tmdbKey }: { tmdbKey: string }) {
  const t = useT();
  const loadPage = useCallback((page: number) => fetchTrendingPopular(tmdbKey, page), [tmdbKey]);
  const s = usePagedSection(loadPage);
  return (
    <Row
      title={t("Trending / Popular")}
      headerDescription={t("What everyone is watching right now, from TMDB.")}
      headerRight={s.hasMore ? <ShowMore loading={s.loading} onClick={s.more} /> : null}
      min={148}
      shape="portrait"
      scrollKey="radar:trending"
      onEndReached={s.hasMore ? s.more : undefined}
    >
      {s.items.length > 0 ? (
        s.items.map((m) => <RadarCard key={m.id} meta={m} />)
      ) : s.loading ? (
        <RowMessage>
          <Spinner />
        </RowMessage>
      ) : s.error ? (
        <RetryMessage onRetry={s.retry} />
      ) : (
        <RowMessage>{t("TMDB lists nothing here yet.")}</RowMessage>
      )}
    </Row>
  );
}

// Digital release dates may only come from Blu-ray.com, and Frame cannot read that
// calendar yet, so this says so instead of showing dates from another source.
function DigitalReleasesSection() {
  const t = useT();
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">
          {t("Digital Releases")}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-subtle">
          {t("Digital release dates from the Blu-ray.com calendar.")}
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-5 ring-1 ring-edge-soft">
        <p className="max-w-[70ch] text-[13.5px] text-ink-muted">
          {t(
            "This calendar isn't connected yet. Frame only shows digital dates from Blu-ray.com, so nothing is listed here until it can read them.",
          )}
        </p>
        <button
          type="button"
          onClick={() => openUrl(BLURAY_CALENDAR_URL)}
          className="text-[13px] font-medium text-accent hover:underline"
        >
          {t("Open the calendar on Blu-ray.com")}
        </button>
      </div>
    </section>
  );
}

type DiscoverFilter = "actors" | "directors";

function DiscoverSection({ tmdbKey }: { tmdbKey: string }) {
  const t = useT();
  const { people: follows } = useFollows();
  const [filter, setFilter] = useState<DiscoverFilter>("actors");
  const [data, setData] = useState<{ actors: PersonHit[]; directors: PersonHit[] } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setData(null);
    // Following someone from this row keeps them on it, so the list doesn't jump.
    discoverPeople(tmdbKey, new Set())
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbKey, attempt]);

  const followedAtLoad = useRef(new Set(follows.map((p) => p.id)));
  const shown = (data?.[filter] ?? []).filter((p) => !followedAtLoad.current.has(p.id));

  return (
    <Row
      title={t("Discover")}
      headerDescription={t("Actors and directors worth a look. Open one for their filmography.")}
      headerRight={
        <div className="flex items-center gap-1.5">
          {(["actors", "directors"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`${PILL} ${filter === id ? "text-ink ring-accent" : "text-ink-subtle ring-edge-soft hover:text-ink"}`}
            >
              {id === "actors" ? t("Actors") : t("Directors")}
            </button>
          ))}
        </div>
      }
      min={168}
      shape="portrait"
      scrollKey="radar:discover"
    >
      {shown.length > 0 ? (
        shown.map((p) => <PersonSuggestionCard key={p.id} person={p} />)
      ) : error ? (
        <RetryMessage onRetry={() => setAttempt((n) => n + 1)} />
      ) : data ? (
        <RowMessage>{t("TMDB lists nothing here yet.")}</RowMessage>
      ) : (
        <RowMessage>
          <Spinner />
        </RowMessage>
      )}
    </Row>
  );
}

function ReleasesSection({ tmdbKey }: { tmdbKey: string }) {
  const t = useT();
  const [kind, setKind] = useState<ReleaseKind>("upcoming");
  const loadPage = useCallback(
    (page: number) => fetchReleases(tmdbKey, kind, page),
    [tmdbKey, kind],
  );
  const s = usePagedSection(loadPage);
  return (
    <Row
      title={t("Upcoming / New Releases")}
      headerDescription={t("Movies and series by their actual release date.")}
      headerRight={
        <div className="flex items-center gap-1.5">
          {(["upcoming", "new"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
              className={`${PILL} ${kind === id ? "text-ink ring-accent" : "text-ink-subtle ring-edge-soft hover:text-ink"}`}
            >
              {id === "upcoming" ? t("Upcoming") : t("New")}
            </button>
          ))}
          {s.hasMore && <ShowMore loading={s.loading} onClick={s.more} />}
        </div>
      }
      min={148}
      shape="portrait"
      scrollKey={`radar:releases:${kind}`}
      onEndReached={s.hasMore ? s.more : undefined}
    >
      {s.items.length > 0 ? (
        s.items.map((m) => (
          <RadarCard key={m.id} meta={m} reason={m.radarDate ? fmtDate(m.radarDate) : undefined} />
        ))
      ) : s.loading ? (
        <RowMessage>
          <Spinner />
        </RowMessage>
      ) : s.error ? (
        <RetryMessage onRetry={s.retry} />
      ) : (
        <RowMessage>{t("TMDB lists nothing here yet.")}</RowMessage>
      )}
    </Row>
  );
}

export function RadarView({ active = true }: { active?: boolean }) {
  const t = useT();
  const { settings } = useSettings();
  const { openSettings, setView } = useView();
  const { people } = useFollows();
  const tmdbKey = settings.tmdbKey;
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  useScrollMemory("radar", scrollRef, active);

  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);

  return (
    <main ref={scrollCb} className="relative h-full overflow-y-auto overflow-x-hidden bg-canvas">
      <ScrollRootContext.Provider value={scrollEl}>
        <div className="relative flex w-full flex-col gap-12 px-12 pb-32 pt-12">
          <header>
            <h1 className="text-[34px] font-semibold tracking-tight text-ink">{t("Radar")}</h1>
            <p className="mt-1 text-[14px] text-ink-subtle">
              {people.length > 0
                ? people.length === 1
                  ? t("Following 1 person.")
                  : t("Following {n} people.", { n: people.length })
                : t("Follow actors and directors to shape what you see here.")}{" "}
              <button
                type="button"
                onClick={() => setView("following")}
                className="text-accent hover:underline"
              >
                {t("Manage Following")}
              </button>
            </p>
          </header>
          {!tmdbKey ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6 ring-1 ring-edge-soft">
              <p className="text-[14px] text-ink">
                {t("Radar reads titles and people from TMDB. Add your TMDB key to use it.")}
              </p>
              <button
                type="button"
                onClick={() => openSettings("library")}
                className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-canvas"
              >
                {t("Add TMDB key")}
              </button>
            </div>
          ) : (
            <>
              <ForYouSection tmdbKey={tmdbKey} />
              <TrendingSection tmdbKey={tmdbKey} />
              <DigitalReleasesSection />
              <DiscoverSection tmdbKey={tmdbKey} />
              <ReleasesSection tmdbKey={tmdbKey} />
            </>
          )}
        </div>
        <BackToTop scrollRef={scrollRef} />
      </ScrollRootContext.Provider>
    </main>
  );
}
