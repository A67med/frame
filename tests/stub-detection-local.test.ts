import "./_localstorage-stub.ts";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { mayBeStubStream } from "../src/views/player/hooks/use-stub-detection.ts";

const src = (url: string, id = "tt0117571", type = "movie") => ({
  url,
  meta: { id, type, name: "Scream" },
});

test("a file opened from disk is never treated as an addon stub", () => {
  // Opened with Frame from Explorer: App.tsx gives it a local: id and the path as its URL.
  assert.equal(
    mayBeStubStream(
      src(String.raw`C:\Videos\Clip (2026).mkv`, String.raw`local:C:\Videos\Clip (2026).mkv`),
    ),
    false,
  );
  // A local library entry matched to IMDb keeps the IMDb id but still plays a path.
  assert.equal(mayBeStubStream(src(String.raw`D:\Movies\Short Film (2019).mp4`)), false);
  assert.equal(mayBeStubStream(src("/home/me/Videos/short.mkv")), false);
  assert.equal(mayBeStubStream(src("file:///C:/Videos/short.mkv")), false);
});

test("addon streams are still checked", () => {
  assert.equal(mayBeStubStream(src("http://127.0.0.1:11470/abcdef/0")), true);
  assert.equal(mayBeStubStream(src("https://debrid.example/dl/file.mkv", "tt1", "series")), true);
});

test("live, pasted and non-video sources stay exempt", () => {
  assert.equal(mayBeStubStream(src("https://cdn.example/live/index.m3u8")), false);
  assert.equal(mayBeStubStream(src("https://cdn.example/a.mp4", "iptv:1")), false);
  assert.equal(
    mayBeStubStream(src("https://cdn.example/a.mp4", "url:https://cdn.example/a.mp4")),
    false,
  );
  assert.equal(mayBeStubStream(src("https://cdn.example/a.mp4", "tt1", "tv")), false);
});
