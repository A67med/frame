// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { remoteMayOpenView } from "../src/lib/remote/view-gate.ts";

test("a remote cannot open locked views while parental controls are on", () => {
  const items = [
    { view: "home" },
    { view: "settings", pinGated: true },
    { view: "discover", parentalKey: "discover" },
  ];
  assert.equal(remoteMayOpenView("settings", items, true, {}), false);
  assert.equal(remoteMayOpenView("discover", items, true, { discover: true }), false);
  assert.equal(remoteMayOpenView("discover", items, true, { discover: false }), true);
  assert.equal(remoteMayOpenView("home", items, true, {}), true);
  assert.equal(remoteMayOpenView("settings", items, false, {}), true);
});
