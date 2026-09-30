"use client";

import { useState } from "react";
import Link from "next/link";
import { CourseSummary } from "@/types/course";
import { CardMeta, CardProgress, cardModel } from "@/components/course-card-shared";

interface CourseGridCardProps {
  course: CourseSummary;
}

// Grid layout. Same stretched-link structure as CourseCard: one primary link
// covers the card, the action link sits above it.
export function CourseGridCard({ course }: CourseGridCardProps) {
  const m = cardModel(course);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-muted-foreground/40 transition-colors">
      {course.hasCover && !imgError ? (
        // Decorative: the title is right below it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/courses/${m.courseId}/cover`}
          alt=""
          className="h-36 w-full object-cover block"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          aria-hidden="true"
          className="h-36 flex items-center justify-center"
          style={{ background: m.thumbBg }}
        >
          <span
            className="text-4xl font-black tracking-tight select-none"
            style={{ color: m.thumbFg }}
          >
            {m.initials}
          </span>
        </div>
      )}

      <div className="flex-1 flex flex-col px-3 pt-3 pb-2">
        <Link
          href={m.href}
          title={m.title}
          className="stretched-link text-[0.82rem] font-semibold text-foreground leading-snug line-clamp-2"
        >
          {m.title}
        </Link>
        <CardMeta m={m} />
        <div className="text-[0.65rem] text-muted-foreground mt-0.5">{m.statusLabel}</div>
        <CardProgress m={m} className="mt-2" />
      </div>

      <div className="px-3 pb-3">
        <Link
          href={m.actionHref}
          aria-label={`${m.actionLabel} ${m.title}`}
          className={`relative z-10 block w-full text-center rounded py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${m.actionClass}`}
        >
          {m.actionLabel}
        </Link>
      </div>
    </div>
  );
}
