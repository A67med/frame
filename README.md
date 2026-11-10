# Frame

A personal desktop media app for movies and TV, built on [Harbor](https://github.com/crazyrabbit0/harbor) with Tauri 2, React, TypeScript, Rust and libmpv.

Version 0.1.0.

## What it does

- **Browse:** Home, Discover, Movies, TV Shows and My Library, with global search, advanced filters and right-click menus.
- **Radar:** upcoming theatrical releases, digital releases, newly released films and popular picks. Egypt is the default release region, and Radar can favour films from people you follow.
- **Following:** the actors and directors you follow, shared with Radar.
- **Watch:** a native mpv player with embedded playback, online subtitles, resume, skip intro and outro, picture-in-picture and the existing player extras.
- **Sources:** Stremio and its add-ons, extensions and plugins, and local files, with metadata and artwork from TMDB.
- **Track:** Letterboxd is the only tracker.
- **Details:** cast, crew and filmography, awards and ratings from metadata providers, and recommendations.
- **Make it yours:** themes, Theme Studio and custom layouts. New installs start on the built-in Default theme, and themes export as `.framestyle` files.
- **Together:** Watch Party through your own relay.
- **More:** downloads, Big Picture (TV mode), catalogs, collections, the People rank, Wrapped, AI search, X-Ray and Spooktober.

Backups save as `frame-backup-YYYY-MM-DD.framex`. Both `.framex` and older Harbor `.harbx` backups can be imported.

## What Frame removes from Harbor

Music, Manga, eBook, Games, the anime pages, Calendar, Sports, Kids, Live TV and IPTV, playlist VOD, Multiview, casting, Plex, Jellyfin and Emby, Discord, webhooks, Trakt, Simkl, AniList and MyAnimeList, multiple profiles, the Arabic interface, and everything that needed Harbor's servers, such as accounts, community themes and community collections.

Settings and data from a Harbor install are kept. Frame keeps Harbor's internal identifiers (`app.harbor`, `harbor.*` storage keys and `harbor://` links), so an existing profile carries over.

## Build

Requirements: Node with pnpm (through corepack), Rust, and the Tauri 2 prerequisites for your platform.

```sh
corepack pnpm install
corepack pnpm run setup        # fetches mpv, ffmpeg, fonts and other binaries
corepack pnpm tauri dev        # run in development
corepack pnpm tauri build      # build an installer
```

Checks:

```sh
corepack pnpm run typecheck
corepack pnpm test
```

`AGENTS.md` holds the full development notes inherited from Harbor.

## Releases and updates

The in-app updater reads releases from this repository. Before publishing a release, generate your own updater signing key (`pnpm tauri signer generate`), put its public half in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, and store the private half as the `TAURI_SIGNING_PRIVATE_KEY` repository secret. The key in the config today belongs to the Harbor fork, so updates signed by anyone else will not install.

## Contributing

Bug reports and pull requests are welcome. Before opening a pull request, please read the
development notes in `AGENTS.md` and make sure `corepack pnpm run typecheck` and
`corepack pnpm test` pass.

## License

[MIT](./LICENSE). Frame is a modified version of Harbor; the original copyright notice is kept in `LICENSE`.
