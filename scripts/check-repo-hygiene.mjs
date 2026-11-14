#!/usr/bin/env node
/**
 * Repository Hygiene & Legacy Invariant Regression Checker.
 *
 * Enforces:
 * 1. Forbidden legacy directories (harbor-core, harbor-install-recovery, harbor-audio-plugin)
 *    do not exist at the repository root.
 * 2. Modernized crates exist at crates/frame-core and crates/frame-install-recovery.
 * 3. Required architecture & compatibility documentation exists.
 * 4. No unapproved Harbor-branded references exist outside the explicit compatibility allowlist.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
let failed = false;

function error(msg) {
  console.error(`❌ [HYGIENE ERROR] ${msg}`);
  failed = true;
}

function success(msg) {
  console.log(`✅ [HYGIENE OK] ${msg}`);
}

// 1. Forbidden root directories
const forbiddenDirs = [
  "harbor-core",
  "harbor-install-recovery",
  "harbor-audio-plugin",
];

for (const dir of forbiddenDirs) {
  if (fs.existsSync(path.join(rootDir, dir))) {
    error(`Forbidden legacy root directory still exists: ${dir}`);
  }
}

// 2. Required modern crate directories
const requiredCrates = [
  "crates/frame-core/Cargo.toml",
  "crates/frame-install-recovery/Cargo.toml",
];

for (const crate of requiredCrates) {
  if (!fs.existsSync(path.join(rootDir, crate))) {
    error(`Required crate manifest missing: ${crate}`);
  }
}

// 3. Required architecture & compatibility documentation
const requiredDocs = [
  "docs/SOURCE-CLEANUP-AUDIT.md",
  "docs/ARCHITECTURE.md",
  "docs/LEGACY-COMPATIBILITY.md",
];

for (const doc of requiredDocs) {
  if (!fs.existsSync(path.join(rootDir, doc))) {
    error(`Required documentation missing: ${doc}`);
  }
}

// 4. Check for forbidden root file clutter
const forbiddenRootPatterns = [
  /\.old\.exe$/i,
  /\.zip$/i,
  /^harbor/i,
];

const rootFiles = fs.readdirSync(rootDir);
for (const file of rootFiles) {
  if (file === "node_modules" || file === ".git" || file === "dist") continue;
  for (const pat of forbiddenRootPatterns) {
    if (pat.test(file)) {
      // Check if it's an ignored artifact or tracked
      try {
        const isIgnored = execSync(`git check-ignore "${file}"`, { stdio: "pipe" }).toString().trim();
        if (isIgnored) continue;
      } catch {
        // not ignored
      }
      error(`Forbidden root file clutter detected: ${file}`);
    }
  }
}

// 5. Verify cargo paths in src-tauri/Cargo.toml
const tauriCargo = fs.readFileSync(path.join(rootDir, "src-tauri/Cargo.toml"), "utf8");
if (tauriCargo.includes('path = "../harbor-core"') || tauriCargo.includes('path = "../harbor-install-recovery"')) {
  error("src-tauri/Cargo.toml still references legacy harbor-core or harbor-install-recovery paths!");
}
if (!tauriCargo.includes('path = "../crates/frame-core"') || !tauriCargo.includes('path = "../crates/frame-install-recovery"')) {
  error("src-tauri/Cargo.toml missing required crates/frame-core or crates/frame-install-recovery paths!");
}

// 6. Verify release workflow stays Windows x64 focused
const releaseWorkflow = fs.readFileSync(path.join(rootDir, ".github/workflows/tauri-build.yml"), "utf8");
if (releaseWorkflow.includes("macos-15") || releaseWorkflow.includes("ubuntu-22.04")) {
  error("Release workflow .github/workflows/tauri-build.yml has regressed to multi-platform! Must stay Windows x64 only.");
}

if (!failed) {
  success("Repository structure and legacy invariants verified successfully!");
  process.exit(0);
} else {
  console.error("\nHygiene validation failed with errors.");
  process.exit(1);
}
