import { CourseEntry, getLessonsFlat } from '@/lib/courses';
import { buildCourseSummaries, ProgressRow, resumeHrefFor } from '@/lib/library';
import { Category } from '@/types/course';
import { croCourse, larsenCourse } from '@/test/fixtures/courses';

const entries: CourseEntry[] = [
  { courseId: larsenCourse.course, index: larsenCourse, dir: 'Matthew Larsen' },
  { courseId: croCourse.course, index: croCourse, dir: 'CRO' },
  { courseId: 'empty', index: { ...croCourse, course: 'empty', title: undefined, cover: undefined }, dir: 'empty' },
];

const t = (s: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, s));
const row = (courseId: string, lessonFile: string, s: number, completed = false, pos = 0): ProgressRow => ({
  courseId,
  lessonFile,
  completed,
  positionSeconds: pos,
  updatedAt: t(s),
});

// The per-course code the homepage used before, kept here as the reference.
function legacyResume(courseId: string, categories: Category[], rows: ProgressRow[]): string | null {
  const latest = rows
    .filter((r) => r.courseId === courseId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  if (!latest) return null;
  for (let ci = 0; ci < categories.length; ci++) {
    const flat = getLessonsFlat(categories[ci]);
    const li = flat.findIndex((l) => l.file === latest.lessonFile);
    if (li !== -1) return `/course/${courseId}/${ci + 1}/${li + 1}`;
  }
  return null;
}

function legacyCounts(entry: CourseEntry, rows: ProgressRow[]) {
  const allFiles = new Set(entry.index.categories.flatMap((c) => getLessonsFlat(c)).map((l) => l.file));
  const mine = rows.filter((r) => r.courseId === entry.courseId);
  return {
    completedCount: mine.filter((r) => r.completed && allFiles.has(r.lessonFile)).length,
    startedCount: mine.filter((r) => !r.completed && r.positionSeconds > 1 && allFiles.has(r.lessonFile)).length,
  };
}

const rowSets: Record<string, ProgressRow[]> = {
  none: [],
  simple: [
    row('matthew-larsen-10k-per-month', '01 - Offer.mp4', 10, true),
    row('matthew-larsen-10k-per-month', '02 - Scripts.mp4', 20, false, 30),
    row('cro-masterclass', '02.mp4', 5, false, 0.5),
  ],
  latestInSecondModule: [
    row('matthew-larsen-10k-per-month', '01 - Offer.mp4', 10, true),
    row('matthew-larsen-10k-per-month', '03 - Hiring.mp4', 99, false, 3),
  ],
  // The newest row points at a file that left the index: no resume link, no fallback.
  latestIsStale: [
    row('matthew-larsen-10k-per-month', '02 - Scripts.mp4', 10, false, 30),
    row('matthew-larsen-10k-per-month', 'gone.mp4', 50, true),
    row('cro-masterclass', '03.mp4', 40, true),
    row('orphan-course', 'x.mp4', 70, true),
  ],
};

describe('resume parity with the per-course query', () => {
  for (const [name, rows] of Object.entries(rowSets)) {
    it(`matches for row set "${name}"`, () => {
      const ordered = [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const summaries = buildCourseSummaries(entries, ordered);
      for (const e of entries) {
        const s = summaries.find((x) => x.courseId === e.courseId)!;
        expect(s.resumeHref).toBe(legacyResume(e.courseId, e.index.categories, rows));
        expect({ completedCount: s.completedCount, startedCount: s.startedCount }).toEqual(
          legacyCounts(e, rows)
        );
      }
    });
  }

  it('resumeHrefFor returns null without a latest row', () => {
    expect(resumeHrefFor('x', croCourse.categories, null)).toBeNull();
  });
});

describe('course summaries', () => {
  it('projects counts, cover, title and duration', () => {
    const [larsen, cro, empty] = ['matthew-larsen-10k-per-month', 'cro-masterclass', 'empty'].map(
      (id) => buildCourseSummaries(entries, rowSets.simple).find((s) => s.courseId === id)!
    );
    expect(larsen).toMatchObject({
      title: 'Matthew Larsen - 10k Per Month',
      hasCover: false,
      totalLessons: 3,
      moduleCount: 2,
      completedCount: 1,
      startedCount: 1,
      missingCount: 1,
      resumeHref: '/course/matthew-larsen-10k-per-month/1/2',
      resumeLessonTitle: expect.any(String),
      lastActiveAt: t(20).toISOString(),
      durationSeconds: null,
    });
    expect(cro).toMatchObject({ hasCover: true, totalLessons: 3, moduleCount: 1, startedCount: 0, durationSeconds: 5400 });
    expect(empty).toMatchObject({ title: 'Empty', resumeHref: null, resumeLessonTitle: null, lastActiveAt: null });
  });

  it('sorts most recently active first and keeps discovery order for the rest', () => {
    const ids = buildCourseSummaries(entries, rowSets.simple).map((s) => s.courseId);
    expect(ids).toEqual(['matthew-larsen-10k-per-month', 'cro-masterclass', 'empty']);
    const ids2 = buildCourseSummaries(entries, rowSets.latestIsStale).map((s) => s.courseId);
    expect(ids2).toEqual(['matthew-larsen-10k-per-month', 'cro-masterclass', 'empty']);
    const ids3 = buildCourseSummaries(entries, []).map((s) => s.courseId);
    expect(ids3).toEqual(entries.map((e) => e.courseId));
  });

  it('carries no lesson tree', () => {
    const s = buildCourseSummaries(entries, [])[0] as unknown as Record<string, unknown>;
    expect(Object.keys(s).sort()).toEqual(
      [
        'completedCount', 'courseId', 'durationSeconds', 'hasCover', 'lastActiveAt', 'missingCount',
        'moduleCount', 'resumeHref', 'resumeLessonTitle', 'startedCount', 'title', 'totalLessons',
      ].sort()
    );
  });
});
