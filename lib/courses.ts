import fs from 'fs';
import path from 'path';
import { Category, CourseIndex, Lesson } from '@/types/course';

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
