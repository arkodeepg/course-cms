"use client";

import Link from "next/link";
import { Category } from "@/types/course";
import { CheckIcon } from "lucide-react";

interface LessonSidebarProps {
  courseId: string;
  category: Category;
  totalLessons: number;
  currentLessonIdx: number;
  completedFiles: string[];
}

export function LessonSidebar({
  courseId,
  category,
  totalLessons,
  currentLessonIdx,
  completedFiles,
}: LessonSidebarProps) {
  const showSectionHeaders = category.sections.length > 1;
  const moduleIdx = category.index;

  let flatIdx = 0;

  return (
    <aside className="w-52 shrink-0 border-l border-border bg-[#13151e] flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border text-[0.7rem] font-semibold text-muted-foreground shrink-0">
        {category.name} · {totalLessons} lessons
      </div>
      <div className="flex-1 overflow-y-auto">
        {category.sections.map((section) => (
          <div key={section.index}>
            {showSectionHeaders && (
              <div className="px-3 py-1.5 text-[0.6rem] uppercase tracking-widest text-muted-foreground/50 border-b border-border/50 bg-[#0f1117]">
                {section.name}
              </div>
            )}
            {section.lessons.map((lesson) => {
              flatIdx += 1;
              const thisIdx = flatIdx;
              const isActive = thisIdx === currentLessonIdx;
              const isDone = completedFiles.includes(lesson.file);

              return (
                <Link
                  key={lesson.file}
                  href={`/course/${courseId}/${moduleIdx}/${thisIdx}`}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-[#1e2030] cursor-pointer transition-colors ${
                    isActive ? "bg-[#1e2030]" : "hover:bg-[#1a1c26]"
                  }`}
                >
                  <span className={`text-[0.6rem] shrink-0 pt-0.5 ${isDone ? "text-[#2d6a4f]" : "text-muted-foreground/50"}`}>
                    {thisIdx}
                  </span>
                  <span
                    className={`text-[0.68rem] leading-snug flex-1 ${
                      isActive ? "text-foreground font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {lesson.name.split("\n")[0]}
                  </span>
                  {isDone && (
                    <CheckIcon className="h-3 w-3 shrink-0 text-[#2d6a4f] mt-0.5" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
