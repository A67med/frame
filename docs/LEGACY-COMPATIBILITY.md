# Frame Legacy Compatibility & Invariants Reference

This document catalogs every legacy identifier, storage key, protocol scheme, CSS selector, IPC command, and directory path retained in Frame. It details the **technical justification** and **risk of removal** for each item.

---

## Compatibility Invariants Table

| Legacy Identifier / Pattern | Location(s) | Technical Justification | Risk of Modification / Removal |
| :--- | :--- | :--- | :--- |
| `harbor.settings` | `src/lib/settings/`, `src/lib/backup.ts` | LocalStorage key holding user settings (player, subtitle, streaming, UI preferences). | Total loss of user configuration; resets app to factory defaults on update. |
| `harbor.profiles` | `src/lib/profiles.tsx` | LocalStorage key storing local profile database (names, active profile, preferences). | Profile loss, deletion of multi-user configurations. |
| `harbor.history` | `src/lib/history.ts`, `src/lib/backup.ts` | LocalStorage/IndexedDB key storing watch history and timestamps. | Loss of continue-watching rows and progress marks across all series/movies. |
| `harbor.library` | `src/lib/library.ts`, `src/lib/backup.ts` | LocalStorage key tracking bookmarked library items. | User library wiped empty. |
| `harbor.together` | `src/lib/together/` | LocalStorage key storing watch-party room state and sync configuration. | Active watch sessions and room tokens disconnected. |
| `harbor.addons` | `src/lib/addons/` | LocalStorage key holding installed Stremio addons list and manifests. | All user-installed addons lost; user cannot stream any content until reinstalled. |
| `harbor.trakt` / `harbor.mal` / `harbor.simkl` | `src/lib/trakt/`, `src/lib/mal/`, `src/lib/simkl/` | LocalStorage keys for third-party tracker sessions and client tokens. | User forced to re-authenticate with Trakt, MyAnimeList, and Simkl. |
| `.harborstyle` file format | `src/lib/harborstyle.ts`, `data/themes/` | Theme definition file format and parser specification. | Existing exported themes and community themes will fail to load or import. |
| `data-harbor-theme`, `data-harbor-bridge`, `data-harbor-style` | `src/index.html`, `src/components/theme-chrome-bridge.tsx` | Root DOM attributes used by CSS selector engine to apply active theme variables. | UI style degradation; custom themes cannot target Frame's window chrome. |
| `.harbor-*` CSS classes | `src/index.css`, `src/lib/theme.ts`, `src/components/` | Core CSS utility classes (`.harbor-btn`, `.harbor-dialog`, `.harbor-loader-*`, etc.). | Complete styling breakage for community themes and custom CSS overrides. |
| `stremio://` & `harbor://` | `src-tauri/src/launch_args.rs`, `src-tauri/src/lib.rs`, `src/lib/deep-link.ts` | OS registered protocol schemes for deep-linking media and addons from browsers. | Web browser "Install Addon" and stream links will fail to trigger Frame. |
| `harbor_window` | `src-tauri/src/lib.rs` | Windows OS Win32 window class identifier. | Window state restoration, single-instance messaging, and multi-monitor placement fail. |
| `harbor_fetch` / `harbor_upload` | `src-tauri/src/http_fetch.rs`, `src/lib/safe-fetch.ts` | Tauri IPC commands providing sandboxed native HTTP transport avoiding browser CORS. | Frontend completely loses outbound network connectivity. |
| `harbor_scan_folder` | `src-tauri/src/local_lib.rs`, `src/views/settings/storage-panel.tsx` | Tauri IPC command for indexing local video files. | Local library and video folder import cease functioning. |
| `harbor_process_memory` | `src-tauri/src/proc_mem.rs`, `src/views/settings/` | Tauri IPC command reporting native and WebView memory consumption. | Diagnostics and memory management graphs break. |
| `harbor_lan_*` (`identity`, `advertise`, `discover`) | `src-tauri/src/harbor_lan.rs`, `src/components/play-on-lan.ts` | Tauri IPC commands and mDNS protocol for LAN playback handoff. | LAN casting and playback sharing with other devices stop discovering peers. |
| `harbor_take_pending_file` | `src-tauri/src/launch_args.rs`, `src/lib/deep-link.ts` | Tauri IPC command consuming startup media arguments when opening files via "Open With". | Double-clicking a video file in Windows Explorer fails to launch playback in Frame. |
| `public/avatars/harbor_*.webp` | `public/avatars/`, `src/lib/avatars/catalog.ts` | Standard avatar image assets bundled with application. | Existing user profiles with saved avatar URLs display broken missing images. |
| `src-tauri/src/legacy_data.rs` | `src-tauri/src/legacy_data.rs` | First-run data migrator copying `%APPDATA%\app.harbor` data to `%APPDATA%\io.github.abdallahkattriah-sketch.frame`. | Users upgrading from upstream Harbor lose all existing history, keys, and settings. |
| `harbor-install.json` & `.harbor-transition` | `crates/frame-install-recovery/src/lib.rs` | Marker files used by atomic installer rollback transactions during software update. | Update recovery cannot verify previous installation; potential update failure rollback breaks. |
| `android-extension-compat/` | `scripts/capstan-stage.mjs`, `src-tauri/src/lib.rs` | JVM extension runtime bridge (Capstan) executing Android Stremio add-on APKs/JARs. | Extensions relying on Android bridge fail to execute on desktop. |
| `src-tauri/vendor/harbor-udfread` | `src-tauri/vendor/harbor-udfread/` | Vendored C library for UDF disc image parsing, licensed under LGPL-2.1-or-later. | Loss of ISO/UDF video playback and violation of upstream licensing attribution. |
| `LICENSE` & `src/assets/licenses/Harbor.txt` | Root & `src/assets/licenses/` | Original MIT License and attribution to crazyrabbit0 / Harbor Stremio authors. | Violation of MIT open-source license copyright requirements. |
| `crazyrabbit0/harbor-deps` | `scripts/fetch-libmpv.mjs`, `scripts/fetch-binaries.mjs` | GitHub release mirror storing hash-pinned builds of `libmpv-2.dll` and `ffmpeg.exe`. | Build breakage; dependency fetching fails if mirror is altered without local hosting. |

---

## Architectural Rules for Future Contributors and AI Agents

1. **Never Rename Persistent Keys**: Any addition to settings, profiles, or history must be purely additive. Never remove or rename existing `harbor.*` keys without an automatic migration script that copies data to new keys while preserving the old.
2. **Never Global Replace CSS Classes**: CSS classes beginning with `harbor-` are part of the public theme API. Never run regex search-and-replace on `src/index.css` or theme definitions.
3. **Always Retain IPC Aliases**: If a new Tauri command name is introduced (e.g. `frame_fetch`), the legacy command (`harbor_fetch`) must remain registered as an alias delegating to the same implementation.
4. **Preserve Upstream Attribution**: Frame proudly builds upon the foundation of Harbor and Stremio. Original copyrights must never be expunged.
