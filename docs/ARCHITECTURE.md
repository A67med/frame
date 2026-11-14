# Frame Architecture Guide

Frame is a cross-platform desktop media client built with **Tauri 2**, **React 19**, **TypeScript**, **Rust**, and **libmpv**, targeting **Windows 10/11 x64** as its primary supported platform. Frame originated as an independent fork of Harbor (`crazyrabbit0/harbor`) and maintains full MIT license attribution (`LICENSE`, `src-tauri/THIRD-PARTY-NOTICES.txt`) while evolving independently at `A67med/frame`.

---

## 1. Repository Layout

```text
frame/
├── .github/workflows/       # CI, Windows x64 release workflow, Flatpak & dependency checks
├── android-extension-compat/# Capstan extension bridge source & documentation (used on desktop)
├── crates/                  # Modular internal Rust libraries
│   ├── frame-core/          # Pure-Rust stream parser, trust filter & scoring engine (formerly harbor-core)
│   └── frame-install-recovery/ # Atomic stage/commit/restore installer transaction crate
├── data/                    # Static JSON feeds, curated logos & community theme catalog
├── docs/                    # Architecture guide, cleanup audit, sunset notes & compatibility matrix
├── flatpak/                 # Flathub/Flatpak packaging metadata
├── i18n/                    # Locale translation dictionaries (Crowdin integration)
├── public/                  # Static assets, avatars, and bundled runtime scripts
├── scripts/                 # Asset setup, build helpers, validators & diagnostic utilities
├── src/                     # React 19 + TypeScript frontend
│   ├── app/                 # App shell: view registry, layer lifecycle, UI scaling & background runners
│   ├── chrome/              # Window titlebar chrome, navigation rails & controls
│   ├── components/          # Reusable UI primitives & feature-scoped components
│   ├── hooks/               # Shared React hooks
│   ├── lib/                 # Framework-independent stores, provider clients & streaming pipeline
│   ├── views/               # Page-level views (player, settings, big-picture, collections, etc.)
│   ├── App.tsx              # Root provider tree & layered navigation mount
│   ├── main.tsx             # Desktop/browser application entry point
│   └── main-tv.tsx          # TV / Android entry point (`index-tv.html`, `chrome87` syntax floor)
├── src-tauri/               # Tauri 2 Rust native core
│   ├── capabilities/        # Tauri window and plugin permission manifests
│   ├── icons/               # App icons and installer brand assets
│   ├── resources/           # Bundled runtime resources (e.g. ad blockers)
│   ├── src/                 # Native commands, libmpv bindings, media controls, web server, launch args
│   ├── vendor/              # Vendored dependencies (harbor-udfread, leveldb-sys, librqbit, etc.)
│   ├── Cargo.toml           # Native desktop crate manifest (`frame`)
│   └── tauri.conf.json      # Bundle identity (`io.github.abdallahkattriah-sketch.frame`)
├── tests/                   # Node `--test` test suite
└── tools/                   # Standalone auxiliary tools (PokemonEngine, android-p2p-probe)
```

---

## 2. Responsibilities & Boundaries

### 2.1 Frontend Architecture (`src/`)
- **App Shell (`src/app/`)**: Extracted from `App.tsx` into modular subsystems:
  - `views.tsx`: Layered view stack registry and lazy component loader.
  - `layer-lifecycle.ts`: Keep-alive view management, idle frame eviction, and deep-link parsing.
  - `ui-scale.ts`: High-DPI scaling bounds and viewport listener.
  - `runners.tsx`: Global background runners (auto-sync, watch party floater, update notifications).
- **Navigation**: Uses a custom frame/view stack in `src/lib/view.tsx` rather than a standard URL router.
- **Data Transport**: Outbound HTTP requests from React use `safeFetch` (`src/lib/safe-fetch.ts`), which routes through Tauri's native command (`harbor_fetch`) on desktop to avoid browser CORS restrictions.
- **Themes & Styling**: Built on TailwindCSS v4 with custom CSS in `src/index.css`. Theme definitions use `.framestyle` and `.harborstyle` formats parsed by `src/lib/harborstyle.ts`.

### 2.2 Native Tauri Backend (`src-tauri/`)
- **Native Host (`src-tauri/src/lib.rs`)**: Initializes Tauri plugins, managed state, system tray, window geometry, startup routines, and command registrations.
- **Launch Arguments (`src-tauri/src/launch_args.rs`)**: Owns CLI media file detection, pending startup file consumption, and OS `stremio://` deep-link registration.
- **Media Engine (`src-tauri/src/mpv.rs`)**: Direct C bindings to `libmpv-2.dll` controlling playback state, audio tracks, and hardware acceleration.
- **Stream Ranking (`crates/frame-core`)**: Pure-Rust stream parsing, scoring, and trust filtering invoked natively via `streams_run_pipeline`.

---

## 3. Compatibility Invariants

Detailed in [docs/LEGACY-COMPATIBILITY.md](file:///E:/PROJECTS/Frame/docs/LEGACY-COMPATIBILITY.md):
- **Local Storage Keys**: `harbor.*` keys must remain unchanged to preserve user settings, watch progress, and addon configurations.
- **Theme Selectors**: `.harbor-*` CSS classes and `data-harbor-*` attributes are part of the external theme API and must not be renamed.
- **IPC Command Aliases**: Any new command must keep its legacy `harbor_*` alias registered.
- **Installer Recovery**: `crates/frame-install-recovery` checks for both `frame.exe` and `harbor.exe` to enable smooth upgrades from previous versions.

---

## 4. Build, Check & Test Commands

```bash
# Typecheck frontend (never use tsc -b for typechecks)
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json

# Run frontend tests
node --experimental-loader ./scripts/node-test-loader.mjs --test tests/*.test.ts tests/*.test.mjs

# Run a single test
node --experimental-loader ./scripts/node-test-loader.mjs --test tests/<name>.test.ts

# Repository hygiene check
node scripts/check-repo-hygiene.mjs

# Settings & search validators
node scripts/check-settings.mjs
node scripts/check-settings-search.mjs
```
