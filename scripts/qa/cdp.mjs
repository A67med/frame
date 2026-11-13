// Minimal Chrome DevTools Protocol client for the QA build of Frame (WebView2).
export async function connect(port, { timeoutMs = 90_000, match = (t) => t.type === "page" } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  let target;
  while (!target && Date.now() - started < timeoutMs) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find(match);
    } catch {}
    if (!target) await sleep(500);
  }
  if (!target) throw new Error(`no CDP target on port ${port}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method && handlers.has(m.method)) {
      for (const h of handlers.get(m.method)) h(m.params);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.exception?.description || "evaluate failed");
    }
    return res.result?.result?.value;
  };
  const on = (method, fn) => {
    if (!handlers.has(method)) handlers.set(method, []);
    handlers.get(method).push(fn);
  };
  const key = async (key, code, vk, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      windowsVirtualKeyCode: vk,
      modifiers,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: vk,
      modifiers,
    });
  };
  return { send, evaluate, on, key, close: () => ws.close(), target };
}

/** Calls a Tauri command from the page, the same way the app does. */
export const invokeJs = (cmd, args = {}) =>
  `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
