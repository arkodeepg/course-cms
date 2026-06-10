import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCourseEntry, getLessonsFlat } from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
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
    where: { courseId },
    select: { lessonFile: true, completed: true, positionSeconds: true },
  });
  const completedFiles = new Set(
    progressRows.filter((r) => r.completed).map((r) => r.lessonFile)
  );
  const startedFiles = new Set(
    progressRows.filter((r) => !r.completed && r.positionSeconds > 1).map((r) => r.lessonFile)
  );

  const courseName = courseTitle(courseId, index);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav breadcrumb={{ label: courseName, href: "/" }} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="h-3 w-3" />
          All courses
        </Link>
        <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground mb-4">
          Modules · {index.categories.length} total
        </p>
        <div className="flex flex-col gap-2">
          {index.categories.map((category) => {
            const lessons = getLessonsFlat(category);
            const completedCount = lessons.filter((l) => completedFiles.has(l.file)).length;
            const startedCount = lessons.filter((l) => startedFiles.has(l.file)).length;
            return (
              <ModuleCard
                key={category.index}
                courseId={courseId}
                category={category}
                completedCount={completedCount}
                startedCount={startedCount}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
