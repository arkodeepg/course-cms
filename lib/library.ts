import { Category, CourseSummary } from '@/types/course';
import { CourseEntry, getLessonsFlat, isMissingLesson, parseLessonDescription } from '@/lib/courses';
import { courseTitle } from '@/lib/utils';

// One Progress row as the library page selects it.
export interface ProgressRow {
  courseId: string;
  lessonFile: string;
  completed: boolean;
  positionSeconds: number;
  updatedAt: Date;
}

// The lesson href for a course's most recently touched progress row. Mirrors
// the old per-course buildResumeHref: it looks only at the single latest row,
// and a latest row whose lesson is no longer in the index yields null rather
// than falling back to an older row.
export function resumeHrefFor(
  courseId: string,
  categories: Category[],
  latestLessonFile: string | null
): string | null {
  if (latestLessonFile === null) return null;
  for (let ci = 0; ci < categories.length; ci++) {
    const flat = getLessonsFlat(categories[ci]);
    const li = flat.findIndex((l) => l.file === latestLessonFile);
    if (li !== -1) return `/course/${courseId}/${ci + 1}/${li + 1}`;
  }
  return null;
}

// Groups every progress row by course. Within a course, the latest row is the
// one with the greatest updatedAt; on a tie the earlier row in `rows` wins, so
// pass rows ordered by updatedAt desc to match findFirst's ordering.
export function groupProgress(rows: ProgressRow[]): Map<string, ProgressRow[]> {
  const byCourse = new Map<string, ProgressRow[]>();
  for (const r of rows) {
    let list = byCourse.get(r.courseId);
    if (!list) {
      list = [];
      byCourse.set(r.courseId, list);
    }
    list.push(r);
  }
  return byCourse;
}

function latestRow(rows: ProgressRow[]): ProgressRow | null {
  let best: ProgressRow | null = null;
  for (const r of rows) {
    if (best === null || r.updatedAt.getTime() > best.updatedAt.getTime()) best = r;
  }
  return best;
}

export function summarizeCourse(entry: CourseEntry, rows: ProgressRow[]): CourseSummary {
  const { courseId, index } = entry;
  const lessons = index.categories.flatMap((c) => getLessonsFlat(c));
  const allFiles = new Set(lessons.map((l) => l.file));

  let completedCount = 0;
  let startedCount = 0;
  for (const r of rows) {
    if (!allFiles.has(r.lessonFile)) continue;
    if (r.completed) completedCount += 1;
    else if (r.positionSeconds > 1) startedCount += 1;
  }

  const latest = latestRow(rows);
  const resumeHref = resumeHrefFor(courseId, index.categories, latest ? latest.lessonFile : null);
  const resumeLesson =
    resumeHref !== null && latest ? lessons.find((l) => l.file === latest.lessonFile) : undefined;

  return {
    courseId,
    title: courseTitle(courseId, index),
    hasCover: Boolean(index.cover),
    totalLessons: lessons.length,
    moduleCount: index.categories.length,
    completedCount,
    startedCount,
    missingCount: lessons.filter(isMissingLesson).length,
    resumeHref,
    resumeLessonTitle: resumeLesson ? parseLessonDescription(resumeLesson).title || null : null,
    lastActiveAt: latest ? latest.updatedAt.toISOString() : null,
    durationSeconds: typeof index.duration_seconds === 'number' ? index.duration_seconds : null,
  };
}

// Most recently active first; courses never opened keep discovery order at the end.
export function sortSummaries(summaries: CourseSummary[]): CourseSummary[] {
  return summaries.sort((a, b) => {
    if (!a.lastActiveAt && !b.lastActiveAt) return 0;
    if (!a.lastActiveAt) return 1;
    if (!b.lastActiveAt) return -1;
    return Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt);
  });
}

export function buildCourseSummaries(
  entries: readonly CourseEntry[],
  rows: ProgressRow[]
): CourseSummary[] {
  const byCourse = groupProgress(rows);
  return sortSummaries(entries.map((e) => summarizeCourse(e, byCourse.get(e.courseId) ?? [])));
}
