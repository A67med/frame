// frame.exe imports MSVCP140.dll, which a clean Windows install may not have. Microsoft
// allows these DLLs to ship next to an app, so this copies them out of the Visual Studio
// install that is building Frame, and the installer carries them.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("[vc-runtime] not Windows, skipping");
  process.exit(0);
}

const DLLS = ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "src-tauri", "vc-runtime");

function compareVersions(a, b) {
  const parts = (v) => v.split(".").map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

function findRuntimeDir() {
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (!existsSync(vswhere)) throw new Error("vswhere.exe not found; is Visual Studio installed?");
  const install = execFileSync(
    vswhere,
    ["-latest", "-products", "*", "-property", "installationPath"],
    { encoding: "utf8" },
  ).trim();
  const redist = join(install, "VC", "Redist", "MSVC");
  const versions = readdirSync(redist)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort(compareVersions)
    .reverse();
  for (const version of versions) {
    const x64 = join(redist, version, "x64");
    if (!existsSync(x64)) continue;
    const crt = readdirSync(x64).find((name) => /^Microsoft\.VC\d+\.CRT$/.test(name));
    if (crt) return join(x64, crt);
  }
  throw new Error(`no x64 CRT folder under ${redist}`);
}

const from = findRuntimeDir();
mkdirSync(dest, { recursive: true });
for (const dll of DLLS) copyFileSync(join(from, dll), join(dest, dll));
console.log(`[vc-runtime] copied ${DLLS.join(", ")} from ${from}`);
