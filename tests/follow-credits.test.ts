// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  creditsForFollow,
  latestFromFollows,
  mergeFollowCredits,
} from "../src/lib/follow-credits.ts";
import type { PersonCredit } from "../src/lib/providers/tmdb/tmdb-people.ts";

function credit(id: number, extra: Partial<PersonCredit> = {}): PersonCredit {
  return {
    id,
    mediaType: "movie",
    title: "T" + id,
    popularity: 1,
    voteCount: 10,
    voteAverage: 7,
    ...extra,
  };
}

test("a director followed for everything matches crew as well as cast", () => {
  const detail = {
    cast: [credit(1)],
    crew: [credit(2, { job: "Director" }), credit(3, { job: "Caterer" })],
  };
  assert.deepEqual(
    creditsForFollow(detail, "any").map((c) => c.id),
    [1, 2],
  );
  assert.deepEqual(
    creditsForFollow(detail, "acting").map((c) => c.id),
    [1],
  );
  assert.deepEqual(
    creditsForFollow(detail, "directing").map((c) => c.id),
    [2],
  );
});

test("uncredited, archive and one-off guest appearances are not attributed", () => {
  const detail = {
    cast: [
      credit(1, { character: "Self" }),
      credit(2, { character: "Bob (uncredited)" }),
      credit(3, { mediaType: "tv", episodeCount: 1, voteCount: 5000 }),
    ],
    crew: [],
  };
  assert.deepEqual(creditsForFollow(detail, "any"), []);
});

test("titles merge by TMDB id and list each person once", () => {
  const a = { id: 10, name: "Ann", role: "any" as const };
  const b = { id: 20, name: "Ben", role: "any" as const };
  const merged = mergeFollowCredits([
    {
      person: a,
      detail: { cast: [credit(1)], crew: [credit(1, { job: "Director" })] },
    },
    { person: b, detail: { cast: [credit(1)], crew: [] } },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(
    merged[0].people.map((p) => p.id),
    [10, 20],
  );
});

test("the same id on a movie and a series stays two titles", () => {
  const merged = mergeFollowCredits([
    {
      person: { id: 10, name: "Ann", role: "any" },
      detail: { cast: [credit(1), credit(1, { mediaType: "tv" })], crew: [] },
    },
  ]);
  assert.deepEqual(merged.map((m) => m.id).sort(), ["tmdb:movie:1", "tmdb:tv:1"]);
});

test("latest splits on today, drops undated titles and old ones", () => {
  const merged = mergeFollowCredits([
    {
      person: { id: 10, name: "Ann", role: "any" },
      detail: {
        cast: [
          credit(1, { releaseDate: "2026-12-01" }),
          credit(2, { releaseDate: "2026-11-20" }),
          credit(3, { releaseDate: "2026-11-06" }),
          credit(4, { releaseDate: "2020-01-01" }),
          credit(5),
          credit(6, { releaseDate: "2027" }),
        ],
        crew: [],
      },
    },
  ]);
  const { upcoming, recent } = latestFromFollows(merged, "2026-11-06");
  assert.deepEqual(
    upcoming.map((c) => c.tmdbId),
    [2, 1],
  );
  assert.deepEqual(
    recent.map((c) => c.tmdbId),
    [3],
  );
});
