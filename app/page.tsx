import { discoverCourses } from "@/lib/courses";
import { buildCourseSummaries } from "@/lib/library";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";
import { LibraryView } from "@/components/library-view";
import type { Metadata } from "next";

export const dynamic = 'force-dynamic';

// Same segment as the root layout, so its title template does not apply here.
export const metadata: Metadata = { title: { absolute: "My Courses | CourseVault" } };

export default async function LibraryPage() {
  const courses = discoverCourses();

  // One query for the whole library, grouped in memory. Ordered newest first so
  // each course's latest row matches what a per-course findFirst returned.
  const rows = await prisma.progress.findMany({
    select: { courseId: true, lessonFile: true, completed: true, positionSeconds: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const summaries = buildCourseSummaries(courses, rows);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
        {summaries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No courses found. Mount your courses folder and ensure each course has an{" "}
            <code className="text-xs">_index.json</code>.
          </p>
        ) : (
          <LibraryView courses={summaries} now={Date.now()} />
        )}
      </main>
    </div>
  );
}
