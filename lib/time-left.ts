// "Time left" arithmetic for the lesson sidebar. Pure, so it is unit tested and
// shared by the course header, module rows and lesson rows.
//
// Left = the durations of unfinished lessons, minus the saved playback position
// of lessons that are started but not complete. Lessons without a known
// duration (PDF and text lessons) count for nothing on either side.

export interface TimedLesson {
  file: string;
  duration_seconds?: number | null;
}

// lessonFile -> saved position in seconds, for started but unfinished lessons.
export type PositionMap = Readonly<Record<string, number>>;

export interface TimeTotals {
  // Sum of known durations. Zero means nothing in the group is timed.
  total: number;
  // Seconds still to watch, 0..total.
  left: number;
}

function knownDuration(lesson: TimedLesson): number | null {
  const d = lesson.duration_seconds;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null;
}

// Seconds left in one lesson, or null when its length is unknown.
export function lessonSecondsLeft(
  lesson: TimedLesson,
  completed: ReadonlySet<string>,
  positions: PositionMap
): number | null {
  const d = knownDuration(lesson);
  if (d === null) return null;
  if (completed.has(lesson.file)) return 0;
  const raw = positions[lesson.file];
  const pos = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
  return Math.max(0, d - Math.min(pos, d));
}

export function timeTotals(
  lessons: readonly TimedLesson[],
  completed: ReadonlySet<string>,
  positions: PositionMap
): TimeTotals {
  let total = 0;
  let left = 0;
  for (const l of lessons) {
    const d = knownDuration(l);
    if (d === null) continue;
    total += d;
    left += lessonSecondsLeft(l, completed, positions) ?? 0;
  }
  return { total, left };
}

// Watched share of a group, 0..100. Zero when nothing is timed.
export function watchedPercent({ total, left }: TimeTotals): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, ((total - left) / total) * 100));
}

// True once any lesson in the group is completed or has a saved position.
export function isStarted(
  lessons: readonly TimedLesson[],
  completed: ReadonlySet<string>,
  positions: PositionMap
): boolean {
  return lessons.some((l) => completed.has(l.file) || (positions[l.file] ?? 0) > 0);
}
