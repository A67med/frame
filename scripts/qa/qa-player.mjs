// Player reliability run against the isolated QA build of Frame.
// Usage: node qa-player.mjs <exe> <media> <outJson> [cycles]
// The QA build uses its own identifier, so its settings and WebView storage live in
// fresh folders; APPDATA/LOCALAPPDATA are pointed at a temp folder for the
// environment-based lookups too. Nothing here touches the owner's Frame profile.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { connect, invokeJs } from "./cdp.mjs";

const [, , exe, media, outJson, cyclesArg = "8", badMedia = ""] = process.argv;
const cycles = Number(cyclesArg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333;
const envRoot = join(dirname(outJson), "env");
mkdirSync(join(envRoot, "Roaming"), { recursive: true });
mkdirSync(join(envRoot, "Local"), { recursive: true });
const env = {
  ...process.env,
  APPDATA: join(envRoot, "Roaming"),
  // Only Frame's legacy-data lookup and game launcher probes read these variables; the
  // QA identifier already keeps Tauri's own folders and WebView storage separate.
  LOCALAPPDATA: join(envRoot, "Local"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  PATH: `${process.env.FRAME_LIBMPV_DIR};${process.env.PATH}`,
};
const log = [];
const note = (what, data = {}) => {
  const row = { t: Date.now(), what, ...data };
  log.push(row);
  console.log(JSON.stringify(row));
};

function launch(args = []) {
  const child = spawn(exe, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: false });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

function processStats(pid) {
  const ps = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { '{0}|{1}|{2}|{3}' -f $p.WorkingSet64, $p.PrivateMemorySize64, $p.HandleCount, $p.Threads.Count }`;
  const out = execFileSync("powershell", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
  }).trim();
  if (!out) return null;
  const [ws, priv, handles, threads] = out.split("|").map(Number);
  return {
    wsMB: +(ws / 1048576).toFixed(1),
    privMB: +(priv / 1048576).toFixed(1),
    handles,
    threads,
  };
}

function webviewStats() {
  // WebView2 processes for the QA profile only (their command line names its data folder).
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.CommandLine -like '*io.github.frame.qa*' } | ForEach-Object { $_.WorkingSetSize } | Measure-Object -Sum | ForEach-Object { '{0}|{1}' -f $_.Count, $_.Sum }";
  const out = execFileSync("powershell", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
  }).trim();
  const [count, sum] = out.split("|").map(Number);
  return { procs: count || 0, wsMB: +((sum || 0) / 1048576).toFixed(1) };
}

const mpv = (cdp, name) =>
  cdp.evaluate(
    `${invokeJs("mpv_get_property", { name })}.then(v => v, e => ({ error: String(e) }))`,
  );

async function waitFor(fn, ms, step = 250) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

// Playing means mpv has the file and time is moving (a resumed file may start late in it).
const playing = async (cdp) => {
  const a = await mpv(cdp, "time-pos");
  if (typeof a !== "number") return null;
  await sleep(400);
  const b = await mpv(cdp, "time-pos");
  return typeof b === "number" && b > a ? b : null;
};
const isPaused = async (cdp) => {
  const v = await mpv(cdp, "pause");
  return v === true || v === "yes";
};

const main = launch();
note("launched", { pid: main.pid });
const consoleErrors = [];
const watchErrors = async (c) => {
  await c.send("Runtime.enable");
  c.on("Runtime.exceptionThrown", (p) =>
    consoleErrors.push({
      kind: "exception",
      text: (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "").slice(
        0,
        300,
      ),
    }),
  );
  c.on("Runtime.consoleAPICalled", (p) => {
    if (p.type !== "error") return;
    consoleErrors.push({
      kind: "console.error",
      text: p.args
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 300),
    });
  });
};
let cdp = await connect(port, {
  match: (t) => t.type === "page" && /localhost:1420|tauri\.localhost/.test(t.url),
});
note("cdp", { url: cdp.target.url });
await waitFor(
  async () => (await cdp.evaluate("document.getElementById('root')?.innerHTML.length || 0")) > 1000,
  120_000,
);
await cdp.evaluate(
  `localStorage.setItem("harbor.onboarding", JSON.stringify({ onboarded: true, nudges: {} }))`,
);
await cdp.send("Page.reload");
cdp.close();
await sleep(4000);
cdp = await connect(port, {
  match: (t) => t.type === "page" && /localhost:1420|tauri\.localhost/.test(t.url),
});
await watchErrors(cdp);
await waitFor(
  async () => (await cdp.evaluate("document.getElementById('root')?.innerHTML.length || 0")) > 1000,
  120_000,
);
await sleep(5000);
note("idle-before", { app: processStats(main.pid), webview: webviewStats() });

const results = [];
const openFile = async (path) => {
  // A second launch hands the file to the running instance, like opening it from Explorer.
  const relay = launch([path]);
  await new Promise((r) => relay.on("exit", r));
};

if (badMedia) {
  await openFile(badMedia);
  await sleep(8000);
  const err = await cdp.evaluate(
    `[...document.querySelectorAll('[role="alert"], [data-player-error]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 3)`,
  );
  const t = await mpv(cdp, "time-pos");
  note("bad-media", { errorText: err, timePos: t });
  await cdp.key("Escape", "Escape", 27);
  await sleep(2500);
}

for (let i = 0; i < cycles; i++) {
  const r = { cycle: i + 1 };
  const t0 = Date.now();
  await openFile(media);
  const started = await waitFor(() => playing(cdp), 30_000);
  r.startMs = started ? Date.now() - t0 : null;
  r.started = !!started;
  if (!started) {
    r.failure = await cdp.evaluate(`document.body.innerText.slice(0, 300)`);
    results.push(r);
    note("cycle", r);
    continue;
  }
  const tracks = await mpv(cdp, "track-list");
  r.tracks = Array.isArray(tracks)
    ? tracks.map((x) => `${x.type}:${x.id}${x.lang ? `:${x.lang}` : ""}${x.selected ? "*" : ""}`)
    : tracks;

  // Pause and resume with Space.
  // Start from the top so every cycle exercises the same stretch of the file.
  await cdp.evaluate(
    `${invokeJs("mpv_command", { cmd: ["seek", 0, "absolute"] })}.catch(() => {})`,
  );
  await sleep(600);
  await cdp.key(" ", "Space", 32);
  await sleep(700);
  r.pausedAfterSpace = await isPaused(cdp);
  await cdp.key(" ", "Space", 32);
  await sleep(700);
  r.resumedAfterSpace = !(await isPaused(cdp));

  // Seek forward with the right arrow.
  const before = await mpv(cdp, "time-pos");
  await cdp.key("ArrowRight", "ArrowRight", 39);
  await sleep(1500);
  const after = await mpv(cdp, "time-pos");
  r.seekDelta =
    typeof before === "number" && typeof after === "number" ? +(after - before).toFixed(2) : null;

  // Cycle subtitles with S and audio through the bridge's own property.
  const sid0 = await mpv(cdp, "sid");
  await cdp.key("s", "KeyS", 83);
  await sleep(900);
  r.sid = [sid0, await mpv(cdp, "sid")];
  const aid0 = await mpv(cdp, "aid");
  await cdp.evaluate(`${invokeJs("mpv_set_property", { name: "aid", value: 2 })}.catch(() => {})`);
  await sleep(900);
  r.aid = [aid0, await mpv(cdp, "aid")];

  // Fullscreen in and out with F.
  const w0 = await cdp.evaluate("window.outerWidth + 'x' + window.outerHeight");
  await cdp.key("f", "KeyF", 70);
  await sleep(1800);
  const w1 = await cdp.evaluate("window.outerWidth + 'x' + window.outerHeight");
  await cdp.key("f", "KeyF", 70);
  await sleep(1800);
  const w2 = await cdp.evaluate("window.outerWidth + 'x' + window.outerHeight");
  r.fullscreen = [w0, w1, w2];

  r.fsBeforeEsc = await cdp.evaluate(
    `Promise.all([window.__TAURI_INTERNALS__.invoke("plugin:window|is_fullscreen", { label: "main" }).catch(e => 'ERR ' + e), !!document.fullscreenElement, document.activeElement && (document.activeElement.tagName + '.' + (document.activeElement.getAttribute('aria-label') || ''))])`,
  );
  // Close with Escape, answering the leave confirmation (on by default) with Leave.
  await cdp.key("Escape", "Escape", 27);
  await sleep(1200);
  r.leaveConfirmShown = await cdp.evaluate(
    `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Leave'); if (b) { b.click(); return true } return false })()`,
  );
  await sleep(2500);
  r.playerGone = await cdp.evaluate(`!document.body.innerText.includes('Hold for more options')`);
  if (!r.playerGone) {
    // Record whether a second Escape gets through, then make sure the cycle ends closed.
    await cdp.key("Escape", "Escape", 27);
    await sleep(1200);
    r.secondEscConfirm = await cdp.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Leave'); if (b) { b.click(); return true } return false })()`,
    );
    await sleep(2000);
    r.playerGoneAfterSecondEsc = await cdp.evaluate(
      `!document.body.innerText.includes('Hold for more options')`,
    );
  }
  const stillPlaying = await mpv(cdp, "time-pos");
  r.stoppedAfterClose = !(typeof stillPlaying === "number" && stillPlaying > 0);
  r.afterClose = stillPlaying;
  await sleep(1500);
  r.app = processStats(main.pid);
  r.webview = webviewStats();
  results.push(r);
  note("cycle", r);
}

await sleep(8000);
note("idle-after", { app: processStats(main.pid), webview: webviewStats() });
writeFileSync(outJson, JSON.stringify({ results, log, consoleErrors }, null, 1));
cdp.close();
try {
  execFileSync("taskkill", ["/PID", String(main.pid), "/T", "/F"]);
} catch {}
note("done");
