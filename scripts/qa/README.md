# Desktop player QA

`qa-player.mjs` drives a real Frame window, not a mock. It opens a media file the way Explorer's "Open with Frame" does, then exercises the player through its keyboard shortcuts and through mpv's own properties:

- pause and resume
- seeking
- subtitle and audio track changes
- fullscreen in and out
- closing through the leave confirmation

It runs that cycle as many times as you ask, records process memory, handles and threads after each one, and collects page errors.

## Keep it away from your own Frame

Never point this at your normal install. Build a QA binary with its own identifier, so its settings and WebView storage live in fresh folders. The QA build also registers no URL schemes, so it leaves the `frame://` association of your installed copy alone:

```bash
TAURI_CONFIG='{"identifier":"io.github.frame.qa","productName":"Frame QA","plugins":{"deep-link":{"mobile":[],"desktop":{"schemes":[]}}},"bundle":{"externalBin":[],"resources":[]}}' cargo build --manifest-path src-tauri/Cargo.toml
```

The harness also points `APPDATA` and `LOCALAPPDATA` at a folder next to its output. Only the legacy-data migration and the game launcher probes read those variables.

Afterwards, delete `%APPDATA%\io.github.frame.qa` and `%LOCALAPPDATA%\io.github.frame.qa` if you want the QA profile gone.

## Run

The debug build loads the frontend from the dev server, so start `pnpm dev` first.

Make synthetic test media with ffmpeg. This gives a 40-second test pattern with two audio tracks; mux two `.srt` files in with `-i` and `-map` if you want subtitle tracks too:

```bash
ffmpeg -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=40" -f lavfi -i "sine=frequency=440:duration=40" -f lavfi -i "sine=frequency=880:duration=40" -map 0:v -map 1:a -map 2:a -c:v libx264 -pix_fmt yuv420p -c:a aac "QA Test Pattern (2026).mkv"
```

Then run it. The fifth argument is optional: a file the player should survive, such as a truncated copy made with `head -c 300000`.

```bash
FRAME_LIBMPV_DIR="<repo>\src-tauri\libmpv" node scripts/qa/qa-player.mjs src-tauri/target/debug/frame.exe "<media>" qa-out/result.json 10 "<broken media>"
```

`result.json` holds one row per cycle:

- `started`, `startMs`
- `pausedAfterSpace`, `resumedAfterSpace`
- `seekDelta`
- `sid`, `aid` (before and after)
- `fullscreen` (window sizes)
- `leaveConfirmShown`, `playerGone`, `stoppedAfterClose`
- `app` and `webview` memory

Remote debugging uses port 9333, so nothing else may hold it.
