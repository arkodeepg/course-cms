import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, PlayCircle, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import { getCourseEntry, getLessonsFlat, parseLessonDescription } from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

interface Props {
  params: { courseId: string; moduleIndex: string };
}

export default async function ModuleDetailPage({ params }: Props) {
  const { courseId, moduleIndex: moduleIndexStr } = params;
  const moduleIndex = parseInt(moduleIndexStr, 10);
  if (isNaN(moduleIndex)) notFound();

  const entry = getCourseEntry(courseId);
  if (!entry) notFound();

  const { index } = entry;
  const category = index.categories[moduleIndex - 1];
  if (!category) notFound();

  const flatLessons = getLessonsFlat(category);

  const progressRows = await prisma.progress.findMany({
    where: { courseId },
    select: { lessonFile: true, completed: true, positionSeconds: true },
  });
  const completedFiles = new Set(
    progressRows.filter((r) => r.completed).map((r) => r.lessonFile)
  );
  const inProgressFiles = new Map(
    progressRows
      .filter((r) => !r.completed && r.positionSeconds > 1)
      .map((r) => [r.lessonFile, r.positionSeconds])
  );

  const firstIncomplete = flatLessons.findIndex((l) => !completedFiles.has(l.file));
  const resumeIdx = firstIncomplete === -1 ? 1 : firstIncomplete + 1;
  const allDone = firstIncomplete === -1;

  const courseName = courseTitle(courseId, index);

  const completedCount = flatLessons.filter((l) => completedFiles.has(l.file)).length;
  const pct = flatLessons.length > 0 ? Math.round((completedCount / flatLessons.length) * 100) : 0;

  const multiSection = category.sections.length > 1;

  // Pre-compute lesson start index per section so we avoid mutating a counter inside JSX
  let offset = 0;
  const sectionsWithOffset = category.sections.map((section) => {
    const startIdx = offset + 1;
    offset += section.lessons.length;
    return { section, startIdx };
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Nav breadcrumb={{ label: courseName, href: `/course/${courseId}` }} />
      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-3xl mx-auto w-full">
        {/* Module header */}
        <div className="mb-5">
          <Link
            href={`/course/${courseId}`}
            className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to modules
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug">
            {String(category.index).padStart(2, "0")} · {category.name}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[0.72rem] text-muted-foreground">
              {completedCount} of {flatLessons.length} lessons complete
            </span>
            <div className="h-[3px] w-32 rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: allDone ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Continue / Start button */}
        <Link
          href={`/course/${courseId}/${moduleIndex}/${resumeIdx}`}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 mb-7"
          style={{ background: allDone ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)" }}
        >
          <PlayCircle className="h-4 w-4" />
          {allDone ? "Rewatch Module" : completedCount > 0 ? "Continue Module" : "Start Module"}
        </Link>

        {/* Sections and lessons */}
        <div className="flex flex-col gap-1">
          {sectionsWithOffset.map(({ section, startIdx }) => {
            const sectionHasActivity = section.lessons.some(
              (l) => completedFiles.has(l.file) || inProgressFiles.has(l.file)
            );

            const lessonsJSX = section.lessons.map((lesson, li) => {
              const idx = startIdx + li;
              const { title, description } = parseLessonDescription(lesson);
              const done = completedFiles.has(lesson.file);
              const inProgress = !done && inProgressFiles.has(lesson.file);
              const href = `/course/${courseId}/${moduleIndex}/${idx}`;

              return (
                <Link
                  key={lesson.file}
                  href={href}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0"
                >
                  <div className="shrink-0 mt-0.5">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : inProgress ? (
                      <PlayCircle className="h-4 w-4 text-[#e53e3e]" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[0.65rem] text-muted-foreground shrink-0 tabular-nums">
                        {String(idx).padStart(2, "0")}
                      </span>
                      <span
                        className={`text-sm font-medium leading-snug ${
                          done ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {title}
                      </span>
                    </div>
                    {description && (
                      <p className="text-[0.68rem] text-muted-foreground mt-0.5 line-clamp-2 ml-5">
                        {description}
                      </p>
                    )}
                  </div>
                  {done && (
                    <span className="shrink-0 text-[0.6rem] text-emerald-600 font-medium mt-0.5">
                      Done
                    </span>
                  )}
                  {inProgress && (
                    <span className="shrink-0 text-[0.6rem] text-[#e53e3e] font-medium mt-0.5">
                      In progress
                    </span>
                  )}
                </Link>
              );
            });

            if (multiSection) {
              return (
                <details
                  key={section.index}
                  open={sectionHasActivity || section.index === 1}
                  className="group"
                >
                  <summary className="flex items-center gap-2 cursor-pointer list-none select-none px-1 py-2.5 rounded hover:bg-secondary/20 transition-colors">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-open:rotate-90 transition-transform duration-200" />
                    <span className="text-[0.7rem] uppercase tracking-widest text-muted-foreground font-semibold flex-1">
                      {section.name}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground/40 tabular-nums">
                      {section.lessons.length}
                    </span>
                  </summary>
                  <div className="flex flex-col rounded-lg border border-border overflow-hidden mt-1 mb-2">
                    {lessonsJSX}
                  </div>
                </details>
              );
            }

            return (
              <div key={section.index} className="flex flex-col rounded-lg border border-border overflow-hidden">
                {lessonsJSX}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
