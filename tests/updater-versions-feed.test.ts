import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(globalThis, { __APP_VERSION__: "0.9.212" });
const { releasesFromFeed, versionFromRelease } = await import("../src/lib/updater/versions.ts");

const body = (version: string) =>
  [
    "&lt;h2&gt;Downloads&lt;/h2&gt;",
    `&lt;td&gt;&lt;a href=&quot;https://github.com/abdallahkattriah-sketch/frame/releases/download/v${version}/Harbor_${version}_x64-setup.exe&quot;&gt;setup&lt;/a&gt;&lt;/td&gt;`,
    "&lt;h2&gt;Changes&lt;/h2&gt;",
    "&lt;h3&gt;Fixes&lt;/h3&gt;",
    "&lt;ul&gt;",
    "&lt;li&gt;Load the player&#39;s About panel from IMDb again (imdb)&lt;/li&gt;",
    "&lt;/ul&gt;",
    "&lt;p&gt;&lt;strong&gt;Full changelog&lt;/strong&gt;: &lt;a href=&quot;x&quot;&gt;compare&lt;/a&gt;&lt;/p&gt;",
  ].join("\n");

const entry = (version: string, updated: string) => `  <entry>
    <id>tag:github.com,2008:Repository/1409069088/v${version}</id>
    <updated>${updated}</updated>
    <title>Frame ${version}</title>
    <content type="html">${body(version)}</content>
  </entry>`;

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
${entry("0.9.212", "2026-10-18T16:28:45Z")}
${entry("0.9.211", "2026-10-17T21:37:42Z")}
</feed>`;

test("reads versions, dates, installers and changes from the releases feed", () => {
  const versions = releasesFromFeed(feed).map(versionFromRelease);
  assert.deepEqual(
    versions.map((v) => v?.version),
    ["0.9.212", "0.9.211"],
  );
  const [latest] = versions;
  assert.equal(latest?.date, "2026-10-18");
  assert.equal(
    latest?.assets?.["windows-x86_64"],
    "https://github.com/abdallahkattriah-sketch/frame/releases/download/v0.9.212/Harbor_0.9.212_x64-setup.exe",
  );
  assert.equal(
    latest?.notes,
    "### Fixes\n\n- Load the player's About panel from IMDb again (imdb)",
  );
});
