// Fails when the NSIS script Tauri generated leaves out a file Frame cannot run without.
// Tauri's resource list drops entries silently when a mapped folder is empty, and which
// ones it drops changes per build, so this reads what the installer will really contain.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = [
  "libmpv-2.dll",
  "msvcp140.dll",
  "vcruntime140.dll",
  "vcruntime140_1.dll",
  "mpv.exe",
  "ffmpeg.exe",
  "ffprobe.exe",
  "yt-dlp.exe",
  "fonts\\Inter-Variable.ttf",
  "resources\\harbor-stream-blocker\\manifest.json",
];

function findScripts(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "installer.nsi") found.push(path);
    else if (statSync(path).isDirectory() && /^(?!deps$|build$|incremental$)/.test(name)) {
      findScripts(path, found);
    }
  }
  return found;
}

const scripts = findScripts(join("src-tauri", "target"));
if (scripts.length === 0) {
  console.error("[verify-bundle] no installer.nsi found; build the NSIS bundle first");
  process.exit(1);
}
const newest = scripts.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const text = readFileSync(newest, "utf8");
const missing = REQUIRED.filter((name) => !text.includes(`/oname=${name}"`));
const binary = /!define MAINBINARYSRCPATH "([^"]+)"/.exec(text)?.[1];
if (!binary || !existsSync(binary) || statSync(binary).size < 1 << 20) {
  console.error(`[verify-bundle] the main binary is missing or empty: ${binary}`);
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`[verify-bundle] ${newest} is missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`[verify-bundle] all ${REQUIRED.length} required files are in ${newest}`);
