import { NextRequest, NextResponse } from 'next/server';
import { discoverCourses, getLessonsFlat, parseLessonDescription } from '@/lib/courses';

export interface SearchResult {
  courseId: string;
  courseDir: string;
  categoryName: string;
  moduleIndex: number;
  lessonIndex: number;
  lessonTitle: string;
  lessonDescription: string;
  lessonFile: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const courses = discoverCourses();
  const results: SearchResult[] = [];

  for (const { courseId, index } of courses) {
    for (const category of index.categories) {
      const flat = getLessonsFlat(category);
      flat.forEach((lesson, idx) => {
        const { title, description } = parseLessonDescription(lesson);
        const searchText = `${title} ${description}`.toLowerCase();
        if (searchText.includes(q)) {
          results.push({
            courseId,
            courseDir: index.course,
            categoryName: category.name,
            moduleIndex: category.index,
            lessonIndex: idx + 1,
            lessonTitle: title,
            lessonDescription: description,
            lessonFile: lesson.file,
          });
        }
      });
    }
  }

  return NextResponse.json(results);
}
