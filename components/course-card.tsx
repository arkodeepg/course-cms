import Link from "next/link";
import { CourseSummary } from "@/types/course";
import { CardMeta, CardProgress, cardModel } from "@/components/course-card-shared";

interface CourseCardProps {
  course: CourseSummary;
}

// List layout. The card is a plain container: the title link is stretched over
// the whole card, and the action link sits above it, so no <a> nests in <a>.
export function CourseCard({ course }: CourseCardProps) {
  const m = cardModel(course);

  return (
    <div className="relative flex items-center gap-3 sm:gap-4 rounded-lg border border-border bg-card px-3 sm:px-4 py-3 hover:bg-card/80 transition-colors">
      <div
        aria-hidden="true"
        className="hidden sm:flex h-12 w-20 shrink-0 rounded-md items-center justify-center text-center text-sm font-bold tracking-wide select-none"
        style={{ background: m.thumbBg, color: m.thumbFg }}
      >
        {m.initials}
      </div>

      <div className="flex-1 min-w-0">
        <Link
          href={m.href}
          title={m.title}
          className="stretched-link text-sm font-semibold text-foreground leading-snug line-clamp-2"
        >
          {m.title}
        </Link>
        <CardMeta m={m} />
        <div className="text-[0.68rem] text-muted-foreground">{m.statusLabel}</div>
        <CardProgress m={m} className="mt-1.5" />
      </div>

      <Link
        href={m.actionHref}
        aria-label={`${m.actionLabel} ${m.title}`}
        className={`relative z-10 shrink-0 rounded px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${m.actionClass}`}
      >
        {m.actionLabel}
      </Link>
    </div>
  );
}
