# Frame Source Cleanup & Modernization Audit

**Status**: Active Audit & Execution Blueprint  
**Repository**: `https://github.com/A67med/frame`  
**Platform Scope**: Windows 10/11 x64 ONLY  
**Integration Branch**: `origin/main`  

---

## 1. Executive Summary

Frame is an independent desktop media application built with Tauri 2, React 19, TypeScript, Rust, and libmpv. It was originally forked from the Harbor Stremio client. This audit provides an exhaustive inventory of the repository's tracked files, dependency graphs, legacy naming remnants, platform boundaries, and migration paths.

### Primary Objectives
1. **Modernize Repository & Crate Structure**: Eliminate obsolete Harbor naming in repository root folders, moving internal Rust libraries into an organized `crates/` layout (`crates/frame-core`, `crates/frame-install-recovery`).
2. **De-clutter Unsupported Platform Remnants**: Prune macOS-only components (`harbor-audio-plugin`) and dead scripts (`publish-release.mjs`, unused components) that have zero utility for the Windows x64 desktop target.
3. **Preserve User Functionality, Backwards Compatibility & Data**: Guarantee zero data loss, intact theme rendering, operational IPC, and unbroken installer recovery transitions. Never delete or rename persistent storage keys, CSS selectors, or protocol schemes without strict backwards-compatibility layers.
4. **Preserve Windows x64 Release Workflow**: Keep `.github/workflows/tauri-build.yml` focused strictly on the signed Windows x64 NSIS release; never revert to obsolete multi-platform matrixes.
5. **Enforce Permanent Repository Hygiene**: Implement an automated repository hygiene checker (`scripts/check-repo-hygiene.mjs`) backed by an explicit allowlist to prevent legacy clutter from re-emerging.

---

## 2. Repository & File System Inventory

### 2.1 Workspace Overview
- **Tracked Files**: ~9,166 files in `git ls-files`.
- **Primary Root Directories**:
  - `src/`: React frontend (Vite, TypeScript, TailwindCSS v4, React 19).
  - `src-tauri/`: Tauri v2 native core (Rust, libmpv bindings, Windows media controls, torrent/stream handlers).
  - `harbor-core/`: Pure Rust protocol & stream ranking engine (to be migrated to `crates/frame-core`).
  - `harbor-install-recovery/`: Windows transactional installer rollback manager (to be migrated to `crates/frame-install-recovery`).
  - `harbor-audio-plugin/`: macOS CoreAudio driver (macOS-only C codebase; removable dead code for Windows target).
  - `android-extension-compat/`: Android Stremio extension bridge (Capstan JVM runtime); actively required on desktop for loading Android extension plugins.
  - `data/`: Curated static JSON feeds, release notes, and theme definitions.
  - `public/`: Web assets, avatars, and bundled runtime scripts.
  - `scripts/`: Build helpers, setup scripts, diagnostic tools, and quality checkers.
  - `tests/`: Flat Node test suite executed via custom ESM loader (`scripts/node-test-loader.mjs`).
  - `tools/`: Diagnostic tools and auxiliary engines (`tools/pokemon-engine`, `tools/android-p2p-probe`).
  - `docs/`: Historical documentation, sunset notices, and architecture guides.
  - `flatpak/`: Linux flatpak packaging manifests (kept standalone, non-blocking for Windows release).

### 2.2 Generated, Cached & Build Outputs
The following files and directories are ignored by Git (`.gitignore` / `.git/info/exclude`) and must remain excluded:
- `dist/`: Frontend Vite bundle output.
- `src-tauri/target/`: Rust compilation artifacts.
- `node_modules/`: Package dependencies.
- `tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`: TypeScript incremental cache.
- `vite.config.js`, `vite.config.d.ts`: Generated during build steps.
- `frame-project-audit.zip`, `*.old.exe`: Local temporary outputs.

---

## 3. Harbor Reference Classification

