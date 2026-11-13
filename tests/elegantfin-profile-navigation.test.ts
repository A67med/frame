// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";
import { requestOpenProfile, subscribeOpenProfile } from "../src/lib/social/open-profile.ts";
import { WINDOW_HARBOR } from "../src/views/settings/theme-panel/theme-studio/cheat-sheet-data.ts";
import { createThemeDom } from "./helpers/elegantfin-dom.ts";

const appText = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const appSource = ts.createSourceFile(
  "App.tsx",
  appText,
  ts.ScriptTarget.ESNext,
  true,
  ts.ScriptKind.TSX,
);

function propertyInitializer(name: string): string {
  let initializer: string | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer.getText(appSource);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(appSource);
  assert.ok(initializer, name + " property");
  return initializer;
}

function bridgeHelper(name: string): () => unknown {
  return new Function(
    '"use strict"; return (' + propertyInitializer(name) + ");",
  )() as () => unknown;
}

// Frame has no accounts, so the bridge keeps the profile helpers as inert
// no-ops: custom theme code that calls them falls back to its drawer.
test("Frame bridge keeps the profile helpers as no-ops", async () => {
  assert.equal(bridgeHelper("tryViewMyProfile")(), false);
  await assert.doesNotReject(bridgeHelper("viewMyProfile")() as Promise<void>);
  assert.equal(bridgeHelper("unreadCount")(), 0);
});

test("Theme Studio does not document the account-only profile helpers", () => {
  const calls = WINDOW_HARBOR.map((entry) => entry.call);
  assert.ok(!calls.includes("window.harbor.viewMyProfile()"));
  assert.ok(!calls.includes("window.harbor.tryViewMyProfile()"));
});

type ImmediateApi = { tryViewMyProfile?: () => unknown };

function elegantFinScript(): string {
  const themeText = readFileSync(new URL("../src/lib/theme.ts", import.meta.url), "utf8");
  const themeSource = ts.createSourceFile(
    "theme.ts",
    themeText,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  let script: string | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "buildElegantFinJs" && node.body) {
      const returned = node.body.statements.find(ts.isReturnStatement)?.expression;
      assert.ok(returned && ts.isTemplateExpression(returned), "ElegantFin generated template");
      script = returned.head.text;
      for (const span of returned.templateSpans) {
        const expression = span.expression.getText(themeSource);
        const key = /^JSON\.stringify\(t\("([^"]+)"\)\)$/.exec(expression)?.[1];
        assert.ok(key, `unsupported ElegantFin template expression: ${expression}`);
        script += JSON.stringify(key) + span.literal.text;
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(themeSource);
  assert.ok(script, "ElegantFin generated script");
  return script;
}

function mountElegantFin(api?: ImmediateApi, collapsed = false) {
  const dom = createThemeDom(`
    <header class="fixed inset-x-0 top-0"><div>
      <div data-harbor-topbar-leading><button id="native-back" class="rounded-lg">Back</button></div>
      <div><button data-harbor-search class="harbor-search-pill">Search</button></div>
      <div data-harbor-topbar-actions><div class="ms-1"></div></div>
    </div></header>
    <aside data-harbor-sidebar data-collapsed="${collapsed}" aria-hidden="false">
      <div>Frame</div><nav><button data-harbor-nav="home">Home</button></nav>
      <div><div><button data-harbor-sidebar-toggle><svg><path></path></svg></button></div>
        <div class="relative"><div class="h-12 w-12 rounded-full"><img src="/avatar.png"></div></div>
      </div>
    </aside>
    <div id="ef-topleft"><button id="ef-menu">Menu</button></div><div id="ef-scrim"></div>
  `);
  const themeWindow = dom.window as typeof dom.window & {
    harbor?: ImmediateApi;
    __efChromeCleanup?: () => void;
    __harborThemeCleanup?: () => void;
  };
  themeWindow.harbor = api;
  new Function("window", "document", "MutationObserver", "Element", elegantFinScript())(
    themeWindow,
    dom.document,
    dom.Observer,
    dom.Element,
  );
  dom.flush();
  const root = dom.document.documentElement;
  const sidebar = dom.document.querySelector("[data-harbor-sidebar]")!;
  return {
    ...dom,
    sidebar,
    drawerOpen: () => root.classList.contains("ef-drawer-open"),
    setDrawerOpen: (open: boolean) => root.classList.toggle("ef-drawer-open", open),
    cleanup: () => themeWindow.__harborThemeCleanup?.(),
    clickListenerCount: () => dom.listeners("click"),
    keyListenerCount: () => dom.listeners("keydown"),
    intervalWasCleared: () => dom.pendingIntervals() === 0,
  };
}

test("ElegantFin menu remains the independent drawer toggle", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  assert.equal(harness.drawerOpen(), true);
  harness.click("#ef-menu");
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin cleanup removes drawer state and listeners", () => {
  const harness = mountElegantFin({});
  harness.setDrawerOpen(true);
  harness.cleanup();
  assert.equal(harness.drawerOpen(), false);
  assert.equal(harness.clickListenerCount(), 0);
  assert.equal(harness.keyListenerCount(), 0);
  assert.equal(harness.intervalWasCleared(), true);
  assert.equal(harness.activeObservers(), 0);
  assert.equal(harness.document.querySelector("#ef-profile"), null);
  assert.equal(harness.document.querySelector("#ef-search"), null);
  harness.click("#ef-menu");
  assert.equal(harness.drawerOpen(), false);
});

test("ElegantFin Collapse reaches the native settings handler and dismisses the drawer", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  let nativeCalls = 0;
  const event = harness.click("[data-harbor-sidebar-toggle] path", () => {
    nativeCalls += 1;
    harness.sidebar.setAttribute("data-collapsed", "true");
  });
  assert.equal(nativeCalls, 1);
  assert.equal(event.propagationStopped, false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(harness.drawerOpen(), false);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "true");
  harness.cleanup();
});

