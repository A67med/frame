import type { PersonDetail } from "@/lib/providers/tmdb";
import { notableScore } from "@/views/person/person-utils";
import { get } from "@/lib/providers/tmdb/tmdb-client";

// People search and suggestions, shared by Radar's Discover section and Following.
// Everyone returned here comes from TMDB with a stable person id, so two people with
// similar names can never be merged or swapped.

export type PersonHit = {
  id: number;
  name: string;
  profile: string | null;
  department: string;
  knownFor: string;
  popularity: number;
};

export type PersonSuggestion = PersonHit & { workedWith?: string };

type RawPerson = {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
  popularity?: number;
  known_for?: Array<{ title?: string; name?: string }>;
};

type Page<T> = { results?: T[] };

function toHit(p: RawPerson): PersonHit {
  return {
    id: p.id,
    name: p.name,
    profile: p.profile_path ?? null,
    department: p.known_for_department ?? "",
    knownFor: (p.known_for ?? [])
      .map((k) => k.title ?? k.name)
      .filter(Boolean)
      .slice(0, 2)
      .join(", "),
    popularity: p.popularity ?? 0,
  };
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = row;
  }
  return previous[b.length];
}

function tokenSimilarity(query: string, token: string): number {
  if (token === query) return 1;
  if (token.startsWith(query)) return 0.92;
  const distance = editDistance(query, token);
  const ratio = 1 - distance / Math.max(query.length, token.length);
  // A typo in a long name is still that name; the same distance in a short one is not.
  return query.length >= 4 ? ratio : ratio >= 1 ? 1 : 0;
}

/** How well a name matches what was typed, from 0 to 1. */
export function nameMatchScore(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.startsWith(q)) return 0.97;
  const nameTokens = n.split(" ");
  const parts = q.split(" ").map((part) => {
    return Math.max(...nameTokens.map((token) => tokenSimilarity(part, token)));
  });
  return (parts.reduce((sum, s) => sum + s, 0) / parts.length) * 0.95;
}

const MIN_MATCH = 0.6;

/** Drops weak matches and orders the rest by match, then by how well known they are. */
export function rankPeople(query: string, people: PersonHit[]): PersonHit[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return [...byId.values()]
    .map((person) => ({ person, score: nameMatchScore(query, person.name) }))
    .filter((row) => row.score >= MIN_MATCH)
    .sort((a, b) => {
      const diff = Math.round((b.score - a.score) * 20);
      return diff !== 0 ? diff : b.person.popularity - a.person.popularity;
    })
    .map((row) => row.person);
}

/**
 * Looser queries for when a misspelling makes TMDB's search miss. TMDB matches word
 * prefixes but returns nothing for two truncated words together, so each word is tried
 * alone, whole and cut short. rankPeople then scores the results against the full name.
 */
export function searchVariants(query: string): string[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const out: string[] = [];
  for (const token of [...tokens].sort((a, b) => b.length - a.length).slice(0, 2)) {
    if (tokens.length > 1) out.push(token);
    if (token.length >= 5) out.push(token.slice(0, Math.ceil(token.length * 0.7)));
  }
  return [...new Set(out)];
}

const ENOUGH_RESULTS = 3;

export async function searchPeople(key: string, query: string, limit = 8): Promise<PersonHit[]> {
  const q = query.trim();
  if (!q || !key) return [];
  const run = async (text: string): Promise<PersonHit[]> => {
    const page = await get<Page<RawPerson>>(key, "search/person", {
      query: text,
      include_adult: "false",
    });
    return (page?.results ?? []).map(toHit);
  };
  const direct = await run(q);
  let ranked = rankPeople(q, direct);
  if (ranked.length < ENOUGH_RESULTS) {
    const extra = await Promise.all(searchVariants(q).map((v) => run(v).catch(() => [])));
    ranked = rankPeople(q, [...direct, ...extra.flat()]);
  }
  return ranked.slice(0, limit);
}

