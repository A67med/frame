import type { Meta } from "@/lib/cinemeta";
import type { FollowAttribution, FollowCredit } from "@/lib/follow-credits";
import { get } from "@/lib/providers/tmdb/tmdb-client";
import {
  movieMeta,
  seriesMeta,
  type RawMovie,
  type RawSeries,
} from "@/lib/providers/tmdb/tmdb-meta-mappers";
import { addDays } from "./release-dates";

// For You is built only from what the user actually did: who they follow, the genres
// they picked, and what they rated, voted on, saved or watched. With none of that it
// stays empty rather than padding itself with popular titles.

export type TasteSource = "rated" | "voted" | "watchlist" | "watched";

export type TasteSeed = {
  id: string;
  type: "movie" | "series";
  name?: string;
  weight: number;
  source: TasteSource;
};

export type TasteInput = {
  ratings: Array<{ itemKey: string; mediaType: string; score: number; title: string }>;
  votes: Array<{ id: string; vote: "up" | "down"; name?: string; type?: string }>;
  watchlist: Array<{ id: string; type: string; name?: string }>;
  watched: Array<{ id: string; type: string; name?: string }>;
};

export type ForYouItem = {
  meta: Meta;
  people: FollowAttribution[];
  becauseOf?: string;
  matchesGenres: boolean;
  score: number;
};

const LIKED_SCORE = 7;
const MAX_SEEDS = 10;
const MAX_ITEMS = 40;

function seriesOrMovie(type: string | undefined): "movie" | "series" | null {
  if (type === "movie") return "movie";
  if (type === "series" || type === "tv") return "series";
  return null;
}

/** The strongest signal per title, strongest first. Dislikes only ever exclude. */
export function collectSeeds(input: TasteInput): { seeds: TasteSeed[]; seen: Set<string> } {
  const seeds = new Map<string, TasteSeed>();
  const seen = new Set<string>();
  const offer = (seed: TasteSeed) => {
    const current = seeds.get(seed.id);
    if (!current || seed.weight > current.weight) seeds.set(seed.id, seed);
  };
  for (const r of input.ratings) {
    seen.add(r.itemKey);
    const type = seriesOrMovie(r.mediaType);
    if (!type || r.score < LIKED_SCORE) continue;
    offer({ id: r.itemKey, type, name: r.title, weight: r.score / 2.5, source: "rated" });
  }
  for (const v of input.votes) {
    seen.add(v.id);
    const type = seriesOrMovie(v.type);
    if (type && v.vote === "up") {
      offer({ id: v.id, type, name: v.name, weight: 3, source: "voted" });
    }
  }
  for (const w of input.watched) {
    seen.add(w.id);
    const type = seriesOrMovie(w.type);
    if (type) offer({ id: w.id, type, name: w.name, weight: 2, source: "watched" });
  }
  for (const w of input.watchlist) {
    seen.add(w.id);
    const type = seriesOrMovie(w.type);
    if (type) offer({ id: w.id, type, name: w.name, weight: 1.5, source: "watchlist" });
  }
  return {
    seeds: [...seeds.values()].sort((a, b) => b.weight - a.weight).slice(0, MAX_SEEDS),
    seen,
  };
}

export type SeedRecommendations = {
  seed: TasteSeed;
  metas: Array<{ meta: Meta; genreIds: number[] }>;
};

/** Scores the candidates. A genre match alone only boosts, unless it came from a genre pick. */
export function rankForYou(input: {
  follows: FollowCredit[];
  recommendations: SeedRecommendations[];
  genrePicks: Array<{ meta: Meta; genreIds: number[] }>;
  genreWeights: ReadonlyMap<number, number>;
  seen: ReadonlySet<string>;
  today: string;
}): ForYouItem[] {
  const items = new Map<string, ForYouItem & { genreIds: number[] }>();
  const entry = (meta: Meta, genreIds: number[]) => {
    let item = items.get(meta.id);
    if (!item) {
      item = { meta, people: [], matchesGenres: false, score: 0, genreIds };
      items.set(meta.id, item);
    }
    return item;
  };

  const recentCutoff = addDays(input.today, -730);
  for (const credit of input.follows) {
    // Long filmographies would otherwise bury everything else under decades-old titles.
    if (!credit.releaseDate || credit.releaseDate < recentCutoff) continue;
    const item = entry(credit.meta, credit.genreIds);
    item.people = credit.people;
    item.score += 3 + credit.people.length;
    item.score += Math.log10(1 + credit.voteCount) / 2;
  }
  for (const { seed, metas } of input.recommendations) {
    metas.forEach(({ meta, genreIds }, index) => {
      const item = entry(meta, genreIds);
      item.score += seed.weight * (1 - index / (metas.length + 1));
      item.becauseOf ??= seed.name;
    });
  }
  for (const { meta, genreIds } of input.genrePicks) {
    const item = entry(meta, genreIds);
    item.score += 1;
    item.matchesGenres = true;
  }

  const totalWeight = [...input.genreWeights.values()].reduce((sum, w) => sum + w, 0);
  const out: ForYouItem[] = [];
  for (const { genreIds, ...item } of items.values()) {
    if (input.seen.has(item.meta.id)) continue;
    if (totalWeight > 0) {
      const overlap = genreIds.reduce((sum, g) => sum + (input.genreWeights.get(g) ?? 0), 0);
      item.score += (2 * overlap) / totalWeight;
      if (overlap > 0 && !item.becauseOf && item.people.length === 0) item.matchesGenres = true;
    }
    out.push(item);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS);
}

