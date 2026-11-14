#!/usr/bin/env node
// `node scripts/updater-manifest.mjs <version> <asset-dir> <sig-dir> <notes-file>` writes <asset-dir>/latest.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [version, dir, sigDir, notesFile] = process.argv.slice(2);
if (!version || !dir || !sigDir || !notesFile) {
  console.error(
    "usage: node scripts/updater-manifest.mjs <version> <asset-dir> <sig-dir> <notes-file>",
  );
  process.exit(1);
}

const base = `https://github.com/A67med/frame/releases/download/v${version}`;
const PLATFORMS = {
  "windows-x86_64": `Frame_${version}_x64-setup.exe`,
};

const platforms = {};
for (const [key, file] of Object.entries(PLATFORMS)) {
  const sig = join(sigDir, `${file}.sig`);
  if (!existsSync(join(dir, file)) || !existsSync(sig)) {
    console.error(`missing ${file} or its signature`);
    process.exit(1);
  }
  platforms[key] = { url: `${base}/${file}`, signature: readFileSync(sig, "utf8").trim() };
}

const manifest = {
  version,
  notes: readFileSync(notesFile, "utf8").trim(),
  pub_date: new Date().toISOString(),
  platforms,
};
writeFileSync(join(dir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json written for ${Object.keys(platforms).join(", ")}`);
