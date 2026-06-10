import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Category, CourseIndex, Lesson } from "@/types/course"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function lessonsFlat(category: Category): Lesson[] {
  return category.sections.flatMap((s) => s.lessons);
}

export function courseTitle(courseId: string, index?: CourseIndex): string {
  if (index?.title) return index.title;
  return courseId
    .split('-')
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
