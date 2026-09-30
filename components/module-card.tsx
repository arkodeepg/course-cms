import Link from "next/link";
import { Category } from "@/types/course";
import { lessonsFlat } from "@/lib/utils";
import { categoryDurationSeconds, formatDuration, plural } from "@/lib/format";

interface ModuleCardProps {
  courseId: string;
  category: Category;
  completedCount: number;
  startedCount: number;
}

export function ModuleCard({ courseId, category, completedCount, startedCount }: ModuleCardProps) {
  const lessons = lessonsFlat(category);
  const total = lessons.length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const startedPct = total > 0 ? Math.round((startedCount / total) * 100) : 0;
  const allDone = completedPct === 100;
  const duration = formatDuration(categoryDurationSeconds(category));

  let statusText = "Not started";
  if (allDone) statusText = "Completed";
  else if (completedCount > 0) statusText = `${completedCount} of ${total} complete`;
  else if (startedCount > 0) statusText = `${startedCount} of ${total} in progress`;

  return (
    <Link
      href={`/course/${courseId}/${category.index}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-card/80 transition-colors"
    >
      <div
        aria-hidden="true"
        className="h-9 w-16 shrink-0 rounded flex items-center justify-center text-sm font-bold tabular-nums bg-gradient-to-br from-brand/10 to-brand/25 text-brand"
      >
        {String(category.index).padStart(2, "0")}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[0.82rem] font-semibold text-foreground line-clamp-2" title={category.name}>
          {category.name}
        </div>
        <div className="text-[0.68rem] text-muted-foreground mt-0.5">{statusText}</div>
        <div className="mt-1 h-[2px] w-full max-w-[144px] rounded-full bg-secondary relative overflow-hidden">
          {/* in-progress layer (behind completed) */}
          {startedPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-progress-started"
              style={{ width: `${Math.min(100, completedPct + startedPct)}%` }}
            />
          )}
          {/* completed layer */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${allDone ? "bg-progress-done" : "bg-accent"}`}
            style={{ width: `${completedPct}%` }}
          />
        </div>
      </div>

      <div className="text-[0.68rem] text-muted-foreground shrink-0 text-right">
        <div>{plural(total, "lesson")}</div>
        {duration && <div className="tabular-nums">{duration}</div>}
      </div>
    </Link>
  );
}
