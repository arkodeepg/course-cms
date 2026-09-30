"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { LayoutList, LayoutGrid, Search, PlayCircle, X } from "lucide-react";
import { CourseCard } from "@/components/course-card";
import { CourseGridCard } from "@/components/course-grid-card";
import { CourseSummary } from "@/types/course";
import {
  LIBRARY_SORTS,
  LibrarySort,
  continueCourses,
  filterCourses,
  isLibrarySort,
  libraryStats,
  sortCourses,
} from "@/lib/library-sort";
import { formatHours, relativeTime, plural } from "@/lib/format";

interface LibraryViewProps {
  courses: CourseSummary[];
  /** Server render time, so relative times match between server and hydration. */
  now: number;
}

const STORAGE_KEY = "coursevault-view";
const SORT_KEY = "coursevault-sort";
const FILTER_KEY = "coursevault-filter";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // storage unavailable (private mode, blocked site data)
  }
}

export function LibraryView({ courses, now }: LibraryViewProps) {
  const [view, setView] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [filter, setFilter] = useState("");

  // Restore preferences after mount so the server render and hydration agree.
  useEffect(() => {
    const saved = readStorage(STORAGE_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
    const savedSort = readStorage(SORT_KEY);
    if (isLibrarySort(savedSort)) setSort(savedSort);
    const savedFilter = readStorage(FILTER_KEY);
    if (savedFilter) setFilter(savedFilter);
  }, []);

  // The command palette toggles the view with a window event.
  useEffect(() => {
    function onViewEvent(e: Event) {
      const detail = (e as CustomEvent).detail;
      setView((cur) => {
        const next = detail === "grid" || detail === "list" ? detail : cur === "list" ? "grid" : "list";
        writeStorage(STORAGE_KEY, next);
        return next;
      });
    }
    window.addEventListener("cms:library-view", onViewEvent);
    return () => window.removeEventListener("cms:library-view", onViewEvent);
  }, []);

  function switchView(v: "list" | "grid") {
    setView(v);
    writeStorage(STORAGE_KEY, v);
  }

  function changeSort(v: string) {
    if (!isLibrarySort(v)) return;
    setSort(v);
    writeStorage(SORT_KEY, v);
  }

  function changeFilter(v: string) {
    setFilter(v);
    writeStorage(FILTER_KEY, v);
  }

  const visible = useMemo(
    () => sortCourses(filterCourses(courses, filter), sort),
    [courses, filter, sort]
  );
  const recent = useMemo(() => continueCourses(courses, 3), [courses]);
  const stats = useMemo(() => libraryStats(courses), [courses]);
  const hours = formatHours(stats.durationSeconds);

  const toggleClass = (active: boolean) =>
    `inline-flex items-center justify-center h-[26px] w-[26px] coarse:h-10 coarse:w-10 rounded transition-colors ${
      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug">My Courses</h1>
        <p className="text-[0.72rem] coarse:text-xs text-muted-foreground mt-1" data-testid="library-stats">
          {plural(stats.courses, "course")} · {plural(stats.lessons, "lesson")}
          {hours && <> · {hours} of video</>} · {stats.percentComplete}% complete
        </p>
      </div>

      {/* Continue where you left off */}
      {recent.length > 0 && (
        <section aria-labelledby="continue-heading" className="mb-6">
          <h2
            id="continue-heading"
            className="text-[0.7rem] coarse:text-xs uppercase tracking-widest text-muted-foreground mb-2"
          >
            Continue where you left off
          </h2>
          {/* Phones: one swipeable row so the course list starts high on screen. */}
          <div
            className="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-px-4 scrollbar-none sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:overflow-visible"
            data-testid="continue-strip"
          >
            {recent.map((c) => {
              const when = relativeTime(c.lastActiveAt, now);
              return (
                <Link
                  key={c.courseId}
                  href={c.resumeHref!}
                  className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-secondary/40 transition-colors min-w-0 w-[78%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none"
                >
                  <PlayCircle className="h-4 w-4 shrink-0 text-brand mt-0.5" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.78rem] font-semibold text-foreground line-clamp-2 sm:line-clamp-1 break-words" title={c.title}>
                      {c.title}
                    </span>
                    {c.resumeLessonTitle && (
                      <span
                        className="block text-[0.68rem] coarse:text-xs text-muted-foreground truncate"
                        title={c.resumeLessonTitle}
                      >
                        {c.resumeLessonTitle}
                      </span>
                    )}
                    {when && (
                      <span className="block text-[0.65rem] coarse:text-xs text-muted-foreground mt-0.5">{when}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => changeFilter(e.target.value)}
            placeholder="Filter by title"
            aria-label="Filter courses by title"
            className="w-full rounded-md border border-border bg-surface-field/60 py-1.5 coarse:h-10 pl-7 pr-7 coarse:pr-10 text-base sm:fine:text-xs text-foreground placeholder:text-muted-foreground"
          />
          {filter && (
            <button
              type="button"
              onClick={() => changeFilter("")}
              aria-label="Clear filter"
              className="absolute right-1 coarse:right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center p-1 coarse:h-10 coarse:w-10 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-[0.7rem] coarse:text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value)}
            className="rounded-md border border-border bg-surface-field/60 px-2 py-1.5 coarse:h-10 text-base sm:fine:text-xs text-foreground"
          >
            {LIBRARY_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div
          className="ml-auto flex items-center gap-1 coarse:gap-2 bg-secondary/50 rounded p-0.5"
          role="group"
          aria-label="Layout"
        >
          <button
            type="button"
            onClick={() => switchView("list")}
            title="List view"
            aria-label="List view"
            aria-pressed={view === "list"}
            className={toggleClass(view === "list")}
          >
            <LayoutList className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => switchView("grid")}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={toggleClass(view === "grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {filter && (
        <p className="text-[0.68rem] coarse:text-xs text-muted-foreground mb-2" aria-live="polite">
          {visible.length} of {plural(courses.length, "course")} match
        </p>
      )}

      {/* Course list */}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">No courses match that filter.</p>
      ) : view === "list" ? (
        <div className="flex flex-col gap-3" data-testid="course-list">
          {visible.map((d) => (
            <CourseCard key={d.courseId} course={d} />
          ))}
        </div>
      ) : (
        <div
          className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          data-testid="course-grid"
        >
          {visible.map((d) => (
            <CourseGridCard key={d.courseId} course={d} />
          ))}
        </div>
      )}
    </div>
  );
}
