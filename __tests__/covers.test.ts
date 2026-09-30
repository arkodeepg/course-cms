import fs from 'fs';
import path from 'path';
import {
  courseHasCover,
  generatedCoverIds,
  generatedCoverPath,
  getCoversPath,
  isSafeCourseId,
  resetCoverCache,
} from '@/lib/covers';
import { buildCourseSummaries } from '@/lib/library';
import { CourseEntry } from '@/lib/courses';
import { croCourse, larsenCourse, makeCoursesRoot, rmRoot } from '@/test/fixtures/courses';

let dir: string;
const prevCovers = process.env.COVERS_PATH;

beforeEach(() => {
  dir = makeCoursesRoot();
  process.env.COVERS_PATH = dir;
  resetCoverCache();
});

afterEach(() => {
  rmRoot(dir);
  process.env.COVERS_PATH = prevCovers;
  resetCoverCache();
  jest.restoreAllMocks();
});

describe('covers path', () => {
  it('uses COVERS_PATH, else <cwd>/data/covers', () => {
    expect(getCoversPath()).toBe(dir);
    delete process.env.COVERS_PATH;
    expect(getCoversPath()).toBe(path.join(process.cwd(), 'data', 'covers'));
  });

  it('resolves a course id to <dir>/<id>.webp', () => {
    expect(generatedCoverPath('cxl')).toBe(path.join(dir, 'cxl.webp'));
    expect(generatedCoverPath('cro-masterclass', '/app/data/covers')).toBe('/app/data/covers/cro-masterclass.webp');
  });

  it.each([
    ['../secret'],
    ['..'],
    ['a/../../etc/passwd'],
    ['sub/dir'],
    ['back\\slash'],
    ['.hidden'],
    ['nul\0byte'],
    [''],
  ])('refuses %j', (id) => {
    expect(isSafeCourseId(id)).toBe(false);
    expect(generatedCoverPath(id)).toBeNull();
  });
});

describe('generated cover ids', () => {
  it('is empty when the directory does not exist', () => {
    process.env.COVERS_PATH = path.join(dir, 'missing');
    expect(generatedCoverIds().size).toBe(0);
  });

  it('lists <id>.webp files only, ignoring temp files and other types', () => {
    fs.writeFileSync(path.join(dir, 'cxl.webp'), 'x');
    fs.writeFileSync(path.join(dir, '.cro.webp.tmp'), 'x');
    fs.writeFileSync(path.join(dir, '.dot.webp'), 'x');
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
    fs.mkdirSync(path.join(dir, 'folder.webp'));
    expect([...generatedCoverIds()]).toEqual(['cxl']);
  });

  it('re-lists only when the directory changes', () => {
    fs.writeFileSync(path.join(dir, 'a.webp'), 'x');
    const readdir = jest.spyOn(fs, 'readdirSync');
    expect(generatedCoverIds().has('a')).toBe(true);
    generatedCoverIds();
    generatedCoverIds();
    expect(readdir).toHaveBeenCalledTimes(1);

    // A new file changes the directory mtime; force a distinct value.
    fs.writeFileSync(path.join(dir, 'b.webp'), 'x');
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(dir, future, future);
    expect(generatedCoverIds().has('b')).toBe(true);
    expect(readdir).toHaveBeenCalledTimes(2);
  });
});

describe('hasCover', () => {
  it('is true for an original cover, a generated one, or both', () => {
    fs.writeFileSync(path.join(dir, 'gen-only.webp'), 'x');
    fs.writeFileSync(path.join(dir, 'both.webp'), 'x');
    expect(courseHasCover('orig-only', { cover: 'cover.jpg' })).toBe(true);
    expect(courseHasCover('gen-only', {})).toBe(true);
    expect(courseHasCover('both', { cover: 'cover.png' })).toBe(true);
    expect(courseHasCover('neither', {})).toBe(false);
  });

  it('flows into course summaries', () => {
    const entries: CourseEntry[] = [
      { courseId: larsenCourse.course, index: { ...larsenCourse, cover: undefined }, dir: 'L' },
      { courseId: croCourse.course, index: { ...croCourse, cover: undefined }, dir: 'C' },
    ];
    fs.writeFileSync(path.join(dir, `${croCourse.course}.webp`), 'x');
    const byId = new Map(buildCourseSummaries(entries, []).map((s) => [s.courseId, s.hasCover]));
    expect(byId.get(larsenCourse.course)).toBe(false);
    expect(byId.get(croCourse.course)).toBe(true);
  });
});
