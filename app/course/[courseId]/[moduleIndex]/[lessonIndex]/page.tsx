import { notFound } from "next/navigation";
import { getCourseEntry, getLesson, getLessonsFlat, parseLessonDescription, getVideoFilePath } from "@/lib/courses";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';
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

  const totalLessons = getLessonsFlat(category).length;
  const videoAbsPath = getVideoFilePath(courseId, category, lesson);
  const videoSrc = '/api/video' + videoAbsPath.split('/').map(s => encodeURIComponent(s)).join('/');

  const courseName = courseId
    .split("-")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

  return (
    <div className="flex flex-col min-h-screen">
      <Nav
        breadcrumb={{
          label: `${courseName} · ${category.name}`,
          href: `/course/${courseId}`,
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <VideoPlayer
            courseId={courseId}
            moduleIndex={moduleIdx}
            lessonIndex={lessonIdx}
            totalLessons={totalLessons}
            lessonFile={lesson.file}
            videoSrc={videoSrc}
            initialPosition={progressRow?.positionSeconds ?? 0}
          />
          <div className="px-4 py-3 border-b border-border">
            <div className="text-[0.7rem] font-semibold text-[#e53e3e] mb-1">
              {category.name}
            </div>
            <div className="text-base font-bold text-foreground mb-1">{title}</div>
            {description && (
              <p className="text-[0.72rem] text-muted-foreground leading-relaxed whitespace-pre-line">
                {description}
              </p>
            )}
          </div>
        </div>
        <LessonSidebar
          courseId={courseId}
          category={category}
          totalLessons={totalLessons}
          currentLessonIdx={lessonIdx}
          completedFiles={completedFiles}
        />
      </div>
    </div>
  );
}
