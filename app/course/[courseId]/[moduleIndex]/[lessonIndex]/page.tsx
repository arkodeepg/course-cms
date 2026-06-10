import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, FileText, PlayCircle } from "lucide-react";
import { getCourseEntry, getLesson, getLessonsFlat, parseLessonDescription, getResourceFilePath, getVideoFilePath } from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

function linkify(text: string): React.ReactNode {
  const urlRegex = /https?:\/\/[^\s)>\]"]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a
        key={match.index}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 underline hover:text-blue-300 break-all"
      >
        {match[0]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
import { Nav } from "@/components/nav";
import { LessonSidebar } from "@/components/lesson-sidebar";
import { VideoPlayer } from "@/components/video-player";

interface Props {
  params: { courseId: string; moduleIndex: string; lessonIndex: string };
}

export default async function PlayerPage({ params }: Props) {
  const { courseId } = params;
  const moduleIdx = parseInt(params.moduleIndex, 10);
  const lessonIdx = parseInt(params.lessonIndex, 10);

  if (isNaN(moduleIdx) || isNaN(lessonIdx)) notFound();

  const entry = getCourseEntry(courseId);
  if (!entry) notFound();

  const result = getLesson(entry.index, moduleIdx, lessonIdx);
  if (!result) notFound();

  const { lesson, category } = result;
  const { title, description } = parseLessonDescription(lesson);

  const progressRow = await prisma.progress.findUnique({
    where: { courseId_lessonFile: { courseId, lessonFile: lesson.file } },
  });

  const completedRows = await prisma.progress.findMany({
    where: { courseId, completed: true },
    select: { lessonFile: true },
  });
  const completedFiles = completedRows.map((r) => r.lessonFile);
  const completedSet = new Set(completedFiles);

  const flatLessons = getLessonsFlat(category);
  const totalLessons = flatLessons.length;
  const videoAbsPath = getVideoFilePath(courseId, category, lesson);
  const videoSrc = '/api/video' + videoAbsPath.split('/').map(s => encodeURIComponent(s)).join('/');

  const courseName = courseTitle(courseId, entry.index);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav
        breadcrumb={{
          label: `${courseName} · ${category.name}`,
          href: `/course/${courseId}`,
        }}
      />
      <div className="flex flex-col md:flex-row md:flex-1 md:min-h-0">
        <div className="flex flex-col min-w-0 md:flex-1 md:overflow-y-auto">
          <VideoPlayer
            courseId={courseId}
            moduleIndex={moduleIdx}
            lessonIndex={lessonIdx}
            totalLessons={totalLessons}
            lessonFile={lesson.file}
            videoSrc={videoSrc}
            initialPosition={progressRow?.positionSeconds ?? 0}
          />
          <div className="px-4 py-4 border-b border-border">
            <div className="text-[0.7rem] font-semibold text-[#e53e3e] mb-1 uppercase tracking-wide">
              {category.name}
            </div>
            <div className="text-base font-bold text-foreground mb-2">{title}</div>
            {description && (
              <p className="text-[0.72rem] text-muted-foreground leading-relaxed whitespace-pre-line">
                {linkify(description)}
              </p>
            )}
            {lesson.resources && lesson.resources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {lesson.resources.map((resource) => {
                  const resourceAbsPath = getResourceFilePath(courseId, category, lesson, resource);
                  const resourceHref = '/api/resource' + resourceAbsPath.split('/').map((s) => encodeURIComponent(s)).join('/');
                  return (
                    <a
                      key={resource.file}
                      href={resourceHref}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-[0.68rem] font-medium text-foreground hover:bg-secondary/60"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#e53e3e]" />
                      {resource.name}
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile-only inline lesson queue for current module */}
          <div className="md:hidden">
            <div className="px-4 pt-3 pb-2">
              <p className="text-[0.65rem] uppercase tracking-widest text-muted-foreground font-semibold">
                Up next · {category.name}
              </p>
            </div>
            <div className="flex flex-col pb-16">
              {flatLessons.map((l, li) => {
                const idx = li + 1;
                const { title: lTitle } = parseLessonDescription(l);
                const done = completedSet.has(l.file);
                const isActive = idx === lessonIdx;
                return (
                  <Link
                    key={l.file}
                    href={`/course/${courseId}/${moduleIdx}/${idx}`}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-border/20 transition-colors ${
                      isActive ? "bg-[#1e2030]" : "hover:bg-secondary/20"
                    }`}
                  >
                    <span className="text-[0.58rem] tabular-nums text-muted-foreground/40 shrink-0 w-5 text-right">
                      {String(idx).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-[0.78rem] leading-snug flex-1 ${
                        isActive
                          ? "text-foreground font-semibold"
                          : done
                          ? "text-muted-foreground"
                          : "text-foreground/80"
                      }`}
                    >
                      {lTitle}
                    </span>
                    {done && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    {isActive && !done && (
                      <PlayCircle className="h-3.5 w-3.5 shrink-0 text-[#e53e3e]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <LessonSidebar
          courseId={courseId}
          courseIndex={entry.index}
          activeModuleIdx={moduleIdx}
          activeLessonIdx={lessonIdx}
          completedFiles={completedFiles}
        />
      </div>
    </div>
  );
}
