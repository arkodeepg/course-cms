import fs from 'fs';
import path from 'path';
import { Category, CourseIndex, Lesson, Resource } from '@/types/course';

export function getCoursesPath(): string {
  return process.env.COURSES_PATH || '/courses';
}

const COVER_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

// Cover art is discovered on disk rather than trusted from the index: plenty of
// courses have a cover.<ext> that their generator never recorded, and the cover
// route looks the file up the same way.
function withCover(index: CourseIndex, dir: string): CourseIndex {
  if (index.cover) return index;
  for (const ext of COVER_EXTS) {
    if (fs.existsSync(path.join(getCoursesPath(), dir, `cover.${ext}`))) {
      return { ...index, cover: `cover.${ext}` };
    }
  }
  return index;
}

export interface CourseEntry {
  courseId: string;
  index: CourseIndex;
  dir: string;
}

// ---------------------------------------------------------------------------
// Course cache
//
// Every page used to re-read and JSON-parse every _index.json (about 1.6 MB)
// and probe for cover files on each request. The parsed library is now kept in
// memory and validated on each call by statting the courses root, every course
// directory (a new cover.<ext> or _index.json changes it) and every known
// _index.json (mtimeMs + size). Only a changed course is re-parsed.
//
// Cached objects are shared across requests: callers must treat them as
// read-only. Outside production they are deep-frozen so a mutation throws.
// ---------------------------------------------------------------------------

interface FileSig {
  mtimeMs: number;
  size: number;
}

interface DirState {
  name: string;
  dirMtimeMs: number;
  indexSig: FileSig | null;
  entry: CourseEntry | null;
}

interface CourseCache {
  root: string;
  rootMtimeMs: number;
  dirs: DirState[];
  entries: CourseEntry[];
  byId: Map<string, CourseEntry>;
  generation: number;
}

let cache: CourseCache | null = null;
let generationCounter = 0;

function statSig(p: string): FileSig | null {
  const st = fs.statSync(p, { throwIfNoEntry: false });
  if (!st || !st.isFile()) return null;
  return { mtimeMs: st.mtimeMs, size: st.size };
}

function sameSig(a: FileSig | null, b: FileSig | null): boolean {
  if (a === null || b === null) return a === b;
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj as Record<string, unknown>)) deepFreeze(v);
  }
  return obj;
}

function isValid(c: CourseCache, root: string): boolean {
  if (c.root !== root) return false;
  const rootSt = fs.statSync(root, { throwIfNoEntry: false });
  if (!rootSt || rootSt.mtimeMs !== c.rootMtimeMs) return false;
  for (const d of c.dirs) {
    const dirPath = path.join(root, d.name);
    const st = fs.statSync(dirPath, { throwIfNoEntry: false });
    if (!st || st.mtimeMs !== d.dirMtimeMs) return false;
    if (!sameSig(statSig(path.join(dirPath, '_index.json')), d.indexSig)) return false;
  }
  return true;
}

function buildCache(root: string, prev: CourseCache | null): CourseCache {
  const rootMtimeMs = fs.statSync(root).mtimeMs;
  const prevDirs = new Map<string, DirState>();
  if (prev && prev.root === root) for (const d of prev.dirs) prevDirs.set(d.name, d);

  const dirs: DirState[] = [];
  const entries: CourseEntry[] = [];
  const byId = new Map<string, CourseEntry>();
  const freeze = process.env.NODE_ENV !== 'production';

  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(root, dirent.name);
    const dirSt = fs.statSync(dirPath, { throwIfNoEntry: false });
    if (!dirSt) continue;
    const indexSig = statSig(path.join(dirPath, '_index.json'));
    let entry: CourseEntry | null = null;

    const old = prevDirs.get(dirent.name);
    if (old && old.dirMtimeMs === dirSt.mtimeMs && sameSig(old.indexSig, indexSig)) {
      entry = old.entry;
    } else if (indexSig) {
      try {
        const index: CourseIndex = JSON.parse(
          fs.readFileSync(path.join(dirPath, '_index.json'), 'utf-8')
        );
        entry = { courseId: index.course, index: withCover(index, dirent.name), dir: dirent.name };
        if (freeze) deepFreeze(entry);
      } catch {
        // skip malformed _index.json
      }
    }

    dirs.push({ name: dirent.name, dirMtimeMs: dirSt.mtimeMs, indexSig, entry });
    if (entry) {
      entries.push(entry);
      // First directory wins on a duplicate course id, as the old linear scan did.
      if (!byId.has(entry.courseId)) byId.set(entry.courseId, entry);
    }
  }

  generationCounter += 1;
  return { root, rootMtimeMs, dirs, entries, byId, generation: generationCounter };
}

function loadCache(): CourseCache {
  const root = getCoursesPath();
  if (cache && isValid(cache, root)) return cache;
  cache = buildCache(root, cache);
  return cache;
}

// The validated library plus a generation number that changes whenever the
// library is rebuilt, so derived structures (the search index) can key on it.
export function getCourseLibrary(): { generation: number; entries: readonly CourseEntry[] } {
  const c = loadCache();
  return { generation: c.generation, entries: c.entries };
}

// Test hook: drop the in-memory library.
export function resetCourseCache(): void {
  cache = null;
}

export function discoverCourses(): CourseEntry[] {
  // A fresh array so a caller sorting or filtering it cannot disturb the cache.
  return loadCache().entries.slice();
}

export function getCourseEntry(courseId: string): { index: CourseIndex; dir: string } | null {
  return loadCache().byId.get(courseId) ?? null;
}

export function getLessonsFlat(category: Category): Lesson[] {
  return category.sections.flatMap((s) => s.lessons);
}