type TitleCredits = {
  cast?: Array<RawPerson & { order?: number }>;
  crew?: Array<RawPerson & { job?: string }>;
};

const TOP_BILLED = 6;

function titlePeople(credits: TitleCredits | null): RawPerson[] {
  const cast = (credits?.cast ?? []).filter((c) => (c.order ?? 99) < TOP_BILLED);
  const directors = (credits?.crew ?? []).filter((c) => c.job === "Director");
  return [...cast, ...directors];
}

const MAX_SOURCE_PEOPLE = 8;
const TITLES_PER_PERSON = 2;

/**
 * People who actually worked with those the user follows, on those people's best-known
 * titles, most shared titles first. Empty when the user follows nobody yet.
 */
export async function suggestCollaborators(
  key: string,
  followed: Array<{ id: number; name: string }>,
  details: ReadonlyMap<number, PersonDetail>,
  limit = 12,
): Promise<PersonSuggestion[]> {
  const followedIds = new Set(followed.map((p) => p.id));
  const tally = new Map<number, { person: PersonSuggestion; shared: number }>();
  await Promise.all(
    followed.slice(0, MAX_SOURCE_PEOPLE).map(async (source) => {
      const detail = details.get(source.id);
      if (!detail) return;
      const titles = [...detail.cast, ...detail.crew]
        .filter((c) => c.mediaType === "movie" || c.mediaType === "tv")
        .sort((a, b) => notableScore(b) - notableScore(a))
        .filter((c, i, all) => all.findIndex((o) => o.id === c.id) === i)
        .slice(0, TITLES_PER_PERSON);
      await Promise.all(
        titles.map(async (title) => {
          const credits = await get<TitleCredits>(
            key,
            `${title.mediaType}/${title.id}/credits`,
          ).catch(() => null);
          const onTitle = new Map(titlePeople(credits).map((p) => [p.id, p]));
          for (const person of onTitle.values()) {
            if (followedIds.has(person.id) || !person.profile_path) continue;
            const row = tally.get(person.id);
            if (row) row.shared += 1;
            else {
              tally.set(person.id, {
                person: { ...toHit(person), knownFor: title.title, workedWith: source.name },
                shared: 1,
              });
            }
          }
        }),
      );
    }),
  );
  return [...tally.values()]
    .sort((a, b) => b.shared - a.shared || b.person.popularity - a.person.popularity)
    .slice(0, limit)
    .map((row) => row.person);
}

type TrendingMovie = { id: number; title?: string };

const TRENDING_TITLES_FOR_DIRECTORS = 8;

/** Trending actors, and the directors of this week's trending films. */
export async function discoverPeople(
  key: string,
  excludeIds: ReadonlySet<number>,
): Promise<{ actors: PersonHit[]; directors: PersonHit[] }> {
  const [people, movies] = await Promise.all([
    get<Page<RawPerson>>(key, "trending/person/week"),
    get<Page<TrendingMovie>>(key, "trending/movie/week"),
  ]);
  if (!people && !movies) throw new Error("tmdb-unavailable");

  const actors = (people?.results ?? [])
    .filter((p) => p.known_for_department === "Acting" && p.profile_path && !excludeIds.has(p.id))
    .map(toHit);

  const rows = await Promise.all(
    (movies?.results ?? []).slice(0, TRENDING_TITLES_FOR_DIRECTORS).map(async (movie) => {
      const credits = await get<TitleCredits>(key, `movie/${movie.id}/credits`).catch(() => null);
      return (credits?.crew ?? [])
        .filter((c) => c.job === "Director" && !excludeIds.has(c.id))
        .map((c) => ({ ...toHit(c), department: "Directing", knownFor: movie.title ?? "" }));
    }),
  );
  const directors = [...new Map(rows.flat().map((d) => [d.id, d])).values()];
  return { actors, directors };
}
