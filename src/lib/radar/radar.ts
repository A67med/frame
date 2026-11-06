import type { Meta } from "@/lib/cinemeta";
import { get } from "@/lib/providers/tmdb/tmdb-client";
import {
  movieMeta,
  seriesMeta,
  type RawMovie,
  type RawSeries,
} from "@/lib/providers/tmdb/tmdb-meta-mappers";
import {
  inReleaseWindow,
  rankByLists,
  releaseWindowParams,
  type ReleaseKind,
} from "./release-dates";

export type RadarItem = Meta & { radarDate?: string };

export type RadarPage = { items: RadarItem[]; page: number; totalPages: number };

type TmdbPage<T> = { results?: T[]; total_pages?: number };

const MAX_PAGES = 500;

/** TMDB's weekly Trending and overall Popular lists for movies and TV, merged by rank. */
export async function fetchTrendingPopular(key: string, page: number): Promise<RadarPage> {
  const p = { page: String(page) };
  const [trendingMovies, trendingTv, popularMovies, popularTv] = await Promise.all([
    get<TmdbPage<RawMovie>>(key, "trending/movie/week", p),
    get<TmdbPage<RawSeries>>(key, "trending/tv/week", p),
    get<TmdbPage<RawMovie>>(key, "movie/popular", p),
    get<TmdbPage<RawSeries>>(key, "tv/popular", p),
  ]);
  if (!trendingMovies && !trendingTv && !popularMovies && !popularTv) {
    throw new Error("tmdb-unavailable");
  }
  const movies = (d: TmdbPage<RawMovie> | null) => (d?.results ?? []).map((m) => movieMeta(m));
  const shows = (d: TmdbPage<RawSeries> | null) => (d?.results ?? []).map((s) => seriesMeta(s));
  return {
    items: rankByLists<Meta>([
      movies(trendingMovies),
      shows(trendingTv),
      movies(popularMovies),
      shows(popularTv),
    ]),
    page,
    totalPages: Math.min(
      Math.max(trendingMovies?.total_pages ?? page, trendingTv?.total_pages ?? page),
      MAX_PAGES,
    ),
  };
}

/** Upcoming or newly released movies and series, keeping only titles with a listed date. */
export async function fetchReleases(
  key: string,
  kind: ReleaseKind,
  page: number,
  now = Date.now(),
): Promise<RadarPage> {
  const p = String(page);
  const [movies, shows] = await Promise.all([
    get<TmdbPage<RawMovie>>(key, "discover/movie", {
      ...releaseWindowParams(kind, "movie", now),
      page: p,
    }),
    get<TmdbPage<RawSeries>>(key, "discover/tv", {
      ...releaseWindowParams(kind, "tv", now),
      page: p,
    }),
  ]);
  if (!movies && !shows) throw new Error("tmdb-unavailable");
  const movieItems: RadarItem[] = (movies?.results ?? [])
    .filter((m) => inReleaseWindow(m.release_date, kind, now))
    .map((m) => ({ ...movieMeta(m), radarDate: m.release_date }));
  const showItems: RadarItem[] = (shows?.results ?? [])
    .filter((s) => inReleaseWindow(s.first_air_date, kind, now))
    .map((s) => ({ ...seriesMeta(s), radarDate: s.first_air_date }));
  return {
    items: rankByLists<RadarItem>([movieItems, showItems]),
    page,
    totalPages: Math.min(
      Math.max(movies?.total_pages ?? page, shows?.total_pages ?? page),
      MAX_PAGES,
    ),
  };
}
