import fs from 'fs';
import path from 'path';
import { Category, CourseIndex, Lesson, Resource } from '@/types/course';

export function getCoursesPath(): string {
  return process.env.COURSES_PATH || '/courses';
}

export function discoverCourses(): Array<{ courseId: string; index: CourseIndex; dir: string }> {
  const coursesPath = getCoursesPath();
  const entries = fs.readdirSync(coursesPath, { withFileTypes: true });
  const results: Array<{ courseId: string; index: CourseIndex; dir: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(coursesPath, entry.name, '_index.json');
    if (!fs.existsSync(indexPath)) continue;
    try {
      const index: CourseIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      results.push({ courseId: index.course, index, dir: entry.name });
    } catch {
      // skip malformed _index.json
    }
  }

  return results;
}

export function getCourseEntry(courseId: string): { index: CourseIndex; dir: string } | null {
  const coursesPath = getCoursesPath();
  const entries = fs.readdirSync(coursesPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(coursesPath, entry.name, '_index.json');
    if (!fs.existsSync(indexPath)) continue;
    try {
      const index: CourseIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (index.course === courseId) return { index, dir: entry.name };
    } catch {
      continue;
    }
  }

  return null;
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

export function getVideoFilePath(courseId: string, category: Category, lesson: Lesson): string {
  const entry = getCourseEntry(courseId);
  if (!entry) throw new Error(`Course not found: ${courseId}`);

  for (const section of category.sections) {
    if (section.lessons.some((l) => l.file === lesson.file)) {
      return path.join(getCoursesPath(), entry.dir, category.folder, section.folder, lesson.file);
    }
  }

  throw new Error(`Lesson file not found in course ${courseId}: ${lesson.file}`);
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
export function collectResourceGroups(index: CourseIndex): ResourceGroup[] {
  const groups: ResourceGroup[] = [];
  if (index.resources && index.resources.length > 0) {
    groups.push({ label: 'Course downloads', resources: index.resources });
  }
  for (const category of index.categories) {
    if (category.resources && category.resources.length > 0) {
      groups.push({ label: category.name, resources: category.resources });
    }
  }
  return groups;
}

export function courseHasResources(index: CourseIndex): boolean {
  if (index.resources && index.resources.length > 0) return true;
  return index.categories.some((c) => c.resources && c.resources.length > 0);
}
