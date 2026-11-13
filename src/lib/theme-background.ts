import type { ThemeBackground } from "@/lib/theme";

type WithBackground = { background?: ThemeBackground } | null | undefined;

/**
 * The Default theme used to ship frame-default-bg.png, and choosing a preset
 * stores its background URL in the user's settings. That asset is gone (the
 * Default theme is now a plain canvas), so a stored reference to it is read as
 * "no image" instead of pointing at a missing file. User-chosen images, data
 * URLs and gradients are never affected.
 */
export function isRetiredPresetBackground(image: string | null | undefined): boolean {
  if (!image || image.startsWith("data:")) return false;
  return /(^|\/)frame-default-bg(?:[-.][^/]*)?\.png(?:[?#].*)?$/i.test(image);
}

/** The stored background with retired preset assets dropped. */
export function storedBackgroundImage(image: string | null | undefined): string | null {
  return image && !isRetiredPresetBackground(image) ? image : null;
}

export function isThemeOwnedBackground(current: string | null, preset: WithBackground): boolean {
  if (!current) return false;
  return current === preset?.background?.image;
}

export function nextBackgroundImage(
  current: string | null,
  previous: WithBackground,
  next: WithBackground,
): string | null {
  const stored = storedBackgroundImage(current);
  if (!stored || isThemeOwnedBackground(stored, previous)) return next?.background?.image ?? null;
  return stored;
}
