"use client";

import { useState } from "react";
import Link from "next/link";
import { CourseIndex } from "@/types/course";
import { courseTitle, lessonsFlat } from "@/lib/utils";

interface CourseGridCardProps {
  courseId: string;
  index: CourseIndex;
  completedCount: number;
  startedCount: number;
  resumeHref: string | null;
}

function thumbGradient(courseId: string): string {
  const h = courseId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = h % 360;
  return `hsl(${hue} 50% 10%)`;
}

function thumbTextColor(courseId: string): string {
  const h = courseId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = h % 360;
  return `hsl(${hue} 60% 50%)`;
}

function courseInitials(title: string): string {
  return title
    .split(/[\s\-–]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CourseGridCard({
  courseId,
  index,
  completedCount,
  startedCount,
  resumeHref,
}: CourseGridCardProps) {
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
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-border/80 transition-colors">
      {/* Thumbnail */}
      <Link href={`/course/${courseId}`} className="block">
        {index.cover && !imgError ? (
          <img
            src={`/api/courses/${courseId}/cover`}
            alt={name}
            className="h-36 w-full object-cover block"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="h-36 flex items-center justify-center"
            style={{ background: thumbGradient(courseId) }}
          >
            <span
              className="text-4xl font-black tracking-tight select-none"
              style={{ color: thumbTextColor(courseId) }}
            >
              {courseInitials(name)}
            </span>
          </div>
        )}
      </Link>

      {/* Progress bar — full width, flush under thumbnail */}
      <div className="h-[3px] w-full bg-secondary relative overflow-hidden">
        {startedPct > 0 && (
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${completedPct + startedPct}%`, background: "hsl(0 72% 30%)" }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{
            width: `${completedPct}%`,
            background: allDone ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
          }}
        />
      </div>

      {/* Info */}
      <Link href={`/course/${courseId}`} className="flex-1 flex flex-col px-3 pt-3 pb-2">
        <div className="text-[0.82rem] font-semibold text-foreground leading-snug line-clamp-2">
          {name}
        </div>
        <div className="text-[0.65rem] text-muted-foreground mt-1">
          {totalLessons} lessons · {moduleCount} modules
        </div>
        <div className="text-[0.62rem] text-muted-foreground/70 mt-0.5">{statusLabel}</div>
      </Link>

      {/* Action button */}
      <div className="px-3 pb-3">
        <Link
          href={resumeActionHref}
          className="block w-full text-center rounded py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
          style={{
            background: allDone ? "#2d3a2d" : hasProgress ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
            color: allDone ? "#6a9a6a" : "white",
          }}
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
