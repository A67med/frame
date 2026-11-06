// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { nameMatchScore, rankPeople, searchVariants } from "../src/lib/radar/people.ts";

const person = (id: number, name: string, popularity = 1) => ({
  id,
  name,
  popularity,
  profile: null,
  department: "Acting",
  knownFor: "",
});

test("partial names and small typos still match", () => {
  assert.ok(nameMatchScore("leo", "Leonardo DiCaprio") >= 0.6);
  assert.ok(nameMatchScore("dicaprio", "Leonardo DiCaprio") >= 0.6);
  assert.ok(nameMatchScore("leonrdo dicapro", "Leonardo DiCaprio") >= 0.6);
  assert.ok(nameMatchScore("Penelope Cruz", "Penélope Cruz") >= 0.97);
});

test("unrelated names don't match", () => {
  assert.ok(nameMatchScore("tom hanks", "Sigourney Weaver") < 0.6);
  assert.ok(nameMatchScore("tim", "Tom Hanks") < 0.6);
});

test("the closer name wins even when the other is more popular", () => {
  const ranked = rankPeople("chris evans", [
    person(1, "Chris Evans", 1),
    person(2, "Chris Pine", 500),
  ]);
  assert.equal(ranked[0].id, 1);
});

test("two people sharing a name stay separate, by id", () => {
  const ranked = rankPeople("james martin", [
    person(1, "James Martin", 1),
    person(2, "James Martin", 9),
    person(2, "James Martin", 9),
  ]);
  assert.deepEqual(
    ranked.map((p) => p.id),
    [2, 1],
  );
});

test("variants loosen the query without inventing a name", () => {
  assert.deepEqual(searchVariants("scarlet johanson"), ["johanson", "johans", "scarlet", "scarl"]);
  assert.deepEqual(searchVariants("leonrdo dicapro"), ["leonrdo", "leonr", "dicapro", "dicap"]);
  assert.deepEqual(searchVariants("tom hnks"), ["hnks", "tom"]);
  assert.deepEqual(searchVariants("washingon"), ["washing"]);
  assert.deepEqual(searchVariants("ann"), []);
});
