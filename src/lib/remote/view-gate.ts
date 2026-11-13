/** The parts of a nav item that decide whether a remote may open its view. */
export type GatedView = {
  view: string;
  pinGated?: boolean;
  parentalKey?: string;
};

/**
 * Whether a remote's `goView` may open `view`. While parental controls are
 * locked, a remote gets no further than the sidebar would: PIN-gated views
 * (Settings) and tabs the parent hid stay closed.
 */
export function remoteMayOpenView(
  view: string,
  items: readonly GatedView[],
  locked: boolean,
  hiddenTabs: Readonly<Record<string, boolean | undefined>>,
): boolean {
  if (!locked) return true;
  const item = items.find((entry) => entry.view === view);
  if (!item) return true;
  if (item.pinGated) return false;
  return !(item.parentalKey && hiddenTabs[item.parentalKey]);
}
