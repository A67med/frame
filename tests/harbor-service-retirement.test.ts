// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

// Harbor's hosted services are gone. These checks make sure nothing in the
// default configuration reaches them: no default base points at harbor.site,
// the fetch layer refuses those hosts, and the features that used them stay
// quiet instead of failing loudly.

const requested: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  requested.push(String(input instanceof Request ? input.url : input));
  return new Response("[]", { status: 200 });
}) as typeof fetch;

const endpoints = await import("../src/lib/config/endpoints.ts");
const { safeFetch, safeFetchStream, safeFetchBytes, safeFetchLocal, RetiredServiceError } =
  await import("../src/lib/safe-fetch.ts");
const { fetchAdSegments } = await import("../src/lib/skip-intro/adcorpus.ts");
const { crowdConfigFromSettings, DEFAULT_COMMUNITY_SYNC_URL } =
  await import("../src/lib/subtitles/autosync/crowd-db.ts");
const { submitAdReport } = await import("../src/lib/ad-report/submit.ts");

test("no service base defaults to a Harbor host", () => {
  for (const [name, value] of Object.entries(endpoints)) {
    if (typeof value !== "string") continue;
    assert.equal(/harbor\.site/i.test(value), false, `${name} = ${value}`);
  }
  assert.equal(endpoints.HARBOR_API_BASE, "");
  assert.equal(endpoints.HARBOR_SYNC_BASE, "");
  assert.equal(endpoints.HARBOR_BUGS_BASE, "");
  assert.equal(endpoints.HARBOR_RELAY_BASE, "");
});

test("retired host matching covers the apex and subdomains only", () => {
  for (const host of ["harbor.site", "sync.harbor.site", "BUGS.Harbor.Site"]) {
    assert.equal(endpoints.isRetiredHarborHost(host), true, host);
  }
  for (const host of ["harbor.site.example.com", "notharbor.site", "github.com"]) {
    assert.equal(endpoints.isRetiredHarborHost(host), false, host);
  }
});

test("every safe-fetch entry point refuses retired hosts before any request", async () => {
  requested.length = 0;
  const urls = [
    "https://harbor.site/updates/ad-segments.json",
    "https://sync.harbor.site/api/v1/lookup",
    "https://bugs.harbor.site/v1/adreport",
  ];
  for (const url of urls) {
    await assert.rejects(safeFetch(url), RetiredServiceError);
    await assert.rejects(safeFetchStream(url), RetiredServiceError);
    await assert.rejects(safeFetchBytes(url), RetiredServiceError);
    await assert.rejects(safeFetchLocal(url), RetiredServiceError);
  }
  assert.deepEqual(requested, []);
});

test("other hosts still go through", async () => {
  requested.length = 0;
  const res = await safeFetch("https://example.com/feed.json");
  assert.equal(res.status, 200);
  assert.deepEqual(requested, ["https://example.com/feed.json"]);
});

test("skip-intro ad segments and ad reports stay off without a configured host", async () => {
  requested.length = 0;
  assert.deepEqual(await fetchAdSegments("tt0000001", "ih_synthetic", true), []);
  assert.equal(
    await submitAdReport({
      metaId: "tt0000001",
      imdbId: "tt0000001",
      streamRef: undefined,
      url: "magnet:?xt=urn:btih:0000000000000000000000000000000000000000",
      ranges: [{ startSec: 1, endSec: 5 }],
    }),
    false,
  );
  assert.deepEqual(requested, []);
});

test("community subtitle sync is off unless the user names a server", () => {
  assert.equal(DEFAULT_COMMUNITY_SYNC_URL, "");
  assert.equal(crowdConfigFromSettings({ communitySyncUrl: "" }), null);
  assert.equal(crowdConfigFromSettings({}), null);
  const own = crowdConfigFromSettings({ communitySyncUrl: "https://sync.example.com" });
  assert.equal(own?.baseUrl, "https://sync.example.com");
});

test.after(() => {
  globalThis.fetch = realFetch;
});
