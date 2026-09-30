import { continueCourses, filterCourses, libraryStats, sortCourses, isLibrarySort } from '@/lib/library-sort';
import { CourseSummary } from '@/types/course';

const base = (o: Partial<CourseSummary> & { courseId: string; title: string }): CourseSummary => ({
  hasCover: false,
  totalLessons: 10,
  moduleCount: 1,
  completedCount: 0,
  startedCount: 0,
  missingCount: 0,
  resumeHref: null,
  resumeLessonTitle: null,
  lastActiveAt: null,
  durationSeconds: null,
  ...o,
});

const courses: CourseSummary[] = [
  base({ courseId: 'b', title: 'Beta Course', completedCount: 2, resumeHref: '/course/b/1/3', lastActiveAt: '2026-09-29T10:00:00Z', durationSeconds: 3600 }),
  base({ courseId: 'a', title: 'alpha course', completedCount: 10, resumeHref: '/course/a/1/10', lastActiveAt: '2026-09-20T10:00:00Z', durationSeconds: 7200 }),
  base({ courseId: 'c', title: 'Charlie – Gamma', startedCount: 1, resumeHref: '/course/c/1/1', lastActiveAt: '2026-09-30T08:00:00Z' }),
  base({ courseId: 'd', title: 'Délta Course 10' }),
  base({ courseId: 'e', title: 'Delta Course 9', durationSeconds: 60 }),
];

const ids = (list: CourseSummary[]) => list.map((c) => c.courseId);

describe('sortCourses', () => {
  it('recent: newest activity first, untouched keep input order', () => {
    expect(ids(sortCourses(courses, 'recent'))).toEqual(['c', 'b', 'a', 'd', 'e']);
  });
  it('az: case, accent and numeric aware', () => {
    expect(ids(sortCourses(courses, 'az'))).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
  it('progress: most complete first, then started, then recent', () => {
    expect(ids(sortCourses(courses, 'progress'))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('duration: longest first, unknown last', () => {
    expect(ids(sortCourses(courses, 'duration'))).toEqual(['a', 'b', 'e', 'c', 'd']);
  });
  it('does not mutate its input', () => {
    const before = ids(courses);
    sortCourses(courses, 'az');
    expect(ids(courses)).toEqual(before);
  });
  it('validates stored values', () => {
    expect(isLibrarySort('az')).toBe(true);
    expect(isLibrarySort('bogus')).toBe(false);
    expect(isLibrarySort(null)).toBe(false);
  });
});

describe('filterCourses', () => {
  it('matches every term, ignoring case, accents and dash style', () => {
    expect(ids(filterCourses(courses, 'course'))).toEqual(['b', 'a', 'd', 'e']);
    expect(ids(filterCourses(courses, 'DELTA 10'))).toEqual(['d']);
    expect(ids(filterCourses(courses, 'charlie - gamma'))).toEqual(['c']);
    expect(ids(filterCourses(courses, '  '))).toEqual(ids(courses));
    expect(filterCourses(courses, 'zzz')).toEqual([]);
  });
});

describe('continueCourses', () => {
  it('returns up to three active courses, newest first', () => {
    expect(ids(continueCourses(courses))).toEqual(['c', 'b', 'a']);
    expect(ids(continueCourses(courses, 1))).toEqual(['c']);
    expect(continueCourses([base({ courseId: 'x', title: 'X' })])).toEqual([]);
  });
});

describe('libraryStats', () => {
  it('totals lessons, completion and known durations', () => {
    expect(libraryStats(courses)).toEqual({
      courses: 5,
      lessons: 50,
      completed: 12,
      percentComplete: 24,
      durationSeconds: 3600 + 7200 + 60,
    });
  });
  it('reports null duration when no course has one', () => {
    expect(libraryStats([base({ courseId: 'x', title: 'X' })]).durationSeconds).toBeNull();
    expect(libraryStats([]).percentComplete).toBe(0);
  });
});
