export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.6;
export const UI_SCALE_STEP = 0.05;
export const UI_SCALE_ACTIVITY_EVENT = "harbor:ui-scale-activity";

export function clampUiScale(scale: number): number {
  return Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, Math.round(scale * 100) / 100));
}
