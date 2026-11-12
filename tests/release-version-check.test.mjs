import assert from "node:assert/strict";
import { test } from "node:test";
import { declaredVersions, releaseVersionProblems } from "../scripts/check-release-version.mjs";

const agreeing = (v) => ({
  "package.json": v,
  "src-tauri/tauri.conf.json": v,
  "src-tauri/Cargo.toml": v,
  "src-tauri/Cargo.lock": v,
  "flatpak/io.github.abdallahkattriah_sketch.Frame.metainfo.xml": v,
});

test("a tag matching every version file may be released", () => {
  assert.deepEqual(releaseVersionProblems("v1.2.3", agreeing("1.2.3")), []);
});

test("malformed tags are refused", () => {
  for (const tag of ["1.2.3", "v1.2", "v1.2.3-beta", "vx.y.z", "", "release-1.2.3"]) {
    assert.equal(releaseVersionProblems(tag, agreeing("1.2.3")).length, 1, tag);
  }
});

test("each file that disagrees with the tag is reported", () => {
  const versions = { ...agreeing("1.2.3"), "src-tauri/Cargo.lock": "1.2.2" };
  const problems = releaseVersionProblems("v1.2.3", versions);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Cargo\.lock declares 1\.2\.2/);
  assert.equal(releaseVersionProblems("v1.2.4", agreeing("1.2.3")).length, 5);
});

test("the checked-in files all declare one version", () => {
  const versions = Object.values(declaredVersions(process.cwd()));
  assert.equal(new Set(versions).size, 1, JSON.stringify(versions));
  assert.ok(versions.every((v) => /^\d+\.\d+\.\d+$/.test(v ?? "")));
});
