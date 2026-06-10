import Link from "next/link";
import { Category } from "@/types/course";
import { lessonsFlat } from "@/lib/utils";

interface ModuleCardProps {
  courseId: string;
  category: Category;
  completedCount: number;
  startedCount: number;
}

function moduleThumbText(name: string): string {
  return name
    .replace(/^\d+\s*[-·.]\s*/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
    .join("\n");
}

export function ModuleCard({ courseId, category, completedCount, startedCount }: ModuleCardProps) {
  const lessons = lessonsFlat(category);
  const total = lessons.length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const startedPct = total > 0 ? Math.round((startedCount / total) * 100) : 0;
  const allDone = completedPct === 100;

  let statusText = "Not started";
  if (allDone) statusText = "Completed";
  else if (completedCount > 0) statusText = `${completedCount} of ${total} complete`;
  else if (startedCount > 0) statusText = `${startedCount} of ${total} in progress`;

  return (
    <Link
      href={`/course/${courseId}/${category.index}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-card/80 transition-colors"
    >
      <div className="h-9 w-16 shrink-0 rounded flex items-center justify-center text-center text-[0.4rem] font-bold leading-tight bg-gradient-to-br from-[#1a0a0a] to-[#3d1010] text-[#cc4444]">
        {moduleThumbText(category.name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[0.82rem] font-semibold text-foreground">
          {String(category.index).padStart(2, "0")} · {category.name}
        </div>
        <div className="text-[0.68rem] text-muted-foreground mt-0.5">{statusText}</div>
        <div className="mt-1 h-[2px] w-full max-w-[144px] rounded-full bg-secondary relative overflow-hidden">
          {/* in-progress layer (behind completed) */}
          {startedPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${completedPct + startedPct}%`,
                background: "hsl(0 72% 30%)",
              }}
            />
          )}
          {/* completed layer */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${completedPct}%`,
              background: allDone ? "hsl(150 42% 30%)" : "hsl(0 72% 51%)",
            }}
          />
        </div>
      </div>

      <div className="text-[0.68rem] text-muted-foreground shrink-0">{total} lessons</div>
    </Link>
  );
}
