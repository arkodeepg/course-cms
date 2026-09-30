"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, X, BookOpen, Download } from "lucide-react";
import { CourseIndex, Category } from "@/types/course";

function lessonsFlat(category: Category) {
  return category.sections.flatMap((s) => s.lessons);
}

interface LessonSidebarProps {
  courseId: string;
  courseIndex: CourseIndex;
  activeModuleIdx: number;
  activeLessonIdx: number;
  completedFiles: string[];
}

export function LessonSidebar({
  courseId,
  courseIndex,
  activeModuleIdx,
  activeLessonIdx,
  completedFiles,
}: LessonSidebarProps) {
  const [openModule, setOpenModule] = useState<number>(activeModuleIdx);
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const hasScrolledRef = useRef(false);

  // Follow the active module when navigation crosses a module boundary.
  useEffect(() => setOpenModule(activeModuleIdx), [activeModuleIdx]);

  // Centre the active lesson inside the sidebar's own scroller. Scrolling the
  // container directly (rather than scrollIntoView) never moves the page or the
  // main pane. Instant on first mount, smooth after that.
  useEffect(() => {
    const container = scrollRef.current;
    const el = activeRef.current;
    if (!container || !el || container.clientHeight === 0) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const top = container.scrollTop + (eRect.top - cRect.top) - (container.clientHeight - eRect.height) / 2;
    container.scrollTo({
      top: Math.max(0, top),
      behavior: hasScrolledRef.current ? "smooth" : "auto",
    });
    hasScrolledRef.current = true;
  }, [activeModuleIdx, activeLessonIdx, openModule, mobileOpen]);

  const completedSet = new Set(completedFiles);

  const hasResources =
    (courseIndex.resources?.length ?? 0) > 0 ||
    courseIndex.categories.some(
      (c) =>
        (c.resources?.length ?? 0) > 0 ||
        c.sections.some((s) => s.lessons.some((l) => (l.resources?.length ?? 0) > 0))
    );

  return (
    <>
      {/* Mobile toggle: fixed bottom-right button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 right-4 z-40 md:hidden flex items-center gap-1.5 bg-brand text-white rounded-full px-4 py-2.5 text-xs font-semibold shadow-lg"
        aria-label="Open course contents"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Contents
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`w-64 shrink-0 border-l border-border bg-surface-sidebar flex-col overflow-hidden ${mobileOpen ? "fixed inset-y-0 right-0 z-50 flex" : "hidden md:flex"}`}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
          Course Content
        </span>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden text-muted-foreground hover:text-foreground p-1 -mr-1"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        {hasResources && (
          <Link
            href={`/course/${courseId}/resources`}
            className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 hover:bg-surface-toolbar transition-colors"
          >
            <Download className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span className="flex-1 text-[0.68rem] font-semibold text-muted-foreground">
              Downloads &amp; Resources
            </span>
          </Link>
        )}
        {courseIndex.categories.map((category) => {
          const lessons = lessonsFlat(category);
          const completedCount = lessons.filter((l) => completedSet.has(l.file)).length;
          const isOpen = openModule === category.index;
          const showSectionHeaders = category.sections.length > 1;
          const moduleIdx = category.index;

          let lessonFlatIdx = 0;

          return (
            <div key={category.index} className="border-b border-border/60">
              {/* Module header: accordion toggle only */}
              <button
                onClick={() => setOpenModule(isOpen ? -1 : category.index)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  isOpen ? "bg-surface-toolbar" : "hover:bg-surface-toolbar"
                }`}
              >
                <span className="shrink-0 text-muted-foreground/50">
                  {isOpen ? (
                    <ChevronDownIcon className="h-3 w-3" />
                  ) : (
                    <ChevronRightIcon className="h-3 w-3" />
                  )}
                </span>
                <span
                  className={`flex-1 text-[0.68rem] font-semibold leading-snug ${
                    moduleIdx === activeModuleIdx ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {category.name}
                </span>
                <span className="shrink-0 text-[0.65rem] text-muted-foreground/50 tabular-nums">
                  {completedCount}/{lessons.length}
                </span>
              </button>

              {/* Lesson list: shown when module is open */}
              {isOpen && (
                <div className="bg-surface-inset">
                  {category.sections.map((section) => (
                    <div key={section.index}>
                      {showSectionHeaders && (
                        <div className="px-4 py-1 text-[0.65rem] uppercase tracking-widest text-muted-foreground/40 border-b border-border/30">
                          {section.name}
                        </div>
                      )}
                      {section.lessons.map((lesson) => {
                        lessonFlatIdx += 1;
                        const thisIdx = lessonFlatIdx;
                        const isActive =
                          moduleIdx === activeModuleIdx && thisIdx === activeLessonIdx;
                        const isDone = completedSet.has(lesson.file);
                        const isMissing = lesson.status === "missing";
                        const label = lesson.name.split("\n")[0].trim();

                        return (
                          <Link
                            key={lesson.file}
                            ref={isActive ? activeRef : undefined}
                            href={`/course/${courseId}/${moduleIdx}/${thisIdx}`}
                            title={label}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-start gap-2 px-4 py-2 border-b border-surface-toolbar cursor-pointer transition-colors ${
                              isActive ? "bg-surface-active" : "hover:bg-surface-toolbar"
                            }`}
                          >
                            <span
                              className={`text-[0.65rem] shrink-0 pt-0.5 tabular-nums ${
                                isDone ? "text-success" : "text-muted-foreground/40"
                              }`}
                            >
                              {thisIdx}
                            </span>
                            <span
                              className={`text-[0.65rem] leading-snug flex-1 min-w-0 line-clamp-2 ${
                                isActive
                                  ? "text-foreground font-semibold"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {label}
                            </span>
                            {isMissing && (
                              <span className="shrink-0 mt-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground/50">
                                missing
                              </span>
                            )}
                            {lesson.archived && (
                              <span className="shrink-0 mt-0.5 text-[0.65rem] uppercase tracking-wide text-amber-500/70">
                                archived
                              </span>
                            )}
                            {isDone && (
                              <CheckIcon className="h-3 w-3 shrink-0 text-success mt-0.5" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </aside>
    </>
  );
}
