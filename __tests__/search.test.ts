import fs from 'fs';
import path from 'path';
import { resetCourseCache } from '@/lib/courses';
import { normalize, parseLimit, searchLibrary } from '@/lib/search';
import { CourseIndex } from '@/types/course';
import { croCourse, larsenCourse, lesson, makeCoursesRoot, rmRoot, writeCourse } from '@/test/fixtures/courses';

let root: string;
const prevPath = process.env.COURSES_PATH;

const bulkCourse: CourseIndex = {
  course: 'bulk',
  title: 'Bulk Course',
  total_lessons: 150,
  downloaded: 150,
  missing: 0,
  categories: [
    {
      index: 1,
      name: 'All',
      folder: '',
      sections: [
        {
          index: 1,
          name: 'All',
          folder: '',
          lessons: Array.from({ length: 150 }, (_, i) => lesson(i + 1, `Proof of work ${i}`, `${i}.mp4`)),
        },
      ],
    },
  ],
};

const blurbCourse: CourseIndex = {
  course: 'blurb-course',
  title: 'Blurb Course',
  total_lessons: 1,
  downloaded: 1,
  missing: 0,
  categories: [
    {
      index: 1,
      name: '  [MODULE 1] Welcome to Zephyr Basics!  \n\nA long paragraph about quasar tactics.',
      folder: '01',
      resources: [{ name: 'Zephyr Workbook', file: 'wb.pdf' }],
      sections: [
        {
          index: 1,
          name: 'Zephyr Section\n\nSection blurb about nebula things',
          folder: '',
          lessons: [lesson(1, 'Zephyr lesson one', '01.mp4', { resources: [{ name: 'Zephyr Sheet', file: 's.pdf' }] })],
        },
      ],
    },
  ],
};

beforeAll(() => {
  root = makeCoursesRoot();
  process.env.COURSES_PATH = root;
  resetCourseCache();
  writeCourse(root, 'Matthew Larsen', larsenCourse);
  writeCourse(root, 'CRO', croCourse);
  writeCourse(root, 'Bulk', bulkCourse);
  writeCourse(root, 'Blurb', blurbCourse);
});

afterAll(() => {
  rmRoot(root);
  process.env.COURSES_PATH = prevPath;
  resetCourseCache();
});

const titles = (q: string, limit?: number) => searchLibrary(q, limit).results.map((r) => r.lessonTitle);

describe('normalize', () => {
  it('lowercases, strips accents and punctuation, pads with spaces', () => {
    expect(normalize('Café: The CRO-Mindset!')).toBe(' cafe the cro mindset ');
    expect(normalize('  ')).toBe('');
  });
});

