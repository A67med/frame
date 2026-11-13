import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { FollowedPerson, FollowRole } from "@/lib/follows";
import {
  creditToMeta,
  tmdbPerson,
  type PersonCredit,
  type PersonDetail,
} from "@/lib/providers/tmdb";
import { addDays, isDateOnly } from "@/lib/radar/release-dates";
import {
  CINEMATOGRAPHY_JOBS,
  DIRECTOR_JOBS,
  EDITING_JOBS,
  isCameoOrGuest,
  PRODUCER_JOBS,
  WRITER_JOBS,
} from "@/views/person/person-utils";

// The one place follows turn into titles. Radar and Following both read it, so a
// person's credits and attribution are the same on either page.

export type FollowAttribution = {
  id: number;
  name: string;
  profile: string | null;
  role: string;
};

export type FollowCredit = {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  meta: Meta;
  releaseDate: string | null;
  popularity: number;
  voteCount: number;
  genreIds: number[];
  people: FollowAttribution[];
};

const CREATIVE_JOBS = new Set([
  ...DIRECTOR_JOBS,
  ...WRITER_JOBS,
  ...PRODUCER_JOBS,
  ...CINEMATOGRAPHY_JOBS,
  ...EDITING_JOBS,
  "Creator",
  "Original Music Composer",
]);

function isOneOffAppearance(c: PersonCredit): boolean {
  return c.mediaType === "tv" && c.episodeCount === 1 && c.voteCount > 100;
}

/** The credits a follow covers: acting, directing, or both plus key creative crew. */
export function creditsForFollow(
  detail: Pick<PersonDetail, "cast" | "crew">,
  role: FollowRole,
): PersonCredit[] {
  const cast = detail.cast.filter((c) => !isCameoOrGuest(c) && !isOneOffAppearance(c));
  if (role === "acting") return cast;
  if (role === "directing") return detail.crew.filter((c) => c.job && DIRECTOR_JOBS.has(c.job));
  return [...cast, ...detail.crew.filter((c) => c.job && CREATIVE_JOBS.has(c.job))];
}

/** One entry per title, listing each followed person on it once. */
export function mergeFollowCredits(
  entries: Array<{ person: FollowedPerson; detail: Pick<PersonDetail, "cast" | "crew"> }>,
): FollowCredit[] {
  const byTitle = new Map<string, FollowCredit>();
  for (const { person, detail } of entries) {
    for (const credit of creditsForFollow(detail, person.role)) {
      if (credit.mediaType !== "movie" && credit.mediaType !== "tv") continue;
      const id = `tmdb:${credit.mediaType}:${credit.id}`;
      let entry = byTitle.get(id);
      if (!entry) {
        entry = {
          id,
          tmdbId: credit.id,
          mediaType: credit.mediaType,
          meta: creditToMeta(credit),
          releaseDate: isDateOnly(credit.releaseDate) ? credit.releaseDate : null,
          popularity: credit.popularity,
          voteCount: credit.voteCount,
          genreIds: credit.genreIds ?? [],
          people: [],
        };
        byTitle.set(id, entry);
      }
      if (!entry.people.some((p) => p.id === person.id)) {
        entry.people.push({
          id: person.id,
          name: person.name,
          profile: person.profile ?? null,
          role: credit.job ?? "Cast",
        });
      }
    }
  }
  return [...byTitle.values()];
}

/** Titles with a listed release date, split around today. Undated titles are left out. */
export function latestFromFollows(
  credits: FollowCredit[],
  today: string,
  recentDays = 365,
): { upcoming: FollowCredit[]; recent: FollowCredit[] } {
  const earliest = addDays(today, -recentDays);
  const upcoming: FollowCredit[] = [];
  const recent: FollowCredit[] = [];
  for (const credit of credits) {
    const date = credit.releaseDate;
    if (!date) continue;
    if (date > today) upcoming.push(credit);
    else if (date >= earliest) recent.push(credit);
  }
  upcoming.sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!));
  recent.sort((a, b) => b.releaseDate!.localeCompare(a.releaseDate!));
  return { upcoming, recent };
}

export type FollowCreditsState = {
  credits: FollowCredit[];
  details: Map<number, PersonDetail>;
  loading: boolean;
  /** How many followed people TMDB did not answer for. */
  failed: number;
};

const EMPTY_STATE: FollowCreditsState = {
  credits: [],
  details: new Map(),
  loading: false,
  failed: 0,
};

const CONCURRENT_PEOPLE = 6;

async function loadFollowCredits(
  key: string,
  people: FollowedPerson[],
): Promise<Omit<FollowCreditsState, "loading">> {
  const details = new Map<number, PersonDetail>();
  const entries: Array<{ person: FollowedPerson; detail: PersonDetail }> = [];
  let failed = 0;
  for (let i = 0; i < people.length; i += CONCURRENT_PEOPLE) {
    await Promise.all(
      people.slice(i, i + CONCURRENT_PEOPLE).map(async (person) => {
        const detail = await tmdbPerson(key, person.id).catch(() => null);
        if (!detail) {
          failed += 1;
          return;
        }
        details.set(person.id, detail);
        entries.push({ person, detail });
      }),
    );
  }
  return { credits: mergeFollowCredits(entries), details, failed };
}

export function useFollowCredits(key: string, people: FollowedPerson[]): FollowCreditsState {
  const [state, setState] = useState<FollowCreditsState>(EMPTY_STATE);
  const peopleKey = people.map((p) => `${p.id}:${p.role}`).join(",");
  useEffect(() => {
    if (!key || people.length === 0) {
      setState(EMPTY_STATE);
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void loadFollowCredits(key, people).then((next) => {
      if (!cancelled) setState({ ...next, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // people is re-created on every settings write; peopleKey tracks what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, peopleKey]);
  return state;
}
