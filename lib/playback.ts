/**
 * Pure playback helpers for the lesson video player.
 */

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Seconds from the end inside which a saved position counts as "finished". */
export const RESUME_END_GUARD_SECONDS = 15;

/**
 * Where to start a video given the saved position. Resuming inside the last
 * 15 s, or at 90 percent or later of a lesson already marked complete, would
 * drop the viewer onto the credits, so restart from 0 instead.
 */
export function resolveResumePosition(
  saved: number,
  duration: number,
  completed: boolean
): number {
  if (!Number.isFinite(saved) || saved <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return saved;
  if (duration - saved <= RESUME_END_GUARD_SECONDS) return 0;
  if (completed && saved >= duration * 0.9) return 0;
  return saved;
}

/** One step up or down the speed ladder from the current rate. */
export function stepSpeed(current: number, direction: 1 | -1): number {
  const list = PLAYBACK_SPEEDS as readonly number[];
  const idx = list.findIndex((s) => Math.abs(s - current) < 1e-6);
  if (idx === -1) {
    // Off-ladder rate: snap to the nearest ladder value in the chosen direction.
    const candidates = direction === 1 ? list.filter((s) => s > current) : list.filter((s) => s < current).reverse();
    return candidates[0] ?? current;
  }
  const nextIdx = Math.min(list.length - 1, Math.max(0, idx + direction));
  return list[nextIdx];
}

/** Browsers cannot decode these containers natively. */
export const UNPLAYABLE_EXTENSIONS = [".avi", ".flv", ".wmv", ".mkv"];

export function hasUnplayableExtension(file: string): boolean {
  const lower = file.toLowerCase();
  return UNPLAYABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
