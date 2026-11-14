// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import "./_localstorage-stub.ts";
import type { EpisodeDetail, TmdbEpisodeResponse } from "../src/lib/providers/tmdb/tmdb-episode-types.ts";

const realFetch = globalThis.fetch;

const { tmdbEpisodeDetail } = await import("../src/lib/providers/tmdb/tmdb-episode-details.ts");

test("tmdbEpisodeDetail returns null when API key is empty", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const result = await tmdbEpisodeDetail("", 12345, 1, 1);
  assert.equal(result, null);
  assert.equal(called, false);
});

test("tmdbEpisodeDetail maps cast, crew, external IDs, and caps stills at 12", async () => {
  const payload: TmdbEpisodeResponse = {
    id: 789,
    episode_number: 5,
    season_number: 2,
    name: "Test Episode",
    overview: "Test overview",
    still_path: "/episode.jpg",
    air_date: "2024-01-01",
    runtime: 45,
    vote_average: 8.5,
    vote_count: 100,
    credits: {
      cast: [
        {
          id: 1,
          name: "Regular Lead",
          character: "Lead",
          order: 0,
          profile_path: "/lead.jpg",
        },
        {
          id: 2,
          name: "Shared Actor",
          character: "Regular Role",
          order: 1,
          profile_path: "/shared.jpg",
        },
      ],
      guest_stars: [
        {
          id: 2,
          name: "Shared Actor",
          character: "Duplicate Guest",
          order: 2,
          profile_path: "/shared-dup.jpg",
        },
        {
          id: 3,
          name: "Guest Star",
          character: "Guest",
          order: 3,
          profile_path: "/guest.jpg",
        },
      ],
      crew: [
        {
          id: 4,
          name: "Director Name",
          job: "Director",
          department: "Directing",
          profile_path: "/director.jpg",
        },
      ],
    },
    images: {
      stills: Array.from({ length: 15 }, (_, i) => ({
        aspect_ratio: 1.78,
        file_path: `/still${i}.jpg`,
        height: 1080,
        width: 1920,
        vote_average: 7.5,
      })),
    },
    external_ids: {
      imdb_id: "tt1234567",
    },
  };

  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  const detail: EpisodeDetail | null = await tmdbEpisodeDetail("test-key", 12345, 2, 5);
  assert.ok(detail);
  assert.equal(detail.id, 789);
  assert.equal(detail.episodeNumber, 5);
  assert.equal(detail.seasonNumber, 2);
  assert.equal(detail.imdbId, "tt1234567");
  assert.equal(detail.stills.length, 12);
  assert.deepEqual(
    detail.guestStars.map((g) => g.id),
    [1, 2, 3],
  );
  assert.equal(detail.guestStars[1].character, "Regular Role");
  assert.equal(detail.crew[0].job, "Director");
});

test.after(() => {
  globalThis.fetch = realFetch;
});
