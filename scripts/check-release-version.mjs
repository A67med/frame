#!/usr/bin/env node
// `check-release-version.mjs v<x.y.z>` exits non-zero unless the tag is a plain
// version and every file that carries the app version agrees with it. The
// Release workflow runs this before building, so a tag can never publish
// installers whose embedded version differs from the release name.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;

/** The version each tracked file declares, keyed by path. */
export function declaredVersions(root) {
  const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
  const match = (path, pattern) => read(path).match(pattern)?.[1] ?? null;
  return {
    "package.json": JSON.parse(read("package.json")).version ?? null,
    "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version ?? null,
    "src-tauri/Cargo.toml": match("src-tauri/Cargo.toml", /^version = "([^"]+)"/m),
    "src-tauri/Cargo.lock": match("src-tauri/Cargo.lock", /name = "frame"\nversion = "([^"]+)"/),
    "flatpak/io.github.abdallahkattriah_sketch.Frame.metainfo.xml": match(
      "flatpak/io.github.abdallahkattriah_sketch.Frame.metainfo.xml",
      /<release version="([^"]+)"/,
    ),
  };
}

/** Problems that block releasing `tag`; empty when it may be released. */
export function releaseVersionProblems(tag, versions) {
  if (typeof tag !== "string" || !tag.startsWith("v") || !SEMVER.test(tag.slice(1))) {
    return [`"${tag}" is not a release tag of the form v<major>.<minor>.<patch>`];
  }
  const version = tag.slice(1);
  return Object.entries(versions)
    .filter(([, found]) => found !== version)
    .map(([path, found]) => `${path} declares ${found ?? "no version"}, the tag is ${version}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.argv[2] ?? "";
  const problems = releaseVersionProblems(tag, declaredVersions(root));
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    console.error("Run `node scripts/bump-version.mjs <x.y.z>`, commit, and tag that commit.");
    process.exit(1);
  }
  console.log(tag.slice(1));
}