type Found = { movie_results?: RawMovie[]; tv_results?: RawSeries[] };
type TmdbPage<T> = { results?: T[] };
type GenreBearing = { genres?: Array<{ id: number }>; genre_ids?: number[] };

/** Resolves an id Frame stores (`tmdb:movie:1`, `tt123`) to TMDB's own. */
async function resolveSeed(
  key: string,
  seed: TasteSeed,
): Promise<{ media: "movie" | "tv"; id: number } | null> {
  const direct = /^tmdb:(movie|tv):(\d+)$/.exec(seed.id);
  if (direct) return { media: direct[1] as "movie" | "tv", id: Number(direct[2]) };
  if (!/^tt\d+$/.test(seed.id)) return null;
  const found = await get<Found>(key, `find/${seed.id}`, { external_source: "imdb_id" });
  const movie = found?.movie_results?.[0];
  if (movie && seed.type === "movie") return { media: "movie", id: movie.id };
  const show = found?.tv_results?.[0];
  if (show) return { media: "tv", id: show.id };
  return movie ? { media: "movie", id: movie.id } : null;
}

function toCandidate(media: "movie" | "tv", row: RawMovie | RawSeries) {
  return {
    meta: media === "movie" ? movieMeta(row as RawMovie) : seriesMeta(row as RawSeries),
    genreIds: row.genre_ids ?? [],
  };
}

export type ForYouResult = { items: ForYouItem[]; hasSignals: boolean; failed: boolean };

export async function fetchForYou(
  key: string,
  input: {
    taste: TasteInput;
    follows: FollowCredit[];
    genres: Array<{ id: number; mediaType: "movie" | "tv" }>;
    today: string;
  },
): Promise<ForYouResult> {
  const { seeds, seen } = collectSeeds(input.taste);
  const hasSignals = seeds.length > 0 || input.follows.length > 0 || input.genres.length > 0;
  if (!hasSignals) return { items: [], hasSignals, failed: false };

  const genreWeights = new Map<number, number>();
  const addGenre = (id: number, weight: number) =>
    genreWeights.set(id, (genreWeights.get(id) ?? 0) + weight);
  for (const g of input.genres) addGenre(g.id, 3);

  const seenResolved = new Set(seen);
  let answered = 0;
  const recommendations: SeedRecommendations[] = [];
  await Promise.all(
    seeds.map(async (seed) => {
      const target = await resolveSeed(key, seed).catch(() => null);
      if (!target) return;
      seenResolved.add(`tmdb:${target.media}:${target.id}`);
      const [details, recs] = await Promise.all([
        get<GenreBearing>(key, `${target.media}/${target.id}`).catch(() => null),
        get<TmdbPage<RawMovie | RawSeries>>(
          key,
          `${target.media}/${target.id}/recommendations`,
        ).catch(() => null),
      ]);
      if (recs) answered += 1;
      for (const g of details?.genres ?? []) addGenre(g.id, seed.weight);
      recommendations.push({
        seed,
        metas: (recs?.results ?? []).map((row) => toCandidate(target.media, row)),
      });
    }),
  );

  const genrePicks: Array<{ meta: Meta; genreIds: number[] }> = [];
  for (const media of ["movie", "tv"] as const) {
    const ids = input.genres.filter((g) => g.mediaType === media).map((g) => g.id);
    if (ids.length === 0) continue;
    const page = await get<TmdbPage<RawMovie | RawSeries>>(key, `discover/${media}`, {
      with_genres: ids.join("|"),
      sort_by: "vote_average.desc",
      "vote_count.gte": "500",
      include_adult: "false",
    }).catch(() => null);
    if (page) answered += 1;
    for (const row of page?.results ?? []) genrePicks.push(toCandidate(media, row));
  }

  const items = rankForYou({
    follows: input.follows,
    recommendations,
    genrePicks,
    genreWeights,
    seen: seenResolved,
    today: input.today,
  });
  const expected = seeds.length + input.genres.length;
  return { items, hasSignals, failed: items.length === 0 && expected > 0 && answered === 0 };
}
