import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, PlayCircle, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import { getCourseEntry, getLessonsFlat, parseLessonDescription } from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";
import { categoryDurationSeconds, formatClock, formatDuration, plural } from "@/lib/format";
import { sectionsToOpen } from "@/lib/sections";
import { ExpandableText } from "@/components/expandable-text";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: { courseId: string; moduleIndex: string };
}

export function generateMetadata({ params }: Props): Metadata {
  const entry = getCourseEntry(params.courseId);
  const category = entry?.index.categories[parseInt(params.moduleIndex, 10) - 1];
  if (!entry || !category) return { title: "Module not found" };
  const moduleName = category.name.split("\n")[0].trim();
  return { title: `${moduleName} · ${courseTitle(params.courseId, entry.index)}` };
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
  // Some scrapes append the module blurb to its name after a newline.
  const [nameLine, ...nameRest] = category.name.split("\n");
  const moduleTitle = nameLine.trim() || category.name.trim();
  const moduleBlurb = nameRest.join("\n").trim();

  const completedCount = flatLessons.filter((l) => completedFiles.has(l.file)).length;
  const pct = flatLessons.length > 0 ? Math.round((completedCount / flatLessons.length) * 100) : 0;

  const multiSection = category.sections.length > 1;
  const openSections = sectionsToOpen(
    category.sections,
    (file) => completedFiles.has(file) || inProgressFiles.has(file)
  );
  const moduleDuration = formatDuration(categoryDurationSeconds(category));

  // Pre-compute lesson start index per section so we avoid mutating a counter inside JSX
  let offset = 0;
  const sectionsWithOffset = category.sections.map((section, pos) => {
    const startIdx = offset + 1;
    offset += section.lessons.length;
    return { section, startIdx, pos };
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Nav breadcrumb={{ label: courseName, href: `/course/${courseId}` }} />
      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-3xl mx-auto w-full">
        {/* Module header */}
        <div className="mb-5">
          <Link
            href={`/course/${courseId}`}
            className="inline-flex items-center gap-1 text-[0.7rem] coarse:text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 coarse:min-h-11 coarse:-mt-3 coarse:mb-0 coarse:pr-3"
          >
            <ChevronLeft className="h-3 w-3 coarse:h-4 coarse:w-4" />
            Back to modules
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug break-words">
            {String(category.index).padStart(2, "0")} · {moduleTitle}
          </h1>
          {moduleBlurb && (
            <p className="text-[0.8125rem] text-muted-foreground mt-2 whitespace-pre-line [overflow-wrap:anywhere]">
              {moduleBlurb}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <span className="text-[0.72rem] coarse:text-xs text-muted-foreground">
              {completedCount} of {plural(flatLessons.length, "lesson")} complete
              {moduleDuration && <> · {moduleDuration}</>}
            </span>
            <div className="h-[3px] w-32 rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all ${allDone ? "bg-progress-done" : "bg-accent"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[0.65rem] coarse:text-xs tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        </div>

        {/* Continue / Start button */}
        <Link
          href={`/course/${courseId}/${moduleIndex}/${resumeIdx}`}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 coarse:min-h-11 text-sm font-semibold text-white transition-opacity hover:opacity-85 mb-7 ${
            allDone ? "bg-progress-done" : "bg-accent"
          }`}
        >
          <PlayCircle className="h-4 w-4" />
          {allDone ? "Rewatch Module" : completedCount > 0 ? "Continue Module" : "Start Module"}
        </Link>

        {/* Sections and lessons */}
        <div className="flex flex-col gap-1 coarse:gap-2">
          {sectionsWithOffset.map(({ section, startIdx, pos }) => {
            const lessonsJSX = section.lessons.map((lesson, li) => {
              const idx = startIdx + li;
              const { title, description } = parseLessonDescription(lesson);
              const done = completedFiles.has(lesson.file);
              const inProgress = !done && inProgressFiles.has(lesson.file);
              const href = `/course/${courseId}/${moduleIndex}/${idx}`;
              const clock = formatClock(lesson.duration_seconds);

              return (
                // The link is the row's top line (a full-width target); the
                // description sits below it, outside the link, so "more" can
                // open it without nesting a button inside a link.
                <div
                  key={lesson.file}
                  className="hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0"
                >
                <Link href={href} className="flex items-start gap-3 px-4 py-3 coarse:min-h-11">
                  <div className="shrink-0 mt-0.5">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : inProgress ? (
                      <PlayCircle className="h-4 w-4 text-brand" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[0.65rem] coarse:text-xs text-muted-foreground shrink-0 tabular-nums">
                        {String(idx).padStart(2, "0")}
                      </span>
                      <span
                        className={`text-sm font-medium leading-snug break-words min-w-0 ${
                          done ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {title}
                      </span>
                    </div>
                  </div>
                  {lesson.archived && (
                    <span
                      className="shrink-0 mt-0.5 rounded border border-amber-500/40 px-1 text-[0.65rem] coarse:text-xs uppercase tracking-wide text-amber-400"
                      title="Archived lesson"
                    >
                      archived
                    </span>
                  )}
                  {clock && (
                    <span className="shrink-0 mt-0.5 text-[0.68rem] coarse:text-xs tabular-nums text-muted-foreground">
                      {clock}
                    </span>
                  )}
                  {done && (
                    <span className="shrink-0 text-[0.65rem] coarse:text-xs text-emerald-500 font-medium mt-0.5">
                      Done
                    </span>
                  )}
                  {inProgress && (
                    <span className="shrink-0 text-[0.65rem] coarse:text-xs text-brand font-medium mt-0.5">
                      In progress
                    </span>
                  )}
                </Link>
                {description && (
                  <ExpandableText
                    text={description}
                    className="-mt-2.5 pb-3 pl-16 pr-4 text-[0.8125rem] leading-snug text-muted-foreground"
                  />
                )}
                </div>
              );
            });

            if (multiSection) {
              return (
                <details
                  key={section.index}
                  open={openSections.has(pos)}
                  className="group"
                >
                  <summary className="flex items-center gap-2 cursor-pointer list-none select-none px-1 py-2.5 coarse:min-h-11 rounded hover:bg-secondary/20 transition-colors">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-open:rotate-90 transition-transform duration-200" />
                    <span className="text-[0.7rem] coarse:text-xs uppercase tracking-widest text-muted-foreground font-semibold flex-1">
                      {section.name}
                    </span>
                    <span className="text-[0.65rem] coarse:text-xs text-muted-foreground tabular-nums">
                      {section.lessons.length}
                      {formatDuration(section.duration_seconds) && <> · {formatDuration(section.duration_seconds)}</>}
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
