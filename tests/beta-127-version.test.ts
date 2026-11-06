// @ts-expect-error Node test types are outside the browser tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are outside the browser tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are outside the browser tsconfig.
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SEMVER = /^\d+\.\d+\.\d+$/;

// The same files scripts/bump-version.mjs rewrites, read the same way.
function carriedVersions(): Record<string, string | undefined> {
  const json = (path: string) => JSON.parse(read(path)).version as string | undefined;
  const toml = (path: string) => /^version = "([^"]+)"/m.exec(read(path))?.[1];
  const lock = (path: string, name: string) =>
    new RegExp(`name = "${name}"\\nversion = "([^"]+)"`).exec(read(path))?.[1];
  return {
    "package.json": json("package.json"),
    "src-tauri/tauri.conf.json": json("src-tauri/tauri.conf.json"),
    "src-tauri/Cargo.toml": toml("src-tauri/Cargo.toml"),
    "src-tauri/Cargo.lock": lock("src-tauri/Cargo.lock", "frame"),
    "flatpak/io.github.abdallahkattriah_sketch.Frame.metainfo.xml":
      /<release version="([^"]+)" date="[^"]+"\s*\/>/.exec(
        read("flatpak/io.github.abdallahkattriah_sketch.Frame.metainfo.xml"),
      )?.[1],
  };
}

test("every version-carrying file agrees with package.json", () => {
  const versions = carriedVersions();
  const expected = versions["package.json"];
  assert.ok(expected && SEMVER.test(expected), `package.json version ${expected} is not x.y.z`);
  for (const [path, version] of Object.entries(versions)) {
    assert.equal(version, expected, `${path} carries ${version}, package.json ${expected}`);
  }
});

test("bundled offline release notes stay valid and never point at the retired host", () => {
  const notes = JSON.parse(read("src/lib/updater/bundled-release-notes.json")).notes as Record<
    string,
    { title?: string }
  >;
  assert.ok(Object.keys(notes).length > 0);
  for (const [version, note] of Object.entries(notes)) {
    assert.match(version, SEMVER);
    assert.equal(typeof note.title, "string", `${version} has no title`);
  }
  assert.doesNotMatch(JSON.stringify(notes), /harborsystem\.online/);
});