A full text and path scan identified Harbor occurrences across paths and contents. Every reference is classified into one of five categories:

### Category A: Safe Internal Rename / Migration
*Components, paths, and identifiers that can be modernized without breaking external user data, provided all internal imports and call sites are updated in lockstep.*

1. **`harbor-core` crate -> `crates/frame-core`**:
   - Package name: `frame-core`.
   - Crate library identifier: `frame_core`.
   - Exported version function: `frame_core_version()` with `harbor_core_version()` alias.
   - Consumers: `src-tauri/src/streams.rs` (`use frame_core::{...}`), `.github/workflows/tauri-build.yml`, `.github/workflows/ci.yml`.
2. **`harbor-install-recovery` crate -> `crates/frame-install-recovery`**:
   - Package name: `frame-install-recovery`.
   - Consumers: `src-tauri/Cargo.toml`, `.github/workflows/ci.yml`, `.github/workflows/dependency-audit.yml`, `vite.config.ts`.
3. **Internal Diagnostic Scripts**:
   - `scripts/harbor-diag.mjs` -> `scripts/frame-diag.mjs` (keeping `harbor-diag.mjs` re-export wrapper for CLI backwards compatibility).
   - `scripts/harbor-diag-mcp.mjs` -> `scripts/frame-diag-mcp.mjs`.
4. **Oversized Architecture File Extractions**:
   - `src/App.tsx` (1,521 lines): Extract application layer lifecycle (`src/app/layer-lifecycle.ts`), background runners (`src/app/runners.tsx`), UI scaling (`src/app/ui-scale.ts`), and view frame mounting (`src/app/views.tsx`).
   - `src/views/settings/nav.tsx` (8,717 lines): Extract navigation section groups (`src/views/settings/nav-groups.tsx`) and navigation icon mappings (`src/views/settings/nav-icons.tsx`).
   - `src-tauri/src/lib.rs` (1,550 lines): Extract CLI argument parsing and deep-link lifecycle (`src-tauri/src/launch_args.rs`).
5. **Misplaced Test Files**:
   - `src/lib/providers/tmdb/tmdb-episode-details.test.ts` & `tmdb-episode-types.test.ts`: Move to standard test location `tests/tmdb-episode-details.test.ts`.

### Category B: Essential Backwards Compatibility (MUST BE PRESERVED)
*Identifiers, persistence keys, styles, and protocol schemas where modification risks corrupting existing user databases, breaking third-party themes, or crashing IPC.*

1. **Local Storage & IndexedDB Keys**:
   - `harbor.settings`, `harbor.profiles`, `harbor.history`, `harbor.library`, `harbor.together`, `harbor.addons`, `harbor.trakt`, etc.
   - *Risk*: Renaming these keys wipes saved user settings, watch progress, profile avatars, and addon configurations upon upgrade.
2. **Theme Selectors & CSS Class Names**:
   - `.harbor-*` classes (`.harbor-btn`, `.harbor-dialog`, `.harbor-loader-*`, `.harbor-connecting-body`, etc.).
   - `data-harbor-*` DOM attributes (`data-harbor-theme`, `data-harbor-bridge`, `data-harbor-style`).
   - `.harborstyle` file format support in `src/lib/harborstyle.ts` alongside `.framestyle`.
   - *Risk*: Third-party and custom user themes rely directly on these CSS rules. Renaming breaks existing UI themes.
3. **IPC Commands & Protocols**:
   - Protocol handlers: `stremio://`, `harbor://`.
   - Window identifier: `harbor_window`.
   - Tauri commands: `harbor_fetch`, `harbor_upload`, `harbor_scan_folder`, `harbor_process_memory`, `harbor_lan_*`, `harbor_take_pending_file`.
   - *Risk*: WebView scripts, plugins, and deep-link handlers invoke these commands. Any breakage halts streaming or LAN discovery.
