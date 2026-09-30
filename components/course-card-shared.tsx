import { CourseSummary } from "@/types/course";
import { courseInitials, formatDuration, hueFor, percent, plural } from "@/lib/format";

// Everything both library card layouts derive from a CourseSummary.
export function cardModel(course: CourseSummary) {
  const { courseId, title, totalLessons, moduleCount, completedCount, startedCount, resumeHref } =
    course;
  const completedPct = percent(completedCount, totalLessons);
  const startedPct = percent(startedCount, totalLessons);
  const allDone = totalLessons > 0 && completedPct === 100;
  const hasProgress = resumeHref !== null;

  let statusLabel = "Not started";
  if (allDone) statusLabel = "Completed";
  else if (completedCount > 0) statusLabel = `${completedCount} complete`;
  else if (startedCount > 0) statusLabel = `${startedCount} in progress`;

  const firstLesson = `/course/${courseId}/1/1`;
  const actionHref = allDone ? firstLesson : hasProgress ? resumeHref! : firstLesson;
  const actionLabel = allDone ? "Rewatch" : hasProgress ? "Resume" : "Start";
  const actionClass = allDone
    ? "bg-success/25 text-emerald-300"
    : hasProgress
    ? "bg-progress-done text-white"
    : "bg-brand text-white";

  const hue = hueFor(courseId);
  return {
    courseId,
    title,
    href: `/course/${courseId}`,
    coverSrc: `/api/courses/${courseId}/cover`,
    lessonsLabel: `${plural(totalLessons, "lesson")} · ${plural(moduleCount, "module")}`,
    duration: formatDuration(course.durationSeconds),
    missingCount: course.missingCount,
    completedPct,
    startedPct,
    allDone,
    statusLabel,
    actionHref,
    actionLabel,
    actionClass,
    initials: courseInitials(title),
    thumbBg: `hsl(${hue} 55% 12%)`,
    thumbFg: `hsl(${hue} 70% 62%)`,
  };
}

export type CardModel = ReturnType<typeof cardModel>;

export function CardMeta({ m }: { m: CardModel }) {
  return (
    <div className="text-[0.68rem] coarse:text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-1.5">
      <span>{m.lessonsLabel}</span>
      {m.duration && <span>· {m.duration}</span>}
      {m.missingCount > 0 && (
        <span className="text-amber-400/80" title={`${plural(m.missingCount, "lesson")} ${m.missingCount === 1 ? "was" : "were"} never downloaded`}>
          · {m.missingCount} missing
        </span>
      )}
    </div>
  );
}

export function CardProgress({ m, className = "" }: { m: CardModel; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="h-[3px] flex-1 max-w-[160px] rounded-full bg-secondary relative overflow-hidden"
        role="progressbar"
        aria-label="Course completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={m.completedPct}
      >
        {m.startedPct > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-progress-started"
            style={{ width: `${Math.min(100, m.completedPct + m.startedPct)}%` }}
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            m.allDone ? "bg-progress-done" : "bg-accent"
          }`}
          style={{ width: `${m.completedPct}%` }}
        />
      </div>
      <span className="text-[0.65rem] coarse:text-xs tabular-nums text-muted-foreground shrink-0">
        {m.completedPct}%
      </span>
    </div>
  );
}
