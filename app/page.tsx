import { discoverCourses, getLessonsFlat } from "@/lib/courses";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";
import { CourseCard } from "@/components/course-card";
import { Category } from "@/types/course";

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
      const allFiles = index.categories.flatMap((c) => getLessonsFlat(c)).map((l) => l.file);
      const progressRows = await prisma.progress.findMany({
        where: { courseId, completed: true },
        select: { lessonFile: true },
      });
      const completedCount = progressRows.filter((r) => allFiles.includes(r.lessonFile)).length;
      const resumeHref = await buildResumeHref(courseId, index.categories);

      return { courseId, index, completedCount, resumeHref };
    })
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full">
        <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground mb-4">
          My Courses
        </p>
        {courseData.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No courses found. Mount your courses folder and ensure each course has an{" "}
            <code className="text-xs">_index.json</code>.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {courseData.map((d) => (
              <CourseCard key={d.courseId} {...d} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
