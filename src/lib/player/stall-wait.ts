export const STALL_WAIT_OPTIONS = [10, 20, 30, 45, 60] as const;

const MIN_SEC = 5;
const MAX_SEC = 120;
const FALLBACK_SEC = 10;

export function stallWaitSec(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return FALLBACK_SEC;
  return Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(value)));
}

export function stallWaitMs(value: number | undefined): number {
  return stallWaitSec(value) * 1000;
}

export function hasPlaybackStartedForStallCheck(params: {
  status: string;
  positionSec: number;
  videoWidth: number;
  videoHeight: number;
}): boolean {
  return (
    params.status === "paused" ||
    params.positionSec > 0 ||
    (params.videoWidth > 0 && params.videoHeight > 0)
  );
}

/** Only recover a genuinely unstarted stream; a paused first frame must not be reloaded. */
export function canAutoRetryStuckLoad(
  snapshot: {
    status: string;
    positionSec: number;
    durationSec: number;
    firstFrameReady: boolean;
    videoWidth: number;
    videoHeight: number;
  },
  clockPositionSec: number,
): boolean {
  if (snapshot.status !== "loading" && snapshot.status !== "playing") return false;
  if (snapshot.firstFrameReady || snapshot.durationSec > 0) return false;
  return !hasPlaybackStartedForStallCheck({
    status: snapshot.status,
    positionSec: Math.max(snapshot.positionSec, clockPositionSec),
    videoWidth: snapshot.videoWidth,
    videoHeight: snapshot.videoHeight,
  });
}
