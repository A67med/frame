// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  addDays,
  appendUnique,
  inReleaseWindow,
  localIsoDay,
  rankByLists,
  releaseWindowParams,
} from "../src/lib/radar/release-dates.ts";

const NOW = new Date(2026, 9, 25, 12).getTime();

test("today is the local calendar day, even just before and after midnight", () => {
  assert.equal(localIsoDay(new Date(2026, 9, 25, 0, 1).getTime()), "2026-10-25");
  assert.equal(localIsoDay(new Date(2026, 9, 25, 23, 59).getTime()), "2026-10-25");
});

test("adding days stays on the calendar across month ends", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("upcoming lists start tomorrow and have no upper limit", () => {
  const params = releaseWindowParams("upcoming", "movie", NOW);
  assert.equal(params["primary_release_date.gte"], "2026-10-26");
  assert.equal(params["primary_release_date.lte"], undefined);
  assert.equal(params.region, undefined);
});

test("new releases filter on the actual release date, not the record's age", () => {
  const movie = releaseWindowParams("new", "movie", NOW);
  assert.equal(movie["primary_release_date.lte"], "2026-10-25");
  assert.equal(movie["primary_release_date.gte"], "2026-08-26");
  const tv = releaseWindowParams("new", "tv", NOW);
  assert.equal(tv["first_air_date.lte"], "2026-10-25");
  assert.equal(tv.with_release_type, undefined);
});

test("the release window rejects missing, malformed and out-of-range dates", () => {
  assert.equal(inReleaseWindow("2026-10-26", "upcoming", NOW), true);
  assert.equal(inReleaseWindow("2026-10-25", "upcoming", NOW), false);
  assert.equal(inReleaseWindow("2026-10-25", "new", NOW), true);
  assert.equal(inReleaseWindow("2026-01-01", "new", NOW), false);
  assert.equal(inReleaseWindow("", "new", NOW), false);
  assert.equal(inReleaseWindow("2026", "upcoming", NOW), false);
  assert.equal(inReleaseWindow(undefined, "upcoming", NOW), false);
});

test("a title on both lists outranks titles on just one", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };
  assert.deepEqual(
    rankByLists([
      [a, b],
      [c, b],
    ]).map((m) => m.id)[0],
    "b",
  );
});

test("appendUnique keeps order and drops ids already shown", () => {
  assert.deepEqual(appendUnique([{ id: "a" }], [{ id: "a" }, { id: "b" }]), [
    { id: "a" },
    { id: "b" },
  ]);
});
