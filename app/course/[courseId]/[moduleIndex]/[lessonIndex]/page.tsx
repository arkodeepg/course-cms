import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Download, FileText, FileWarning, PlayCircle } from "lucide-react";
import {
  getCourseEntry,
  getLesson,
  getLessonsFlat,
  parseLessonDescription,
  getResourceFilePath,
  getLessonFilePath,
  isTextLesson,
  isDocumentLesson,
  isMissingLesson,
  resourceHref,
  readLessonMarkdown,
} from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import { parseTimestamp, resolveStartPosition } from "@/lib/timestamp";
import { computeLessonNav } from "@/lib/lesson-nav";
import { hasUnplayableExtension } from "@/lib/playback";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";

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
import { LessonArticle } from "@/components/lesson-article";
import { LessonToolbar } from "@/components/lesson-toolbar";

interface Props {
  params: { courseId: string; moduleIndex: string; lessonIndex: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export function generateMetadata({ params }: Props): Metadata {
  const entry = getCourseEntry(params.courseId);
  const result = entry
    ? getLesson(entry.index, parseInt(params.moduleIndex, 10), parseInt(params.lessonIndex, 10))
    : null;
  if (!entry || !result) return { title: "Lesson not found" };
  const { title } = parseLessonDescription(result.lesson);
  return { title: `${title} · ${courseTitle(params.courseId, entry.index)}` };
}

export default async function PlayerPage({ params, searchParams }: Props) {
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
  const isArticle = isTextLesson(lesson);
  const isMissing = isMissingLesson(lesson);
  const isDocument = !isMissing && isDocumentLesson(lesson);
  const markdown = isArticle ? readLessonMarkdown(courseId, category, lesson) : "";
  const documentSrc = isDocument ? resourceHref(getLessonFilePath(courseId, category, lesson)) : "";
  const videoAbsPath =
    isArticle || isMissing || isDocument ? "" : getLessonFilePath(courseId, category, lesson);
  // Containers no browser decodes natively (or ones the indexer flagged): offer a download instead.
  const isUnplayable =
    !!videoAbsPath && (lesson.playable === false || hasUnplayableExtension(lesson.file));
  const videoSrc = videoAbsPath
    ? '/api/video' + videoAbsPath.split('/').map(s => encodeURIComponent(s)).join('/')
    : "";

  const courseName = courseTitle(courseId, entry.index);
  // Prev / next run across module boundaries, not just within this module.
  const nav = computeLessonNav(courseId, entry.index, moduleIdx, lessonIdx);
  const initialCompleted = progressRow?.completed ?? false;

  const toolbar = (
    <LessonToolbar
      courseId={courseId}
      lessonIndex={lessonIdx}
      totalLessons={totalLessons}
      lessonFile={lesson.file}
      initialCompleted={initialCompleted}
      prevHref={nav.prevHref}
      nextHref={nav.nextHref}
    />
  );

  // Desktop pins to the viewport so each pane scrolls on its own; mobile keeps page scroll.
  return (
    <div className="flex flex-col min-h-screen md:h-screen md:min-h-0 md:overflow-hidden">
      <Nav
        breadcrumb={{
          label: `${courseName} · ${category.name}`,
          href: `/course/${courseId}`,
        }}
      />
      <div className="flex flex-col md:flex-row md:flex-1 md:min-h-0">
        <div className="flex flex-col min-w-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
          {isMissing ? (
            <>
            {toolbar}
            <div className="flex flex-col items-center justify-center gap-2 bg-black aspect-video w-full px-6 text-center">
              <FileWarning className="h-7 w-7 text-brand" />
              <p className="text-[0.85rem] font-semibold text-foreground">
                This lesson was never downloaded
              </p>
              <p className="text-[0.7rem] text-muted-foreground max-w-md leading-relaxed">
                The file for this lesson is empty in the archive, so there is nothing to
                play. It is listed here so the module keeps its real running order.
              </p>
            </div>
            </>
          ) : isUnplayable ? (
            <>
              {toolbar}
              <div className="flex flex-col items-center justify-center gap-2 bg-black aspect-video w-full px-6 text-center">
                <FileWarning className="h-7 w-7 text-brand" />
                <p className="text-[0.85rem] font-semibold text-foreground">
                  This video format cannot play in a browser
                </p>
                <p className="text-[0.7rem] text-muted-foreground max-w-md leading-relaxed">
                  Browsers cannot decode this file type. Download it and open it in a desktop
                  player such as VLC.
                </p>
                <a
                  href={videoSrc}
                  download
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-[0.7rem] font-medium text-foreground hover:bg-secondary/60"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download video
                </a>
              </div>
            </>
          ) : isArticle || isDocument ? (
            <>
              {toolbar}
              {isDocument &&
                (lesson.file.toLowerCase().endsWith(".pdf") ? (
                  <iframe src={documentSrc} title={title} className="w-full h-[80vh] border-0 bg-white" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={documentSrc} alt={title} className="w-full h-auto bg-black" />
                ))}
            </>
          ) : (
            <VideoPlayer
              courseId={courseId}
              lessonFile={lesson.file}
              videoSrc={videoSrc}
              initialPosition={resolveStartPosition(
                searchParams.t,
                progressRow?.positionSeconds
              )}
              explicitStart={parseTimestamp(searchParams.t) !== null}
              initialCompleted={initialCompleted}
              prevHref={nav.prevHref}
              nextHref={nav.nextHref}
              nextTitle={nav.nextTitle}
            />
          )}
          {/* The divider spans the pane while the article stays at reading width. */}
          <div className="px-4 py-4 border-b border-border">
            <div className={isArticle ? "max-w-3xl" : ""}>
            <div className="text-[0.7rem] font-semibold text-brand mb-1 uppercase tracking-wide">
              {category.name}
            </div>
            <h1
              className={
                isArticle
                  ? "text-xl font-bold text-foreground mb-4 leading-snug"
                  : "text-base font-bold text-foreground mb-2"
              }
            >
              {title}
            </h1>
            {description && (
              <p className="text-[0.72rem] text-muted-foreground leading-relaxed whitespace-pre-line">
                {linkify(description)}
              </p>
            )}
            {isArticle && <LessonArticle markdown={markdown} />}
            {lesson.resources && lesson.resources.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {lesson.resources.map((resource) => {
                  const resourceAbsPath = getResourceFilePath(courseId, category, lesson, resource);
                  const resourceHref = '/api/resource' + resourceAbsPath.split('/').map((s) => encodeURIComponent(s)).join('/');
                  return (
                    <a
                      key={resource.file}
                      href={resourceHref}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-[0.68rem] font-medium text-foreground hover:bg-secondary/60"
                    >
                      <FileText className="h-3.5 w-3.5 text-brand" />
                      {resource.name}
                    </a>
                  );
                })}
              </div>
            )}
            </div>
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
                      isActive ? "bg-surface-active" : "hover:bg-secondary/20"
                    }`}
                  >
                    <span className="text-[0.65rem] tabular-nums text-muted-foreground/40 shrink-0 w-5 text-right">
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
                      <PlayCircle className="h-3.5 w-3.5 shrink-0 text-brand" />
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
