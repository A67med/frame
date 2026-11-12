import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { parseHarborStyle } from "../src/lib/harborstyle.ts";
import { sanitizeTheme } from "../src/lib/settings/load.ts";
import { getThemeById, selectableThemes } from "../src/lib/theme.ts";

test("the selector offers exactly the five themes, in order", () => {
  assert.deepEqual(
    selectableThemes().map((t) => t.name),
    ["Default", "Stremio", "Royal", "Velvet", "Amoled"],
  );
});

test("a saved theme that is no longer offered falls back to Default", () => {
  for (const preset of ["nord", "dracula", "elegantfin", "custom", "does-not-exist"]) {
    assert.equal(sanitizeTheme({ preset: preset as never }).preset, "frame", preset);
  }
});

test("the five themes survive a settings load", () => {
  for (const preset of ["frame", "stremio", "tokyo-night", "velvet", "amoled"]) {
    assert.equal(sanitizeTheme({ preset: preset as never }).preset, preset);
  }
});

test("an imported theme keeps working without joining the five built-in themes", () => {
  assert.equal(sanitizeTheme({ preset: "user:my-theme" }).preset, "user:my-theme");
  assert.equal(
    selectableThemes().some((theme) => theme.id.startsWith("user:")),
    false,
  );
  assert.equal(selectableThemes().length, 5);
});

test("Amoled.framestyle parses and matches the shipped preset", () => {
  const parsed = parseHarborStyle(readFileSync("Amoled.framestyle", "utf8"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.theme.name, "Amoled");
  assert.deepEqual(parsed.theme.tokens, getThemeById("amoled")?.tokens);
  assert.equal(parsed.theme.tokens["--color-canvas"], "#000000");
  assert.equal(parsed.theme.background?.image, undefined);
});

test("Default.framestyle matches the shipped preset's colors", () => {
  const parsed = parseHarborStyle(readFileSync("Default.framestyle", "utf8"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.theme.tokens, getThemeById("frame")?.tokens);
});
