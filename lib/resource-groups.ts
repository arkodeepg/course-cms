// Which resource groups are expanded. Pure so it is unit tested.
//
// A group the reader has not touched follows the default: on a wide screen
// every group is open (the page reads as one long list, as it always has); on a
// phone only the first group is open, so a course with hundreds of files starts
// as a short list of group headers. While a name or type filter is active every
// matching group opens, so a filter always shows all of its matches. Once the
// reader taps a header, their choice wins until the filter changes.

export type GroupToggle = "open" | "closed";

export interface GroupOpenContext {
  /** Phone-width layout. */
  compact: boolean;
  /** A name or type filter is active. */
  filtering: boolean;
}

export function isGroupOpen(
  toggle: GroupToggle | undefined,
  position: number,
  ctx: GroupOpenContext
): boolean {
  if (toggle) return toggle === "open";
  if (ctx.filtering || !ctx.compact) return true;
  return position === 0;
}

// Tapping a header flips whatever the reader currently sees.
export function nextToggle(currentlyOpen: boolean): GroupToggle {
  return currentlyOpen ? "closed" : "open";
}