describe('searchLibrary', () => {
  it('finds a course by a word in its name, course first', () => {
    const { results } = searchLibrary('larsen');
    expect(results[0]).toMatchObject({
      kind: 'course',
      courseId: 'matthew-larsen-10k-per-month',
      lessonTitle: 'Matthew Larsen - 10k Per Month',
      href: '/course/matthew-larsen-10k-per-month',
    });
    // The course name is context only: it does not turn every lesson into a hit.
    expect(results.every((r) => r.kind === 'course')).toBe(true);
  });

  it('ranks an exact or prefix course title above everything', () => {
    expect(searchLibrary('dylan ander').results[0].kind).toBe('course');
    expect(searchLibrary('matthew').results[0].kind).toBe('course');
  });

  it('ANDs multi-word terms and puts the lesson with both in its title first', () => {
    const { results } = searchLibrary('cro mindset');
    expect(results[0]).toMatchObject({
      kind: 'lesson',
      lessonTitle: 'Lesson 2.1 - The Billion Dollar CRO Mindset',
      moduleIndex: 1,
      lessonIndex: 2,
      lessonFile: '02.mp4',
    });
    expect(titles('cro zebra')).toEqual([]);
  });

  it('orders lesson title prefix > word start > substring > description only', () => {
    // "offer": title prefix "Offer of the week", resource "Offer Template"
    // (prefix too), then description-only "Cold email scripts".
    const r = searchLibrary('offer').results;
    expect(r[0].lessonTitle).toBe('Offer of the week');
    expect(r.map((x) => x.lessonTitle)).toContain('Offer Template');
    expect(r[r.length - 1].lessonTitle).toBe('Cold email scripts');

    // "ind": substring of "mindset" only, lower than a word start of "mindset".
    const sub = searchLibrary('indset').results;
    const word = searchLibrary('mindset').results;
    expect(sub[0].score).toBeLessThan(word.find((x) => x.lessonTitle === sub[0].lessonTitle)!.score);
  });

  it('matches module and section names and resource names', () => {
    expect(searchLibrary('scaling').results[0]).toMatchObject({ kind: 'module', href: '/course/matthew-larsen-10k-per-month/2' });
    expect(titles('outreach')).toEqual(['Offer of the week', 'Cold email scripts']);
    const res = searchLibrary('template').results[0];
    expect(res).toMatchObject({ kind: 'resource', moduleIndex: 1, lessonIndex: 1, lessonFile: '01 - Offer.mp4#offer.pdf' });
  });

  it('returns only the trimmed first line of a multi-line module name', () => {
    const all = searchLibrary('zephyr', 100).results;
    const kinds = new Set(all.map((r) => r.kind));
    expect(kinds).toEqual(new Set(['module', 'lesson', 'resource']));
    for (const r of all) {
      expect(r.categoryName).toBe('[MODULE 1] Welcome to Zephyr Basics!');
      expect(r.lessonTitle).not.toContain('\n');
      expect(r.categoryName).not.toContain('\n');
    }
    expect(all.find((r) => r.kind === 'module')!.lessonTitle).toBe('[MODULE 1] Welcome to Zephyr Basics!');
    // The blurb still ranks as description text, and a section blurb is not matched.
    const blurbHit = searchLibrary('quasar').results;
    expect(blurbHit).toHaveLength(1);
    expect(blurbHit[0]).toMatchObject({ kind: 'module', lessonTitle: '[MODULE 1] Welcome to Zephyr Basics!' });
    expect(searchLibrary('nebula').results).toEqual([]);
  });

  it('keeps the original response fields', () => {
    const r = searchLibrary('cold email').results[0];
    expect(r).toMatchObject({
      courseId: 'matthew-larsen-10k-per-month',
      courseDir: 'matthew-larsen-10k-per-month',
      categoryName: 'Getting Clients',
      moduleIndex: 1,
      lessonIndex: 2,
      lessonTitle: 'Cold email scripts',
      lessonDescription: 'A list of scripts for your offer',
      lessonFile: '02 - Scripts.mp4',
    });
  });

  it('caps results at the limit and reports the total', () => {
    expect(searchLibrary('proof').results).toHaveLength(20);
    expect(searchLibrary('proof', 5).results).toHaveLength(5);
    const all = searchLibrary('proof', 1000);
    expect(all.results).toHaveLength(100);
    expect(all.total).toBe(150);
  });

  it('ignores queries shorter than two characters', () => {
    expect(searchLibrary('a').results).toEqual([]);
    expect(searchLibrary(' !! ').results).toEqual([]);
  });

  it('rebuilds the index when a course index changes', () => {
    expect(titles('brandnew')).toEqual([]);
    const indexPath = path.join(root, 'Bulk', '_index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ ...bulkCourse, title: 'Brandnew Bulk' }));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(indexPath, future, future);
    expect(titles('brandnew')[0]).toBe('Brandnew Bulk');
  });
});

describe('parseLimit', () => {
  it('defaults to 20 and clamps to 100', () => {
    expect(parseLimit(null)).toBe(20);
    expect(parseLimit('abc')).toBe(20);
    expect(parseLimit('0')).toBe(20);
    expect(parseLimit('7')).toBe(7);
    expect(parseLimit('500')).toBe(100);
  });
});
