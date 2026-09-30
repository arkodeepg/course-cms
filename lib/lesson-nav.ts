import type { CourseIndex, Lesson } from "@/types/course";

/**
 * Previous / next lesson across the whole course, not just the current module.
 * The last lesson of module N leads to lesson 1 of the next module that has
 * lessons; the first lesson of module N leads back to the last lesson of the
 * previous non-empty module. Indices are 1-based, matching the lesson route
 * /course/{courseId}/{moduleIndex}/{lessonIndex}.
 *
 * Pure: takes the parsed index, touches no filesystem.
 */

export interface LessonNavTarget {
  href: string;
  moduleIndex: number;
  lessonIndex: number;
  title: string;
}

export interface LessonNav {
  prev: LessonNavTarget | null;
  next: LessonNavTarget | null;
  prevHref: string | null;
  nextHref: string | null;
  nextTitle: string | null;
}

export function lessonHref(courseId: string, moduleIndex: number, lessonIndex: number): string {
  return `/course/${courseId}/${moduleIndex}/${lessonIndex}`;
}

/** The trimmed first line of a lesson name, which is its display title. */
export function lessonTitle(lesson: Pick<Lesson, "name">): string {
  return (lesson.name.split("\n")[0] ?? "").trim() || lesson.name.trim();
}

function flatLessons(courseIndex: CourseIndex, moduleIndex: number): Lesson[] {
  const category = courseIndex.categories[moduleIndex - 1];
  return category ? category.sections.flatMap((s) => s.lessons) : [];
}

function target(
  courseId: string,
  courseIndex: CourseIndex,
  moduleIndex: number,
  lessonIndex: number
): LessonNavTarget | null {
  const lesson = flatLessons(courseIndex, moduleIndex)[lessonIndex - 1];
  if (!lesson) return null;
  return {
    href: lessonHref(courseId, moduleIndex, lessonIndex),
    moduleIndex,
    lessonIndex,
    title: lessonTitle(lesson),
  };
}

export function computeLessonNav(
  courseId: string,
  courseIndex: CourseIndex,
  moduleIndex: number,
  lessonIndex: number
): LessonNav {
  const moduleCount = courseIndex.categories.length;
  const current = flatLessons(courseIndex, moduleIndex);

  let prev: LessonNavTarget | null = null;
  if (lessonIndex > 1 && lessonIndex - 1 <= current.length) {
    prev = target(courseId, courseIndex, moduleIndex, lessonIndex - 1);
  } else {
    for (let m = moduleIndex - 1; m >= 1 && !prev; m--) {
      const count = flatLessons(courseIndex, m).length;
      if (count > 0) prev = target(courseId, courseIndex, m, count);
    }
  }

  let next: LessonNavTarget | null = null;
  if (lessonIndex < current.length) {
    next = target(courseId, courseIndex, moduleIndex, lessonIndex + 1);
  } else {
    for (let m = moduleIndex + 1; m <= moduleCount && !next; m++) {
      if (flatLessons(courseIndex, m).length > 0) next = target(courseId, courseIndex, m, 1);
    }
  }

  return {
    prev,
    next,
    prevHref: prev?.href ?? null,
    nextHref: next?.href ?? null,
    nextTitle: next?.title ?? null,
  };
}
