import fs from 'fs';
import path from 'path';
import {
  discoverCourses,
  getCourseEntry,
  getCourseLibrary,
  resetCourseCache,
} from '@/lib/courses';
import { croCourse, larsenCourse, makeCoursesRoot, rmRoot, writeCourse } from '@/test/fixtures/courses';

let root: string;
const prevPath = process.env.COURSES_PATH;

beforeEach(() => {
  root = makeCoursesRoot();
  process.env.COURSES_PATH = root;
  resetCourseCache();
  writeCourse(root, 'Matthew Larsen', larsenCourse);
  writeCourse(root, 'CRO', croCourse);
  fs.mkdirSync(path.join(root, '_download_logs'));
});

afterEach(() => {
  rmRoot(root);
  process.env.COURSES_PATH = prevPath;
  resetCourseCache();
  jest.restoreAllMocks();
});

describe('course cache', () => {
  it('parses each _index.json once and serves repeat calls from memory', () => {
    const readSpy = jest.spyOn(fs, 'readFileSync');
    const first = discoverCourses();
    expect(first.map((c) => c.courseId).sort()).toEqual(['cro-masterclass', 'matthew-larsen-10k-per-month']);
    const readsAfterFirst = readSpy.mock.calls.length;
    expect(readsAfterFirst).toBe(2);

    const gen = getCourseLibrary().generation;
    const second = discoverCourses();
    getCourseEntry('cro-masterclass');
    getCourseEntry('matthew-larsen-10k-per-month');
    expect(readSpy.mock.calls.length).toBe(readsAfterFirst);
    expect(getCourseLibrary().generation).toBe(gen);
    expect(second[0].index).toBe(first[0].index);
    // A fresh array each time, so sorting it cannot reorder the cache.
    expect(second).not.toBe(first);
  });

  it('re-parses only the changed course after its index mtime changes', () => {
    const before = getCourseEntry('cro-masterclass')!.index;
    const larsenBefore = getCourseEntry('matthew-larsen-10k-per-month')!.index;
    const gen = getCourseLibrary().generation;

    // Same byte length, different content: only the mtime gives it away.
    const indexPath = path.join(root, 'CRO', '_index.json');
    const changed = { ...croCourse, title: 'Dylan Ander - CRO MasterclasZ' };
    fs.writeFileSync(indexPath, JSON.stringify(changed));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(indexPath, future, future);

    const after = getCourseEntry('cro-masterclass')!.index;
    expect(getCourseLibrary().generation).toBe(gen + 1);
    expect(after).not.toBe(before);
    expect(after.title).toBe('Dylan Ander - CRO MasterclasZ');
    expect(getCourseEntry('matthew-larsen-10k-per-month')!.index).toBe(larsenBefore);
  });

  it('picks up a newly added course directory', () => {
    expect(getCourseEntry('new-course')).toBeNull();
    writeCourse(root, 'New', { ...croCourse, course: 'new-course' });
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(root, future, future);
    expect(getCourseEntry('new-course')?.dir).toBe('New');
  });

  it('discovers an unrecorded cover file and notices one added later', () => {
    expect(getCourseEntry('matthew-larsen-10k-per-month')!.index.cover).toBeUndefined();
    fs.writeFileSync(path.join(root, 'Matthew Larsen', 'cover.webp'), '');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, 'Matthew Larsen'), future, future);
    expect(getCourseEntry('matthew-larsen-10k-per-month')!.index.cover).toBe('cover.webp');
  });

  it('skips a malformed index and recovers once it is fixed', () => {
    const indexPath = path.join(root, 'CRO', '_index.json');
    fs.writeFileSync(indexPath, '{not json');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(indexPath, future, future);
    expect(getCourseEntry('cro-masterclass')).toBeNull();
    fs.writeFileSync(indexPath, JSON.stringify(croCourse));
    const later = new Date(Date.now() + 120_000);
    fs.utimesSync(indexPath, later, later);
    expect(getCourseEntry('cro-masterclass')?.dir).toBe('CRO');
  });

  it('looks a course up by id, and returns null for an unknown id', () => {
    const entry = getCourseEntry('matthew-larsen-10k-per-month');
    expect(entry?.dir).toBe('Matthew Larsen');
    expect(entry?.index.categories).toHaveLength(2);
    expect(getCourseEntry('nope')).toBeNull();
  });

  it('freezes cached objects outside production', () => {
    const entry = getCourseEntry('cro-masterclass')!;
    expect(Object.isFrozen(entry.index)).toBe(true);
    expect(Object.isFrozen(entry.index.categories[0].sections[0].lessons[0])).toBe(true);
  });
});
