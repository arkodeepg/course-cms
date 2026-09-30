"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SkipBack, SkipForward } from "lucide-react";
import { CMS_COMMAND_EVENT, isTypingTarget } from "@/lib/commands";

interface LessonToolbarProps {
  courseId: string;
  lessonIndex: number;
  totalLessons: number;
  lessonFile: string;
  initialCompleted: boolean;
  /** Course-wide neighbours, computed on the server; null at either end of the course. */
  prevHref: string | null;
  nextHref: string | null;
}

// The prev/next + completion strip for article, document and unplayable
// lessons. Video lessons get the equivalent controls from VideoPlayer, which
// tracks completion by watch time.
export function LessonToolbar({
  courseId,
  lessonIndex,
  totalLessons,
  lessonFile,
  initialCompleted,
  prevHref,
  nextHref,
}: LessonToolbarProps) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Navigating between lessons reuses this component, so reset from the server
  // value rather than carrying the previous lesson's state over.
  useEffect(() => setCompleted(initialCompleted), [initialCompleted, lessonFile]);

  const markComplete = useCallback(async () => {
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
  }, [completed, saving, courseId, lessonFile, router]);

  const go = useCallback(
    (href: string | null) => {
      if (href) router.push(href);
    },
    [router]
  );

  // Latest handlers for the window listeners without re-binding them each render.
  const handlersRef = useRef({ markComplete, go, prevHref, nextHref });
  handlersRef.current = { markComplete, go, prevHref, nextHref };

  useEffect(() => {
    const onCommand = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      const h = handlersRef.current;
      if (id === "next") h.go(h.nextHref);
      else if (id === "prev") h.go(h.prevHref);
      else if (id === "mark-complete") void h.markComplete();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      const h = handlersRef.current;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        h.go(h.nextHref);
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        h.go(h.prevHref);
      }
    };
    window.addEventListener(CMS_COMMAND_EVENT, onCommand);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(CMS_COMMAND_EVENT, onCommand);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex items-center gap-1 sm:gap-2 bg-surface-toolbar border-b border-border px-2 sm:px-3 min-h-[44px]">
      <button
        onClick={() => go(prevHref)}
        disabled={!prevHref}
        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        title="Previous lesson (P)"
      >
        <SkipBack className="h-4 w-4" />
      </button>
      <button
        onClick={() => go(nextHref)}
        disabled={!nextHref}
        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        title="Next lesson (N)"
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

      {nextHref && (
        <button
          onClick={() => go(nextHref)}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-[0.68rem] font-semibold text-white hover:bg-brand-hover transition-colors"
        >
          Next
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