export function getLesson(
  courseIndex: CourseIndex,
  moduleIdx: number,
  lessonIdx: number
): { lesson: Lesson; category: Category; sectionName: string } | null {
  const category = courseIndex.categories[moduleIdx - 1];
  if (!category) return null;

  const flatLessons = getLessonsFlat(category);
  const lesson = flatLessons[lessonIdx - 1];
  if (!lesson) return null;

  const section = category.sections.find((s) => s.lessons.some((l) => l.file === lesson.file));
  return { lesson, category, sectionName: section?.name ?? category.name };
}

export function parseLessonDescription(lesson: Lesson): { title: string; description: string } {
  if (!lesson.has_description) return { title: lesson.name, description: '' };
  const newlineIdx = lesson.name.indexOf('\n');
  if (newlineIdx === -1) return { title: lesson.name, description: '' };
  return {
    title: lesson.name.slice(0, newlineIdx).trim(),
    description: lesson.name.slice(newlineIdx).trim(),
  };
}

// Resolves the on-disk path of a lesson's own file, whether video or article.
export function getLessonFilePath(courseId: string, category: Category, lesson: Lesson): string {
  const entry = getCourseEntry(courseId);
  if (!entry) throw new Error(`Course not found: ${courseId}`);

  for (const section of category.sections) {
    if (section.lessons.some((l) => l.file === lesson.file)) {
      return path.join(getCoursesPath(), entry.dir, category.folder, section.folder, lesson.file);
    }
  }

  throw new Error(`Lesson file not found in course ${courseId}: ${lesson.file}`);
}

export const getVideoFilePath = getLessonFilePath;

// A lesson is an article rather than a video when its file is Markdown. Courses
// ripped from text-first platforms such as Skool are mostly these.
export function isTextLesson(lesson: Lesson): boolean {
  return path.extname(lesson.file).toLowerCase() === '.md';
}

const DOCUMENT_LESSON_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];

// A lesson whose file is a PDF or an image, such as a text-only post saved as
// PDF. It is shown embedded; handing it to the video player shows nothing.
export function isDocumentLesson(lesson: Lesson): boolean {
  return DOCUMENT_LESSON_EXTS.includes(path.extname(lesson.file).toLowerCase());
}

// Reads an article lesson's Markdown, dropping the leading H1 — the page chrome
// already renders the lesson title, so repeating it reads as a duplicate.
export function readLessonMarkdown(courseId: string, category: Category, lesson: Lesson): string {
  let raw: string;
  try {
    raw = fs.readFileSync(getLessonFilePath(courseId, category, lesson), 'utf-8');
  } catch {
    return '';
  }
  return raw.replace(/^\s*#\s+.*(\r?\n)+/, '').trim();
}

export function getResourceFilePath(
  courseId: string,
  category: Category,
  lesson: Lesson,
  resource: Resource
): string {
  const entry = getCourseEntry(courseId);
  if (!entry) throw new Error(`Course not found: ${courseId}`);

  // A resource may carry an explicit path relative to the course directory.
  if (resource.path) {
    return path.join(getCoursesPath(), entry.dir, resource.path);
  }

  for (const section of category.sections) {
    if (section.lessons.some((l) => l.file === lesson.file)) {
      return path.join(getCoursesPath(), entry.dir, category.folder, section.folder, resource.file);
    }
  }

  throw new Error(`Resource file not found in course ${courseId}: ${resource.file}`);
}

// Resolves module-level and course-level resources, which live relative to the
// course directory rather than inside a lesson's section folder.
export function getResourceAbsPath(courseId: string, resource: Resource): string {
  const entry = getCourseEntry(courseId);
  if (!entry) throw new Error(`Course not found: ${courseId}`);
  return path.join(getCoursesPath(), entry.dir, resource.path ?? resource.file);
}

// Builds the /api/resource href for an absolute on-disk path.
export function resourceHref(absPath: string): string {
  return '/api/resource' + absPath.split('/').map((s) => encodeURIComponent(s)).join('/');
}

export interface ResourceGroup {
  label: string;
  resources: Resource[];
}

// Course-level downloads first, then one group per module that has resources.
// A module's group carries its own resources plus every handout attached to one
// of its lessons: those live only on the lesson page otherwise, which hides most
// of a course's downloads from the downloads page.
export function collectResourceGroups(index: CourseIndex): ResourceGroup[] {
  const groups: ResourceGroup[] = [];
  if (index.resources && index.resources.length > 0) {
    groups.push({ label: 'Course downloads', resources: index.resources });
  }
  for (const category of index.categories) {
    const resources: Resource[] = [...(category.resources ?? [])];
    for (const section of category.sections) {
      for (const lesson of section.lessons) {
        for (const resource of lesson.resources ?? []) {
          // Lesson resources are stored relative to their section folder, so
          // give each one the course-relative path the downloads page resolves.
          resources.push({
            name: `${lesson.name.split('\n')[0]} · ${resource.name}`,
            file: resource.file,
            path: resource.path ?? [category.folder, section.folder, resource.file]
              .filter(Boolean)
              .join('/'),
          });
        }
      }
    }
    if (resources.length > 0) {
      groups.push({ label: category.name, resources });
    }
  }
  return groups;
}

export function courseHasResources(index: CourseIndex): boolean {
  if (index.resources && index.resources.length > 0) return true;
  return index.categories.some(
    (c) =>
      (c.resources && c.resources.length > 0) ||
      c.sections.some((s) => s.lessons.some((l) => l.resources && l.resources.length > 0))
  );
}

// A lesson whose file never finished downloading. Indexed so the gap is visible
// in the tree, but there is nothing to play.
export function isMissingLesson(lesson: Lesson): boolean {
  return lesson.status === 'missing';
}