4. **User Profile Avatars & Asset Paths**:
   - `public/avatars/harbor_*.webp` and entries in `src/lib/avatars/catalog.ts`.
   - *Risk*: Existing profiles reference `/avatars/harbor_animal_01.webp`. Changing paths renders user avatars missing.
5. **Legacy Data Migration & Transaction Recovery**:
   - `src-tauri/src/legacy_data.rs`: Auto-migrates `%APPDATA%\app.harbor` directory into `%APPDATA%\io.github.abdallahkattriah-sketch.frame` on first launch.
   - `harbor-install.json` & `.harbor-transition`: Read by transactional installer rollback to safely update from older Harbor/Frame installs.
6. **Mobile/Android Extension Bridge (Capstan)**:
   - `android-extension-compat/`: Required for running Stremio Android extensions inside desktop Frame via staged jars (`scripts/capstan-stage.mjs`).

### Category C: Third-Party Attribution & Upstream Licensing
*Legal notices, external dependency mirrors, and vendored code requiring exact license attribution.*

1. **Root Licenses & Notices**:
   - `LICENSE`: Original MIT copyright belonging to Harbor Stremio authors.
   - `src/assets/licenses/Harbor.txt`: Upstream license acknowledgment.
   - `src-tauri/THIRD-PARTY-NOTICES.txt`: Retains third-party attribution and source offers.
2. **Vendored Crates & Files**:
   - `src-tauri/vendor/harbor-udfread`: Vendored C UDF disc reader wrapper (LGPL-2.1-or-later).
   - `src-tauri/vendor/librqbit/.../harbor_seeders_tests.rs`: Vendored BitTorrent engine tests.
   - `src-tauri/vendor/unrar_sys/harbor_layout.cpp`: Vendored unrar layout code.
3. **Upstream Asset Mirrors**:
   - `crazyrabbit0/harbor-deps`: Pinned binary mirror repository for `libmpv-2.dll` and `ffmpeg.exe`.
   - `crazyrabbit0/harbor/main/data`: Fallback raw feed URL for static assets.

### Category D: Dead Code / Removable Assets
*Code and assets confirmed to be unreferenced, unused by Windows builds, and obsolete.*

1. **`harbor-audio-plugin/`**:
   - macOS CoreAudio driver written in C (`harbor_driver.c`, `build.sh`, `Info.plist`).
   - Referenced only by `src-tauri/src/music/cable_mac/install.rs` under `#[cfg(target_os = "macos")]`.
   - On Windows, audio cables are enumerated through native WASAPI (`cable_win/`).
   - *Action*: Safe to remove completely from active source.
2. **`scripts/publish-release.mjs`**:
   - Obsolete manual draft publishing script from Harbor 0.9.x.
   - Unreferenced in `package.json`, CI workflows, or build scripts. Modern Frame releases use `gh release create` directly in GitHub Actions.
   - *Action*: Safe to remove.
3. **`src/components/alarm-clock-icon.tsx` & `src/components/beta-tag.tsx`**:
   - Verified 0 incoming imports across all `.ts`, `.tsx`, `.js`, and `.json` files.
   - *Action*: Safe to remove.

### Category E: Unresolved / Special Dependency Tracking
*Assets with non-obvious coupling requiring targeted verification before any change.*

1. **`tools/pokemon-engine`**:
   - Contains `Harbor.PokemonEngine.csproj`.
   - `src-tauri/src/games/pokemon_bank.rs` explicitly looks for `Harbor.PokemonEngine.exe`.
   - *Decision*: Retain naming in `tools/pokemon-engine` or add dual lookup in `pokemon_bank.rs` before renaming.
2. **`tools/android-p2p-probe`**:
   - Standalone diagnostic probe crate testing Android compilation boundaries. Isolated from desktop workspace.
   - *Decision*: Retain as standalone diagnostic tool.

---

## 4. Rust Workspace Migration Plan

