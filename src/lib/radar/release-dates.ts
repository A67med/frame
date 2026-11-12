// Release windows and dates for Radar. TMDB dates are date-only strings, so they are
// compared as text against the operating system's local calendar day and never go
// through a UTC conversion that could move them to a neighbouring day.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type ReleaseKind = "upcoming" | "new";
export type ReleaseMedia = "movie" | "tv";

/** How far back a title still counts as newly released. */
export const NEW_RELEASE_DAYS = 60;

export function isDateOnly(value: string | null | undefined): value is string {
  return !!value && DATE_ONLY.test(value);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's calendar day in the operating system's time zone. */
export function localIsoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/**
 * `discover` filters for a release list. Both ask for the title's actual release or
 * first-air date, so a record newly added to TMDB does not count as a new release.
 */
export function releaseWindowParams(
  kind: ReleaseKind,
  media: ReleaseMedia,
  now: number,
): Record<string, string> {
  const today = localIsoDay(now);
  const field = media === "movie" ? "primary_release_date" : "first_air_date";
  const range: Record<string, string> =
    kind === "upcoming"
      ? { [`${field}.gte`]: addDays(today, 1) }
      : { [`${field}.gte`]: addDays(today, -NEW_RELEASE_DAYS), [`${field}.lte`]: today };
  return {
    ...range,
    sort_by: "popularity.desc",
    include_adult: "false",
    ...(media === "movie"
      ? { with_release_type: kind === "upcoming" ? "2|3" : "2|3|4" }
      : { include_null_first_air_dates: "false" }),
  };
}

/** Whether a listed date really falls inside the requested release window. */
export function inReleaseWindow(
  date: string | null | undefined,
  kind: ReleaseKind,
  now: number,
): boolean {
  if (!isDateOnly(date)) return false;
  const today = localIsoDay(now);
  if (kind === "upcoming") return date > today;
  return date <= today && date >= addDays(today, -NEW_RELEASE_DAYS);
}

/**
 * Merges ranked lists by reciprocal rank, so a title high on both Trending and
 * Popular beats one that is high on only one of them.
 */
export function rankByLists<T extends { id: string }>(lists: T[][]): T[] {
  const scores = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const entry = scores.get(item.id);
      const add = 1 / (20 + index);
      if (entry) entry.score += add;
      else scores.set(item.id, { item, score: add });
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map((entry) => entry.item);
}

/** Appends a page, dropping ids already shown. */
export function appendUnique<T extends { id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map((m) => m.id));
  const out = current.slice();
  for (const m of next) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}
