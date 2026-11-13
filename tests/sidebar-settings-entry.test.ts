import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarSettingsEntry } from "../src/chrome/sidebar/settings-entry.tsx";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";

const noop = () => {};

function render(props: Partial<Parameters<typeof SidebarSettingsEntry>[0]>): string {
  return renderToStaticMarkup(
    createElement(SidebarSettingsEntry, { active: false, onClick: noop, ...props }),
  );
}

function buttonClasses(html: string): string[] {
  const match = /<button[^>]*class="([^"]*)"/.exec(html);
  assert.ok(match, "renders a button");
  return match[1].split(/\s+/).filter(Boolean);
}

function labelOf(html: string): string | null {
  const match = /<span[^>]*data-harbor-sidebar-label[^>]*>([^<]*)<\/span>/.exec(html);
  return match ? match[1] : null;
}

test("the expanded sidebar shows the Settings label next to the gear", () => {
  const html = render({ collapsed: false });
  assert.equal(labelOf(html), "Settings");
  assert.match(html, /aria-label="Settings"/);
  assert.match(html, /title="Settings"/);
});

test("the collapsed sidebar keeps Settings icon-only", () => {
  const html = render({ collapsed: true });
  assert.equal(labelOf(html), null);
  assert.ok(buttonClasses(html).includes("w-9"));
  assert.match(html, /aria-label="Settings"/);
});

test("the Stremio rail stays icon-only", () => {
  assert.equal(labelOf(render({ variant: "rail", collapsed: false })), null);
});

test("Settings uses the same box and label styling as Collapse and Big Picture", () => {
  // Both of those read settings, so compare against their source instead of rendering them.
  for (const file of ["collapse-toggle.tsx", "big-picture-entry.tsx"]) {
    const source = readFileSync(`src/chrome/sidebar/${file}`, "utf8");
    for (const collapsed of [true, false]) {
      const html = render({ collapsed });
      const layout = buttonClasses(html).filter((c) =>
        /^(lg:)?(h-|w-|gap-|rounded|px-|justify-|items-|flex$)/.test(c),
      );
      for (const token of layout) assert.ok(source.includes(token), `${file}: ${token}`);
    }
    const labelClass = /<span[^>]*data-harbor-sidebar-label[^>]*class="([^"]*)"/.exec(
      render({ collapsed: false }),
    )?.[1];
    assert.ok(labelClass && source.includes(labelClass), `${file}: label ${labelClass}`);
  }
});

test("active and locked states survive the label", () => {
  const active = render({ collapsed: false, active: true });
  assert.match(active, /aria-current="page"/);
  assert.ok(buttonClasses(active).includes("text-accent"));
  const locked = render({ collapsed: false, gated: true });
  assert.doesNotMatch(locked, /aria-label="Settings"/);
  assert.equal(labelOf(locked), "Settings");
});
