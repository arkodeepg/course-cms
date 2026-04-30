import { notFound } from "next/navigation";
import Link from "next/link";
import { getCourseEntry, getLessonsFlat, discoverCourses } from "@/lib/courses";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";
import { ModuleCard } from "@/components/module-card";

export const dynamic = 'force-dynamic';

interface Props {
  params: { courseId: string };
}

export default async function ModuleListPage({ params }: Props) {
  const { courseId } = params;
  const entry = getCourseEntry(courseId);
  if (!entry) notFound();

  const { index } = entry;

  const progressRows = await prisma.progress.findMany({
    where: { courseId, completed: true },
    select: { lessonFile: true },
  });
  const completedFiles = new Set(progressRows.map((r) => r.lessonFile));

  const courseName = courseId
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

  const allCourses = discoverCourses();
  const otherCourses = allCourses.filter((c) => c.courseId !== courseId);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav breadcrumb={{ label: courseName, href: "/" }} />
      <div className="flex-1 flex gap-6 px-6 py-6 max-w-5xl mx-auto w-full">
        <main className="flex-1 min-w-0">
          <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground mb-4">
            Modules · {index.categories.length} total
          </p>
          <div className="flex flex-col gap-2">
            {index.categories.map((category) => {
              const lessons = getLessonsFlat(category);
              const completedCount = lessons.filter((l) => completedFiles.has(l.file)).length;
              return (
                <ModuleCard
                  key={category.index}
                  courseId={courseId}
                  category={category}
                  completedCount={completedCount}
                />
              );
            })}
          </div>
        </main>

        {otherCourses.length > 0 && (
          <aside className="w-52 shrink-0">
            <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground mb-3">
              Other Courses
            </p>
            <div className="flex flex-col gap-2">
              {otherCourses.map(({ courseId: cId, index: cIndex }) => {
                const cName = cId
                  .split("-")
                  .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
                  .join(" ");
                return (
                  <Link
                    key={cId}
                    href={`/course/${cId}`}
                    className="flex flex-col rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-card/80 transition-colors"
                  >
                    <span className="text-[0.82rem] font-semibold text-foreground">{cName}</span>
                    <span className="text-[0.68rem] text-muted-foreground mt-0.5">
                      {cIndex.total_lessons} lessons · {cIndex.categories.length} modules
                    </span>
                  </Link>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
