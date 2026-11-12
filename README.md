# Frame

A personal desktop media app for movies and TV, built with Tauri 2, React, TypeScript, Rust and libmpv.

Version 0.2.0.

Frame began as a fork of [Harbor](https://github.com/crazyrabbit0/harbor), a Stremio client, and keeps its MIT license and notice. See [LICENSE](LICENSE) and `src-tauri/THIRD-PARTY-NOTICES.txt`.

## What it does

- **Browse:** Home, Discover, Movies, TV Shows and My Library, with global search, advanced filters and right-click menus.
- **Radar:** For You, Trending / Popular, Digital Releases, Discover and Upcoming / New Releases, using your computer's local time zone.
- **Following:** the actors, directors and crew you follow, their latest and upcoming work, and people you might like. Radar and Following share the same list.
- **Watch:** a native mpv player with embedded playback, online subtitles, resume, skip intro and outro, picture-in-picture and the existing player extras.
- **Sources:** Stremio and its add-ons, extensions and local files, with metadata and artwork from TMDB.
- **Profile:** your Stremio account is your profile. Frame's local settings stay separate from it, and Frame works without signing in.
- **Track:** Letterboxd is the only tracker.
- **Themes:** Default, Stremio, Royal, Velvet and Amoled. Themes import and export as `.framestyle` files.

Backups save as `frame-backup-YYYY-MM-DD.framex`, optionally encrypted with a password (AES-256-GCM). Both `.framex` and older `.harbx` backups can be imported. Before a restore, the desktop app saves a copy of your current setup to its data folder (`backups/`, newest five kept), and a restore that cannot finish is rolled back. Backups hold settings and app data only, never your video files.

## Install

Requirements: Windows 10 or 11 (x64). macOS and Linux builds are also produced.

Download the installer for your platform from [Releases](https://github.com/abdallahkattriah-sketch/frame/releases). The Windows installer includes mpv and its runtime files. Windows also needs WebView2, which the installer sets up if it's missing.

Frame stores its data under the identifier `io.github.abdallahkattriah-sketch.frame`. On first launch it copies data from a v0.1.0 install (`app.harbor`) and leaves the original folder in place.

## TMDB key

Radar, Following and most artwork read from TMDB. Add your own key in **Settings > Sources & library > Library & metadata**.

## Build

```sh
pnpm install
pnpm run setup          # fetches ffmpeg, yt-dlp, libmpv, mpv, fonts
pnpm tauri build --bundles nsis
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. On Windows you also need the MSVC toolchain, CMake and the Rust toolchain.

To regenerate the logo, icons and installer art, run `node scripts/generate-brand.mjs`, then `pnpm tauri icon src-tauri/icons/source.png`.

## Updates

Frame checks GitHub Releases for a newer version and offers it. It downloads and installs only when you choose, and it refuses an update whose signature does not match the key built into the app. There is one stable channel.

## Releases

1. `node scripts/bump-version.mjs <x.y.z>`, commit, and merge to `main`.
2. Tag that commit `v<x.y.z>` and push the tag.

The Release workflow checks that the tag matches every version file and sits on `main`, builds all platforms, and creates a **draft** release behind the `release` environment. Nothing reaches users until the draft is published by hand. In-app updates need the `TAURI_SIGNING_PRIVATE_KEY` secret to match `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.

## Development

```sh
pnpm install
pnpm dev                 # browser build on http://127.0.0.1:1420
pnpm tauri dev           # desktop app
pnpm run typecheck
pnpm test
```

`scripts/test-installer-hooks.ps1` checks the Windows installer hook against decoy processes.

## License

MIT. See [LICENSE](LICENSE).
