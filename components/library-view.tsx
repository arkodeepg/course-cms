"use client";

import { useState, useEffect } from "react";
import { LayoutList, LayoutGrid } from "lucide-react";
import { CourseCard } from "@/components/course-card";
import { CourseGridCard } from "@/components/course-grid-card";
import { CourseIndex } from "@/types/course";

interface CourseData {
  courseId: string;
  index: CourseIndex;
  completedCount: number;
  startedCount: number;
  resumeHref: string | null;
}

interface LibraryViewProps {
  courses: CourseData[];
}

const STORAGE_KEY = "coursevault-view";

export function LibraryView({ courses }: LibraryViewProps) {
  const [view, setView] = useState<"list" | "grid">("list");

  // Restore preference from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  function switchView(v: "list" | "grid") {
    setView(v);
    localStorage.setItem(STORAGE_KEY, v);
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
          My Courses · {courses.length}
        </p>
        <div className="flex items-center gap-1 bg-secondary/50 rounded p-0.5">
          <button
            onClick={() => switchView("list")}
            title="List view"
            className={`p-1.5 rounded transition-colors ${
              view === "list"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => switchView("grid")}
            title="Grid view"
            className={`p-1.5 rounded transition-colors ${
              view === "grid"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Course list */}
      {view === "list" ? (
        <div className="flex flex-col gap-3">
          {courses.map((d) => (
            <CourseCard key={d.courseId} {...d} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {courses.map((d) => (
            <CourseGridCard key={d.courseId} {...d} />
          ))}
        </div>
      )}
    </div>
  );
}
