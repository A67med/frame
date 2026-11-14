# Frame Architecture Guide

Frame is a cross-platform desktop and TV media client built with **Tauri 2**, **React**, **TypeScript**, **Rust**, and **libmpv**. Frame originated as a fork of Harbor (`crazyrabbit0/harbor`) and maintains its MIT license attribution (`LICENSE`, `src-tauri/THIRD-PARTY-NOTICES.txt`) while evolving as an independent project at `A67med/frame` (`abdallahkattriah-sketch/frame`).

## 1. Repository Layout

```text
frame/
├── .github/workflows/       # CI, PR cross-platform builds, release pipeline, Flatpak & harbor-core checks
├── android-extension-compat/# Capstan extension bridge source & documentation
├── data/                    # Static feeds & community theme index served from raw GitHub
├── docs/                    # Architecture guide, sunset compatibility notes, screenshots, & audit reports
├── flatpak/                 # Flathub/Flatpak manifest, desktop entry, metainfo & lockfile generators
├── harbor-audio-plugin/     # macOS CoreAudio HAL driver source (`HarborVirtualMic.driver`)
├── harbor-core/             # Pure-Rust stream parser, trust filter, & ranker crate
├── harbor-install-recovery/ # Atomic stage/commit/restore installer transaction crate
├── i18n/                    # Locale translation dictionaries (`en.ts`, `ar.ts`, etc.)
├── scripts/                 # Dev diagnostics, asset fetchers, settings/i18n validators & release helpers
├── src/                     # React + TypeScript frontend
│   ├── app/                 # App shell helpers: view registry, layer lifecycle, UI scaling & background runners
│   ├── chrome/              # Window chrome, navigation rails & top bar
│   ├── components/          # Reusable UI primitives & feature-scoped widget folders
│   ├── hooks/               # Shared React hooks
│   ├── lib/                 # Framework-independent stores, API clients, media pipelines & domain logic
│   ├── views/               # Page-level views & feature subtrees (`player/`, `settings/`, `big-picture/`, etc.)
│   ├── App.tsx              # Root provider tree & layered navigation shell
│   ├── main.tsx             # Desktop/browser entry point
│   └── main-tv.tsx          # TV / Android entry point (`index-tv.html`, `chrome87` target)
├── src-tauri/               # Tauri 2 Rust host & native integrations
│   ├── capabilities/        # Tauri window & plugin permission manifests
│   ├── icons/               # App icons and installer brand artwork
│   ├── resources/           # Bundled runtime resources (including `harbor-stream-blocker/`)
│   ├── src/                 # Tauri commands, libmpv integration, window lifecycle, games, music & server
│   ├── Cargo.toml           # Workspace/desktop crate manifest (`frame`)
│   └── tauri.conf.json      # Bundle identity (`io.github.abdallahkattriah-sketch.frame`) & updater config
├── tests/                   # Node `--test` suite (~780 test files)
└── tools/                   # Standalone probes, TV benchmarks & C# Pokémon engine build helper
```

## 2. Responsibilities & Dependency Boundaries

- **Frontend (`src/`) owns presentation, navigation, and user workflows:**
  - `src/app/` holds root shell orchestration extracted from `App.tsx`: lazy route/view mapping (`views.tsx`), keep-alive and idle eviction (`layer-lifecycle.ts`), responsive UI scaling (`ui-scale.ts`), and global background runners (`runners.tsx`).
  - `src/views/` implements pages and large feature UIs (`player/`, `settings/`, `big-picture/`, `discover/`, `collections/`, `mobile/`, `downloads/`).
  - `src/components/` holds shared widgets (modals, cards, hover previews, player overlays) without owning persistent domain state.
  - `src/lib/` owns storage-backed state stores, external provider clients (`tmdb`, `tvdb`, `trakt`, `mal`, `anilist`, `simkl`), stream filtering/scoring fallbacks (`src/lib/streams/`), and native bridges (`safeFetch` in `src/lib/safe-fetch.ts`).
  - Navigation uses a custom layered stack in `src/lib/view.tsx` rather than a URL router.
  - Outbound HTTP from the frontend goes through `safeFetch`, which routes via Tauri's native HTTP command (`harbor_fetch`) on desktop or `/api-proxy/` in browser mode.

