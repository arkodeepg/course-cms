import { notFound } from "next/navigation";
import { getCourseEntry, getLessonsFlat } from "@/lib/courses";
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

  return (
    <div className="flex flex-col min-h-screen">
      <Nav breadcrumb={{ label: courseName, href: "/" }} />
      <main className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full">
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
    </div>
  );
}
