import { discoverCourses, getLessonsFlat } from "@/lib/courses";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";
import { LibraryView } from "@/components/library-view";
import { Category } from "@/types/course";

export const dynamic = 'force-dynamic';

async function buildResumeHref(
  courseId: string,
  categories: Category[]
): Promise<string | null> {
  const latest = await prisma.progress.findFirst({
    where: { courseId },
    orderBy: { updatedAt: "desc" },
  });
  if (!latest) return null;

  for (let ci = 0; ci < categories.length; ci++) {
    const flat = getLessonsFlat(categories[ci]);
    const li = flat.findIndex((l) => l.file === latest.lessonFile);
    if (li !== -1) {
      return `/course/${courseId}/${ci + 1}/${li + 1}`;
    }
  }
  return null;
}

export default async function LibraryPage() {
  const courses = discoverCourses();

  const courseData = await Promise.all(
    courses.map(async ({ courseId, index }) => {
      const allFiles = new Set(
        index.categories.flatMap((c) => getLessonsFlat(c)).map((l) => l.file)
      );
      const progressRows = await prisma.progress.findMany({
        where: { courseId },
        select: { lessonFile: true, completed: true, positionSeconds: true, updatedAt: true },
      });
      const completedCount = progressRows.filter(
        (r) => r.completed && allFiles.has(r.lessonFile)
      ).length;
      const startedCount = progressRows.filter(
        (r) => !r.completed && r.positionSeconds > 1 && allFiles.has(r.lessonFile)
      ).length;
      const resumeHref = await buildResumeHref(courseId, index.categories);
      const lastActive = progressRows.reduce<Date | null>(
        (max, r) => (max === null || r.updatedAt > max ? r.updatedAt : max),
        null
      );

      return { courseId, index, completedCount, startedCount, resumeHref, lastActive };
    })
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
        {courseData.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No courses found. Mount your courses folder and ensure each course has an{" "}
            <code className="text-xs">_index.json</code>.
          </p>
        ) : (
          <LibraryView courses={courseData.sort((a, b) => {
            if (!a.lastActive && !b.lastActive) return 0;
            if (!a.lastActive) return 1;
            if (!b.lastActive) return -1;
            return b.lastActive.getTime() - a.lastActive.getTime();
          })} />
        )}
      </main>
    </div>
  );
}