- **Tauri Backend (`src-tauri/src/`) owns native execution and OS integration:**
  - `lib.rs` initializes plugins, managed state, system tray, window geometry/maximize guards, startup setup, shutdown hooks, and registers Tauri commands cleanly.
  - `mobile.rs` configures the Android Tauri runtime using shared cross-platform modules (`#[cfg(mobile)]` boundaries documented in `lib.rs`).
  - `launch_args.rs` owns CLI media file detection, pending open-file handoff (`harbor_take_pending_file`), and `stremio://` deep-link registration/cleanup.
  - `legacy_data.rs` migrates existing `app.harbor` user data directories to `io.github.abdallahkattriah-sketch.frame` on first launch without deleting the original files.
  - `mpv.rs`, `mpv_render_*.rs`, `pip.rs`, `pip_window.rs`, `hdr_overlay.rs`, `fullscreen.rs`, and `display_fit.rs` manage libmpv playback, PiP, fullscreen, and multi-monitor behavior.
  - `installer_handoff.rs` bridges in-app updates cleanly to `harbor-install-recovery`.

- **Workspace / Support Rust Crates:**
  - `harbor-core/`: Linked directly as an `rlib` by `src-tauri/src/streams.rs` for native desktop stream parsing, trust checks, and ranking (`streams_run_pipeline`). CI also builds it for `wasm32-unknown-unknown` to verify portability; when Tauri is unavailable (browser mode), `src/lib/streams/pipeline.ts` uses the TypeScript fallback in `src/lib/streams/`.
  - `harbor-install-recovery/`: Atomic transaction manager for Windows installer staging, commit, and rollback (`begin`, `commit`, `restore`, `acknowledge`). Validates either `frame.exe` or legacy `harbor.exe` alongside `harbor-install.json`.
  - `harbor-audio-plugin/`: macOS virtual audio cable driver built via `harbor-audio-plugin/build.sh` and detected at runtime by `src-tauri/src/music/cable_mac/install.rs`.

## 3. Where New Features Belong

- **Pure domain logic, API clients, and persistent stores**: `src/lib/<feature>/` (keep React hooks/components thin).
- **Reusable UI widgets**: `src/components/<feature>/` (or `src/components/` for standalone single-file primitives).
- **Full-screen pages / multi-tab workflows**: `src/views/<feature>/` and register the view entry cleanly in `src/app/views.tsx`.
- **Cross-platform Tauri commands**: Create a focused module in `src-tauri/src/`, declare it in `lib.rs` outside `#[cfg(desktop)]` if Android also needs it (or inside `#[cfg(desktop)]` when desktop-only), and register commands in `tauri::generate_handler!`.
- **Unit and contract tests**: `tests/<topic>.test.ts` or `tests/<topic>.test.mjs` using `node:test` and `node:assert/strict` (do not place test files inside `src/`).

## 4. Naming & Compatibility Conventions

Several identifiers intentionally retain `harbor` prefixes for backward compatibility with user settings, saved themes, native bridges, packaging pipelines, and contract tests:

- **Preserved runtime identifiers**: `harbor.*` storage keys, `harbor://` and `harbor:*` events, `harbor-*` CSS classes, `data-harbor-*` attributes, `HARBOR_*` environment variables, window labels (`harbor-pip`, `harbor-browser`, `harbor-modal-overlay`, `harbor-cf-solver`, `harbor-dj`, `harbor-ytmusic-embed`), `.harborstyle` / `.framestyle` theme formats, `harbor-install.json` installer marker, `harbor_lan` mDNS discovery, and all registered Tauri command names (`harbor_fetch`, `harbor_take_pending_file`, `harbor_flush_done`, etc.).
- **Preserved crate/bundle resource paths**: `harbor-core/`, `harbor-install-recovery/`, `harbor-audio-plugin/`, and `src-tauri/resources/harbor-stream-blocker/` keep their established directory names so CI workflows, Flatpak manifests, macOS HAL lookup, and Windows bundle checks stay intact.
- **Frame identity**: `package.json`, `src-tauri/tauri.conf.json`, Cargo package `frame`, bundle ID `io.github.abdallahkattriah-sketch.frame` (Flatpak `io.github.abdallahkattriah_sketch.Frame`), binary `frame.exe`, updater endpoint `https://github.com/A67med/frame/releases/latest/download/latest.json`, and repository links pointing to `A67med/frame` / `abdallahkattriah-sketch/frame`.

