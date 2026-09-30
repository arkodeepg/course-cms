/**
 * Decides how eagerly the lesson video should buffer before the viewer presses play.
 *
 * Desktops (fine pointer, no Save-Data) keep `preload="auto"` so playback starts
 * instantly. Phones and tablets (coarse pointer) and anyone with Save-Data on get
 * `"metadata"`, which fetches only enough to show duration and the first frame;
 * the player upgrades to `"auto"` once playback starts.
 */
export type PreloadMode = "auto" | "metadata";

export interface PreloadEnv {
  /** `matchMedia("(pointer: coarse)").matches` */
  coarsePointer: boolean;
  /** `navigator.connection?.saveData` */
  saveData?: boolean | null;
  /** True once the viewer has started playback in this lesson. */
  hasPlayed?: boolean;
}

export function choosePreload({ coarsePointer, saveData, hasPlayed }: PreloadEnv): PreloadMode {
  if (hasPlayed) return "auto";
  if (coarsePointer || saveData === true) return "metadata";
  return "auto";
}

/** The value rendered on the server and on the first client render, before the environment is known. */
export const SSR_PRELOAD: PreloadMode = "metadata";
