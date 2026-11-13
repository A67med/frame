// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { collectSeeds, rankForYou } from "../src/lib/radar/for-you.ts";
import type { FollowCredit } from "../src/lib/follow-credits.ts";

const meta = (id: string) => ({ id, type: "movie", name: id }) as const;

test("no signals means no seeds, and dislikes only exclude", () => {
  const empty = collectSeeds({ ratings: [], votes: [], watchlist: [], watched: [] });
  assert.equal(empty.seeds.length, 0);
  const { seeds, seen } = collectSeeds({
    ratings: [{ itemKey: "tt2", mediaType: "movie", score: 3, title: "Bad" }],
    votes: [{ id: "tt1", vote: "down", type: "movie" }],
    watchlist: [],
    watched: [],
  });
  assert.equal(seeds.length, 0);
  assert.ok(seen.has("tt1") && seen.has("tt2"));
});

test("anime and manga ratings never become movie seeds", () => {
  const { seeds } = collectSeeds({
    ratings: [{ itemKey: "x", mediaType: "manga", score: 10, title: "M" }],
    votes: [],
    watchlist: [],
    watched: [],
  });
  assert.equal(seeds.length, 0);
});

const follow = (id: number, releaseDate: string | null): FollowCredit => ({
  id: "tmdb:movie:" + id,
  tmdbId: id,
  mediaType: "movie",
  meta: meta("tmdb:movie:" + id),
  releaseDate,
  popularity: 1,
  voteCount: 100,
  genreIds: [],
  people: [{ id: 1, name: "Ann", profile: null, role: "Cast" }],
});

const base = {
  recommendations: [],
  genrePicks: [],
  genreWeights: new Map<number, number>(),
  seen: new Set<string>(),
  today: "2026-11-06",
};

test("attribution stays on followed titles and nothing is invented", () => {
  const items = rankForYou({
    ...base,
    follows: [follow(1, "2026-10-01")],
    recommendations: [
      {
        seed: { id: "tt9", type: "movie", name: "Seed", weight: 3, source: "rated" },
        metas: [{ meta: meta("tmdb:movie:2"), genreIds: [] }],
      },
    ],
  });
  const byId = new Map(items.map((i) => [i.meta.id, i]));
  assert.equal(byId.get("tmdb:movie:1")?.people.length, 1);
  assert.equal(byId.get("tmdb:movie:2")?.people.length, 0);
  assert.equal(byId.get("tmdb:movie:2")?.becauseOf, "Seed");
});

test("old filmography and undated credits don't fill For You", () => {
  const items = rankForYou({ ...base, follows: [follow(1, "1999-01-01"), follow(2, null)] });
  assert.equal(items.length, 0);
});

test("titles already seen are left out", () => {
  const items = rankForYou({
    ...base,
    follows: [follow(1, "2026-10-01")],
    seen: new Set(["tmdb:movie:1"]),
  });
  assert.equal(items.length, 0);
});