test("ElegantFin Expand reaches the native settings handler and opens the full drawer", () => {
  const harness = mountElegantFin({}, true);
  let nativeCalls = 0;
  harness.click("[data-harbor-sidebar-toggle] path", () => {
    nativeCalls += 1;
    harness.sidebar.setAttribute("data-collapsed", "false");
  });
  assert.equal(nativeCalls, 1);
  assert.equal(harness.drawerOpen(), true);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "false");
  harness.cleanup();
});

test("ElegantFin observes a collapse setting change while the drawer is open", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.sidebar.setAttribute("data-collapsed", "true");
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin releases the scrim state when navigation unmounts the sidebar", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.sidebar.remove();
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin releases the scrim state when playback hides the sidebar", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.sidebar.setAttribute("aria-hidden", "true");
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin makes only the hidden drawer inert and restores focusability on cleanup", () => {
  const harness = mountElegantFin({});
  assert.equal(harness.sidebar.inert, true);
  harness.click("#ef-menu");
  assert.equal(harness.sidebar.inert, false);
  harness.click("#ef-scrim");
  assert.equal(harness.sidebar.inert, true);
  harness.cleanup();
  assert.equal(harness.sidebar.inert, false);
});

test("ElegantFin keeps collapsed navigation focusable without an open drawer", () => {
  const harness = mountElegantFin({}, true);
  assert.equal(harness.sidebar.inert, false);
  harness.key("Escape");
  assert.equal(harness.sidebar.inert, false);
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin Escape returns focus from the closed drawer to its menu button", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.document.querySelector("[data-harbor-sidebar-toggle]")!.focus();
  harness.key("Escape");
  assert.equal(harness.drawerOpen(), false);
  assert.equal(harness.document.activeElement.id, "ef-menu");
  harness.cleanup();
});

test("ElegantFin Escape preserves focus inside the pinned rail", () => {
  const harness = mountElegantFin({}, true);
  const toggle = harness.document.querySelector("[data-harbor-sidebar-toggle]")!;
  toggle.focus();
  harness.key("Escape");
  assert.equal(harness.document.activeElement === toggle, true);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "true");
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin keeps the collapsed rail setting when Escape or navigation dismisses a drawer", () => {
  const harness = mountElegantFin({}, true);
  harness.key("Escape");
  harness.click("[data-harbor-nav]");
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "true");
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin synchronizes one profile action when the native header is remounted", () => {
  const harness = mountElegantFin({});
  harness.document.querySelector("[data-harbor-topbar-actions]")!.innerHTML =
    '<div class="ms-1"></div>';
  harness.tick();
  assert.equal(harness.document.querySelectorAll("#ef-profile").length, 1);
  assert.equal(harness.document.querySelectorAll("#ef-search").length, 1);
  assert.equal(
    harness.document.querySelector("#ef-profile img")?.getAttribute("src"),
    "/avatar.png",
  );
  harness.cleanup();
});

test("ElegantFin avatar closes the drawer when immediate navigation succeeds", () => {
  let calls = 0;
  const harness = mountElegantFin({
    tryViewMyProfile: () => {
      calls += 1;
      return true;
    },
  });
  harness.setDrawerOpen(true);
  harness.click("#ef-profile");
  assert.equal(calls, 1);
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin avatar opens the drawer when no loaded profile is available", () => {
  let calls = 0;
  const harness = mountElegantFin({
    tryViewMyProfile: () => {
      calls += 1;
      return false;
    },
  });
  harness.click("#ef-profile");
  assert.equal(calls, 1);
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});

test("ElegantFin avatar expands the pinned rail through the native handler when profile navigation fails", () => {
  const harness = mountElegantFin({ tryViewMyProfile: () => false }, true);
  let nativeCalls = 0;
  harness.bindClick("[data-harbor-sidebar-toggle]", () => {
    nativeCalls += 1;
    harness.sidebar.setAttribute("data-collapsed", "false");
  });
  harness.click("#ef-profile");
  assert.equal(nativeCalls, 1);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "false");
  assert.equal(harness.drawerOpen(), true);
  assert.equal(harness.sidebar.inert, false);
  harness.cleanup();
});

test("ElegantFin avatar falls back when the immediate API is missing", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-profile");
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});

test("ElegantFin avatar catches immediate API failures and opens the drawer", () => {
  let calls = 0;
  const harness = mountElegantFin({
    tryViewMyProfile: () => {
      calls += 1;
      throw new Error("broken bridge");
    },
  });
  assert.doesNotThrow(() => harness.click("#ef-profile"));
  assert.equal(calls, 1);
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});

test("ElegantFin treats non-boolean API results as drawer fallback", () => {
  const harness = mountElegantFin({
    tryViewMyProfile: () => "not-the-boolean-contract",
  });
  harness.click("#ef-profile");
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});
