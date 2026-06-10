"use client";

import Link from "next/link";
import { CourseIndex } from "@/types/course";
import { courseTitle, lessonsFlat } from "@/lib/utils";

interface CourseCardProps {
  courseId: string;
  index: CourseIndex;
  completedCount: number;
  startedCount: number;
  resumeHref: string | null;
}

function courseInitials(title: string): string {
  return title
    .split(/[\s\-–]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 3)
    .join(" ");
}

function thumbGradient(courseId: string): string {
  const h = courseId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = h % 360;
  return `hsl(${hue} 60% 12%)`;
}

function thumbTextColor(courseId: string): string {
  const h = courseId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}

export function CourseCard({ courseId, index, completedCount, startedCount, resumeHref }: CourseCardProps) {
  const totalLessons = index.categories.flatMap((c) => lessonsFlat(c)).length;
  const moduleCount = index.categories.length;
  const completedPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const startedPct = totalLessons > 0 ? Math.round((startedCount / totalLessons) * 100) : 0;

  const allDone = completedPct === 100;
  const hasProgress = resumeHref !== null;

  let statusLabel = "Not started";
  if (allDone) statusLabel = "Completed";
  else if (completedCount > 0) statusLabel = `${completedCount} complete`;
  else if (startedCount > 0) statusLabel = `${startedCount} in progress`;

  const resumeActionHref = allDone
    ? `/course/${courseId}/1/1`
    : hasProgress
    ? resumeHref!
    : `/course/${courseId}/1/1`;
  const actionLabel = allDone ? "Rewatch" : hasProgress ? "Resume" : "Start";

  const name = courseTitle(courseId, index);

  return (
    <Link
      href={`/course/${courseId}`}
      className="flex items-center gap-3 sm:gap-4 rounded-lg border border-border bg-card px-3 sm:px-4 py-3 hover:bg-card/80 transition-colors"
    >
      <div
        className="hidden sm:flex h-12 w-20 shrink-0 rounded-md items-center justify-center text-center text-[0.5rem] font-bold leading-tight"
        style={{ background: thumbGradient(courseId), color: thumbTextColor(courseId) }}
      >
        {courseInitials(name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground leading-snug">{name}</div>
        <div className="text-[0.68rem] text-muted-foreground mt-0.5">
          {totalLessons} lessons · {moduleCount} modules
        </div>
        <div className="text-[0.68rem] text-muted-foreground">{statusLabel}</div>
        <div className="mt-1.5 h-[3px] w-full max-w-[160px] rounded-full bg-secondary relative overflow-hidden">
          {startedPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${completedPct + startedPct}%`, background: "hsl(0 72% 30%)" }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${completedPct}%`,
              background: allDone ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
            }}
          />
        </div>
      </div>

      <Link
        href={resumeActionHref}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{
          background: allDone ? "#2d3a2d" : hasProgress ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
          color: allDone ? "#6a9a6a" : "white",
        }}
      >
        {actionLabel}
      </Link>
    </Link>
  );
}