## 5. Build, Check & Test Commands

```bash
pnpm install --frozen-lockfile
pnpm run setup                  # Fetch sidecars (mpv, libmpv, ffmpeg, yt-dlp, fonts) & stage capstan
pnpm dev                        # Start browser/Vite dev server on 127.0.0.1:1420
pnpm tauri dev                  # Start full Tauri desktop app in dev mode
pnpm run typecheck              # Typecheck frontend via `tsc --noEmit -p tsconfig.json` (never `tsc -b`)
pnpm test                       # Run full Node test suite (`tests/*.test.ts` & `tests/*.test.mjs`)
pnpm build                      # Production Vite bundle (`dist/`)
node scripts/check-i18n.mjs      # Validate locale translation keys
pnpm run check:settings         # Audit settings controls and dialogs
pnpm run check:search           # Validate settings search index entries

# Rust checks (set TAURI_CONFIG when bundled sidecars are omitted)
cargo test --manifest-path harbor-install-recovery/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml
```

Single test execution uses the custom loader:

```bash
node --experimental-loader ./scripts/node-test-loader.mjs --test tests/<name>.test.ts
```

## 6. Path Mapping (Modernization & Cleanup)

| Previous Location / Component                                                                         | Current Location / Disposition                              | Notes                                                                        |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/App.tsx` (view registry, `REMOVED_PAGES`, preloader)                                             | `src/app/views.tsx`                                         | Extracted view registry and lazy-preload hook                                |
| `src/App.tsx` (`useKeepAlive`, `useIdleEvict`, `filterReactKey`, `parseDeepLinkEpisode`)              | `src/app/layer-lifecycle.ts`                                | Extracted layer retention & deep-link helper utilities                       |
| `src/App.tsx` (`UI_SCALE_*`, `clampUiScale`)                                                          | `src/app/ui-scale.ts`                                       | Extracted viewport UI scale bounds & clamping                                |
| `src/App.tsx` (`TogetherFloater`, `AutoDownloadRunner`, `TogetherLocationPublisher`, `RevealOnMount`) | `src/app/runners.tsx`                                       | Extracted root background runner components                                  |
| `src/views/settings/nav.tsx` (inline SVG icons)                                                       | `src/views/settings/nav-icons.tsx`                          | Extracted pure SVG navigation icon components                                |
| `src/views/settings/nav.tsx` (`NavItem`, `NAV_GROUPS`, `NAV_ITEM_BY_ID`)                              | `src/views/settings/nav-groups.tsx`                         | Extracted static navigation hierarchy & lookup map                           |
| `src-tauri/src/lib.rs` (CLI args, `harbor_take_pending_file`, `deeplink_*`, `release_stremio_scheme`) | `src-tauri/src/launch_args.rs`                              | Extracted launch argument & deep-link module; command names unchanged        |
| `src/lib/providers/tmdb/tmdb-episode-details.test.ts`                                                 | `tests/tmdb-episode-details.test.ts`                        | Migrated from misplaced non-standard source test into `tests/` (`node:test`) |
| `src/lib/providers/tmdb/tmdb-episode-types.test.ts`                                                   | Removed                                                     | Dead scratch compile check (`tsc --noEmit` covers types directly)            |
| `scripts/publish-release.mjs`                                                                         | Removed                                                     | Obsolete Harbor server release uploader with zero callers                    |
| `src/components/alarm-clock-icon.tsx`                                                                 | Removed                                                     | Unused zero-reference component                                              |
| `src/components/beta-tag.tsx`                                                                         | Removed                                                     | Unused zero-reference component                                              |
| `harbor-install-recovery/src/lib.rs` (`harbor.exe`-only checks)                                       | `harbor-install-recovery/src/lib.rs` (`has_app_executable`) | Accepts both `frame.exe` and legacy `harbor.exe` during recovery             |
