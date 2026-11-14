// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import { canAutoRetryStuckLoad, hasPlaybackStartedForStallCheck } from "../src/lib/player/stall-wait.ts";

test("paused playback is not treated as a stalled stream", () => {
  assert.equal(
    hasPlaybackStartedForStallCheck({
      status: "paused",
      positionSec: 0,
      videoWidth: 0,
      videoHeight: 0,
    }),
    true,
  );
});

test("a decoded frame counts as playback before the clock advances", () => {
  assert.equal(
    hasPlaybackStartedForStallCheck({
      status: "loading",
      positionSec: 0,
      videoWidth: 1920,
      videoHeight: 1080,
    }),
    true,
  );
});

test("a source with no playback evidence remains eligible for stall skipping", () => {
  assert.equal(
    hasPlaybackStartedForStallCheck({
      status: "playing",
      positionSec: 0,
      videoWidth: 0,
      videoHeight: 0,
    }),
    false,
  );
});

const unstarted = {
  status: "loading",
  positionSec: 0,
  durationSec: 0,
  firstFrameReady: false,
  videoWidth: 0,
  videoHeight: 0,
};

test("stuck load retry is disabled while paused, including a pause before the first frame", () => {
  assert.equal(canAutoRetryStuckLoad({ ...unstarted, status: "paused" }, 0), false);
  assert.equal(canAutoRetryStuckLoad({ ...unstarted, status: "paused" }, 0.1), false);
});

test("stuck load retry is disabled once a frame, duration or progress exists", () => {
  assert.equal(canAutoRetryStuckLoad({ ...unstarted, firstFrameReady: true }, 0), false);
  assert.equal(canAutoRetryStuckLoad({ ...unstarted, videoWidth: 1280, videoHeight: 720 }, 0), false);
  assert.equal(canAutoRetryStuckLoad({ ...unstarted, durationSec: 90 }, 0), false);
  assert.equal(canAutoRetryStuckLoad(unstarted, 0.5), false);
});

test("stuck load retry remains available when an active stream has no frame", () => {
  assert.equal(canAutoRetryStuckLoad(unstarted, 0), true);
  assert.equal(canAutoRetryStuckLoad({ ...unstarted, status: "playing" }, 0), true);
});
