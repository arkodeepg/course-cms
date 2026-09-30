// Client-side ordering, filtering and totals for the library page. Pure so
// they are unit tested without React.
import { CourseSummary } from "@/types/course";

export type LibrarySort = "recent" | "az" | "progress" | "duration";

export const LIBRARY_SORTS: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "az", label: "A-Z" },
  { value: "progress", label: "Progress" },
  { value: "duration", label: "Duration" },
];

export function isLibrarySort(v: unknown): v is LibrarySort {
  return v === "recent" || v === "az" || v === "progress" || v === "duration";
}

function activeMs(c: CourseSummary): number | null {
  if (!c.lastActiveAt) return null;
  const t = Date.parse(c.lastActiveAt);
  return Number.isNaN(t) ? null : t;
}

function byRecent(a: CourseSummary, b: CourseSummary): number {
  const ta = activeMs(a);
  const tb = activeMs(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return tb - ta;
}

function completion(c: CourseSummary): number {
  return c.totalLessons > 0 ? c.completedCount / c.totalLessons : 0;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

// Returns a new array; the input (server order, most recent first) is untouched.
// Array.prototype.sort is stable, so ties keep the incoming order.
export function sortCourses(courses: readonly CourseSummary[], mode: LibrarySort): CourseSummary[] {
  const list = [...courses];
  switch (mode) {
    case "az":
      return list.sort((a, b) => collator.compare(a.title, b.title));
    case "progress":
      // Most complete first; courses with started lessons outrank untouched ones.
      return list.sort(
        (a, b) =>
          completion(b) - completion(a) ||
          b.startedCount - a.startedCount ||
          byRecent(a, b)
      );
    case "duration":
      // Longest first; courses without a known duration go last.
      return list.sort((a, b) => {
        const da = a.durationSeconds ?? -1;
        const db = b.durationSeconds ?? -1;
        return db - da;
      });
    case "recent":
    default:
      return list.sort(byRecent);
  }
}

// Case and accent insensitive substring match on the title.
export function filterCourses(courses: readonly CourseSummary[], query: string): CourseSummary[] {
  const q = normalise(query);
  if (!q) return [...courses];
  const terms = q.split(/\s+/);
  return courses.filter((c) => {
    const t = normalise(c.title);
    return terms.every((term) => t.includes(term));
  });
}

function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .toLowerCase()
    .trim();
}

// Up to `limit` courses with activity, newest first.
export function continueCourses(courses: readonly CourseSummary[], limit = 3): CourseSummary[] {
  return courses
    .filter((c) => c.resumeHref !== null && activeMs(c) !== null)
    .sort(byRecent)
    .slice(0, limit);
}

export interface LibraryStats {
  courses: number;
  lessons: number;
  completed: number;
  percentComplete: number;
  // Sum of the known durations; null when no course reports one.
  durationSeconds: number | null;
}

export function libraryStats(courses: readonly CourseSummary[]): LibraryStats {
  let lessons = 0;
  let completed = 0;
  let duration = 0;
  let anyDuration = false;
  for (const c of courses) {
    lessons += c.totalLessons;
    completed += Math.min(c.completedCount, c.totalLessons);
    if (typeof c.durationSeconds === "number" && c.durationSeconds > 0) {
      duration += c.durationSeconds;
      anyDuration = true;
    }
  }
  return {
    courses: courses.length,
    lessons,
    completed,
    percentComplete: lessons > 0 ? Math.round((completed / lessons) * 100) : 0,
    durationSeconds: anyDuration ? duration : null,
  };
}