### 4.1 Target Layout
```text
Frame/
  crates/
    frame-core/               (migrated from harbor-core)
      Cargo.toml
      src/
        lib.rs
        parser.rs
        scoring.rs
        trust.rs
        types.rs
    frame-install-recovery/   (migrated from harbor-install-recovery)
      Cargo.toml
      src/
        lib.rs
  src-tauri/
    Cargo.toml
    src/
```

### 4.2 Manifest & Code Updates
1. `crates/frame-core/Cargo.toml`:
   - `[package] name = "frame-core"`
2. `crates/frame-core/src/lib.rs`:
   - Add `#[wasm_bindgen] pub fn frame_core_version() -> String`
   - Keep `#[wasm_bindgen] pub fn harbor_core_version() -> String { frame_core_version() }`
3. `crates/frame-install-recovery/Cargo.toml`:
   - `[package] name = "frame-install-recovery"`
4. `src-tauri/Cargo.toml`:
   - `frame-core = { path = "../crates/frame-core" }`
   - `frame-install-recovery = { path = "../crates/frame-install-recovery" }`
5. `src-tauri/src/streams.rs`:
   - Update imports from `harbor_core` to `frame_core`.
6. Workflows (`.github/workflows/tauri-build.yml`, `ci.yml`, `app-build.yml`, `dependency-audit.yml`):
   - Update paths from `harbor-core` and `harbor-install-recovery` to `crates/frame-core` and `crates/frame-install-recovery`.
7. `vite.config.ts`:
   - Update watch ignores to include `"**/crates/frame-install-recovery/**"`.

---

## 5. Frontend & Repository Architecture Plan

### 5.1 App Shell Modularization
- `src/App.tsx` will be refactored into focused modules:
  - `src/app/layer-lifecycle.ts`: Webview window focus, visibility, and title management.
  - `src/app/runners.tsx`: Background auto-sync and update notification timers.
  - `src/app/ui-scale.ts`: Display DPI scaling and custom scale listeners.
  - `src/app/views.tsx`: Navigation view stack resolver and frame renderers.
- `src/views/settings/nav.tsx` will be modularized:
  - `src/views/settings/nav-groups.tsx`: Structured settings hierarchy and sections.
  - `src/views/settings/nav-icons.tsx`: Icon resolution map.

### 5.2 Test Infrastructure Alignment
- Consolidate all unit tests under `tests/*.test.ts` so `pnpm test` discovers them uniformly.
- Standardize `tests/tmdb-episode-details.test.ts`.
- Retain `tests/windows-release-manifest.test.mjs` to validate Windows release assets and updater signatures.

---

## 6. Permanent Hygiene Enforcement

To prevent legacy clutter from re-entering the codebase, an automated hygiene checker (`scripts/check-repo-hygiene.mjs`) will enforce:
1. No `harbor-core`, `harbor-install-recovery`, or `harbor-audio-plugin` directories in repository root.
2. No unapproved Harbor-branded files or symbols outside the explicit compatibility allowlist.
3. Strict checks on `docs/LEGACY-COMPATIBILITY.md` invariants.

---

## 7. Migration Verification Matrix

| Verification Step | Command / Mechanism | Status / Target |
| :--- | :--- | :--- |
| TypeScript Typecheck | `node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | 0 errors |
| Frontend Test Suite | `node --experimental-loader ./scripts/node-test-loader.mjs --test tests/*.test.ts tests/*.test.mjs` | All tests pass |
| Windows Release Manifest Test | `node --experimental-loader ./scripts/node-test-loader.mjs --test tests/windows-release-manifest.test.mjs` | Passes |
| Settings & Search Validators | `node scripts/check-settings.mjs` & `check-settings-search.mjs` | Passes |
| Repository Hygiene Checker | `node scripts/check-repo-hygiene.mjs` | Passes with allowlist |
| Rust Compilation (CI) | GitHub Actions Windows Runner (`cargo check`, `cargo test`) | Validated via CI workflow |
