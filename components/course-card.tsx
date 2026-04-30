import Link from "next/link";
import { CourseIndex } from "@/types/course";
import { getLessonsFlat } from "@/lib/courses";

interface CourseCardProps {
  courseId: string;
  index: CourseIndex;
  completedCount: number;
  resumeHref: string | null;
}

function courseInitials(courseId: string): string {
  return courseId
    .split(/[-_\s]+/)
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

export function CourseCard({ courseId, index, completedCount, resumeHref }: CourseCardProps) {
  const totalLessons = index.categories.flatMap((c) => getLessonsFlat(c)).length;
  const moduleCount = index.categories.length;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const allDone = pct === 100;
  // Any saved position (even partial) counts as "in progress"
  const hasProgress = resumeHref !== null;

  let statusLabel = "Not started";
  if (allDone) statusLabel = "Completed";
  else if (hasProgress) statusLabel = "In progress";

  // Completed → module overview. Any progress → resume at saved position. Fresh → first lesson directly.
  const actionHref = allDone
    ? `/course/${courseId}`
    : hasProgress
    ? resumeHref!
    : `/course/${courseId}/1/1`;
  const actionLabel = allDone ? "Completed" : hasProgress ? "Resume" : "Start Course";

  const courseName = index.course
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:bg-card/80 transition-colors">
      <div
        className="h-12 w-20 shrink-0 rounded-md flex items-center justify-center text-center text-[0.5rem] font-bold leading-tight"
        style={{ background: thumbGradient(courseId), color: thumbTextColor(courseId) }}
      >
        {courseInitials(courseId)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{courseName}</div>
        <div className="text-[0.7rem] text-muted-foreground mt-0.5">
          {totalLessons} lessons · {moduleCount} modules · {statusLabel}
        </div>
        <div className="mt-1.5 h-[3px] w-44 rounded-full bg-secondary">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: allDone ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
            }}
          />
        </div>
      </div>

      <Link
        href={actionHref}
        className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
        style={{
          background: allDone ? "#2d3a2d" : hasProgress ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
          color: allDone ? "#6a9a6a" : "white",
        }}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
