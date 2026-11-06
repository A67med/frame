// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

// Both of these crashed the page with React error #185 (maximum update depth).
test("Radar never uses an array-building reader as a store snapshot", () => {
  const radar = readFileSync("src/views/radar.tsx", "utf8");
  assert.doesNotMatch(radar, /useSyncExternalStore/);
});

test("Following's scroll ref keeps one identity across renders", () => {
  const following = readFileSync("src/views/following.tsx", "utf8");
  assert.match(following, /const scrollCb = useCallback\(/);
});
