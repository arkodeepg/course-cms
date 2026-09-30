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
  const asideRef = useRef<HTMLElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  // True while the Contents button would sit on top of the video player's seek and
  // control rows (landscape phones at scroll 0, or the bar passing under it).
  const [fabOverPlayer, setFabOverPlayer] = useState(false);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-player-bar]");
    const fab = fabRef.current;
    if (!bar || !fab) {
      setFabOverPlayer(false);
      return;
    }
    let frame = 0;
    const check = () => {
      frame = 0;
      const f = fab.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const overlaps =
        f.width > 0 && f.left < b.right && f.right > b.left && f.top < b.bottom && f.bottom > b.top;
      setFabOverPlayer(overlaps);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(bar);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [activeModuleIdx, activeLessonIdx]);

  // Navigating to another lesson from the drawer closes it.
  useEffect(() => setMobileOpen(false), [activeModuleIdx, activeLessonIdx]);

  // Mobile drawer as a modal dialog: lock page scroll (iOS ignores body overflow
  // alone, so html too), focus the close button, trap Tab, Esc closes, and
  // focus returns to the Contents button afterwards.
  useEffect(() => {
    if (!mobileOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        fabRef.current?.focus();
      }
      return;
    }
    wasOpenRef.current = true;
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const aside = asideRef.current;
      if (!aside) return;
      const items = [...aside.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !aside.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !aside.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    // The drawer only exists below lg; growing past it (rotation, resize) drops the modal state.
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (wide.matches) setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    wide.addEventListener?.("change", onWide);
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      document.removeEventListener("keydown", onKey, true);
      wide.removeEventListener?.("change", onWide);
    };
  }, [mobileOpen]);

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
      {/* Mobile toggle: fixed bottom-right button, clear of the home indicator */}
      <button
        ref={fabRef}
        onClick={() => setMobileOpen(true)}
        className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 lg:hidden flex items-center gap-1.5 min-h-11 bg-brand text-white rounded-full px-4 text-sm font-semibold shadow-lg ${
          fabOverPlayer && !mobileOpen ? "invisible" : ""
        }`}
        aria-label="Open course contents"
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
      >
        <BookOpen className="h-4 w-4" />
        Contents
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        ref={asideRef}
        id="lesson-contents"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-labelledby="lesson-contents-title"
        className={`shrink-0 border-l border-border bg-surface-sidebar flex-col overflow-hidden ${
          mobileOpen
            ? "fixed top-0 right-0 z-[61] flex h-dvh w-80 max-w-[85vw] pb-[env(safe-area-inset-bottom)] lg:hidden"
            : "hidden w-64 lg:flex"
        }`}
      >
      <div className="flex items-center justify-between px-3 py-1 lg:py-2.5 border-b border-border shrink-0">
        <span
          id="lesson-contents-title"
          className="text-xs lg:text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Course Content
        </span>
        <button
          ref={closeRef}
          onClick={() => setMobileOpen(false)}
          className="lg:hidden inline-flex h-11 w-11 -mr-2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        {hasResources && (
          <Link
            href={`/course/${courseId}/resources`}
            className="flex items-center gap-2 px-3 py-2.5 coarse:min-h-11 border-b border-border/60 hover:bg-surface-toolbar transition-colors"
          >
            <Download className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span className="flex-1 text-sm lg:text-[0.68rem] font-semibold text-muted-foreground">
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
                className={`w-full flex items-center gap-2 px-3 py-3 lg:py-2.5 coarse:min-h-11 text-left transition-colors ${
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
                  className={`flex-1 text-sm lg:text-[0.68rem] font-semibold leading-snug ${
                    moduleIdx === activeModuleIdx ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {category.name}
                </span>
                <span className="shrink-0 text-xs lg:text-[0.65rem] text-muted-foreground/50 tabular-nums">
                  {completedCount}/{lessons.length}
                </span>
              </button>

              {/* Lesson list: shown when module is open */}
              {isOpen && (
                <div className="bg-surface-inset">
                  {category.sections.map((section) => (
                    <div key={section.index}>
                      {showSectionHeaders && (
                        <div className="px-4 py-1 text-xs lg:text-[0.65rem] uppercase tracking-widest text-muted-foreground/40 border-b border-border/30">
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
                            className={`flex items-start gap-2 px-4 py-3 lg:py-2 coarse:min-h-11 border-b border-surface-toolbar cursor-pointer transition-colors ${
                              isActive ? "bg-surface-active" : "hover:bg-surface-toolbar"
                            }`}
                          >
                            <span
                              className={`text-xs lg:text-[0.65rem] shrink-0 pt-0.5 tabular-nums ${
                                isDone ? "text-success" : "text-muted-foreground/40"
                              }`}
                            >
                              {thisIdx}
                            </span>
                            <span
                              className={`text-sm lg:text-[0.65rem] leading-snug flex-1 min-w-0 line-clamp-2 ${
                                isActive
                                  ? "text-foreground font-semibold"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {label}
                            </span>
                            {isMissing && (
                              <span className="shrink-0 mt-0.5 text-xs lg:text-[0.65rem] uppercase tracking-wide text-muted-foreground/50">
                                missing
                              </span>
                            )}
                            {lesson.archived && (
                              <span className="shrink-0 mt-0.5 text-xs lg:text-[0.65rem] uppercase tracking-wide text-amber-500/70">
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
