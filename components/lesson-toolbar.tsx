"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SkipBack, SkipForward } from "lucide-react";

interface LessonToolbarProps {
  courseId: string;
  moduleIndex: number;
  lessonIndex: number;
  totalLessons: number;
  lessonFile: string;
  initialCompleted: boolean;
}

// The prev/next + completion strip for article lessons. Video lessons get the
// equivalent controls from VideoPlayer, which tracks completion by watch time.
export function LessonToolbar({
  courseId,
  moduleIndex,
  lessonIndex,
  totalLessons,
  lessonFile,
  initialCompleted,
}: LessonToolbarProps) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Navigating between lessons reuses this component, so reset from the server
  // value rather than carrying the previous lesson's state over.
  useEffect(() => setCompleted(initialCompleted), [initialCompleted, lessonFile]);

  async function markComplete() {
    if (completed || saving) return;
    setSaving(true);
    setCompleted(true);
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, lessonFile, positionSeconds: 0, completed: true }),
      });
      router.refresh();
    } catch {
      setCompleted(false);
    } finally {
      setSaving(false);
    }
  }

  function goToLesson(idx: number) {
    router.push(`/course/${courseId}/${moduleIndex}/${idx}`);
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2 bg-[#1a1c26] border-b border-border px-2 sm:px-3 min-h-[44px]">
      <button
        onClick={() => goToLesson(lessonIndex - 1)}
        disabled={lessonIndex <= 1}
        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        title="Previous lesson"
      >
        <SkipBack className="h-4 w-4" />
      </button>
      <button
        onClick={() => goToLesson(lessonIndex + 1)}
        disabled={lessonIndex >= totalLessons}
        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        title="Next lesson"
      >
        <SkipForward className="h-4 w-4" />
      </button>

      <span className="text-[0.65rem] text-muted-foreground tabular-nums ml-1">
        {lessonIndex} / {totalLessons}
      </span>

      <div className="flex-1" />

      <button
        onClick={markComplete}
        disabled={completed || saving}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.68rem] font-medium transition-colors ${
          completed
            ? "text-emerald-500 cursor-default"
            : "border border-border bg-secondary/30 text-foreground hover:bg-secondary/60"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
        {completed ? "Completed" : "Mark complete"}
      </button>

      {lessonIndex < totalLessons && (
        <button
          onClick={() => goToLesson(lessonIndex + 1)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#e53e3e] px-2.5 py-1.5 text-[0.68rem] font-semibold text-white hover:bg-[#c53030] transition-colors"
        >
          Next
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
