"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SkipBack, SkipForward, Maximize2 } from "lucide-react";

interface VideoPlayerProps {
  courseId: string;
  moduleIndex: number;
  lessonIndex: number;
  totalLessons: number;
  lessonFile: string;
  videoSrc: string;
  initialPosition: number;
}

export function VideoPlayer({
  courseId,
  moduleIndex,
  lessonIndex,
  totalLessons,
  lessonFile,
  videoSrc,
  initialPosition,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const router = useRouter();

  const saveProgress = useCallback(
    async (completed = false) => {
      const video = videoRef.current;
      if (!video) return;
      try {
        await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            lessonFile,
            positionSeconds: video.currentTime,
            completed,
          }),
        });
      } catch {
        // best-effort
      }
    },
    [courseId, lessonFile]
  );

  useEffect(() => {
    const video = videoRef.current;
    const seek = seekRef.current;
    if (!video || !seek) return;

    const onMeta = () => {
      if (initialPosition > 0) video.currentTime = initialPosition;
    };

    const onTime = () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      seek.value = String(pct);
      if (timeRef.current) {
        const fmt = (s: number) =>
          `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
        timeRef.current.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
      }
      if (pct >= 90) saveProgress(true);
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("timeupdate", onTime);

    const timer = setInterval(() => saveProgress(false), 10_000);

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("timeupdate", onTime);
      clearInterval(timer);
    };
  }, [initialPosition, saveProgress]);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    video.currentTime = (Number(e.target.value) / 100) * video.duration;
  }

  function goToLesson(idx: number) {
    saveProgress(false);
    router.push(`/course/${courseId}/${moduleIndex}/${idx}`);
  }

  function toggleFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen();
  }

  return (
    <div className="flex flex-col">
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full aspect-video bg-black cursor-pointer"
        onClick={(e) => {
          const v = e.currentTarget;
          v.paused ? v.play() : v.pause();
        }}
      />
      <div className="flex items-center gap-2 bg-[#1a1c26] border-b border-border px-3 py-2">
        <button
          onClick={() => goToLesson(lessonIndex - 1)}
          disabled={lessonIndex <= 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          title="Previous lesson"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            v.paused ? v.play() : v.pause();
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Play / Pause"
        >
          <span className="text-sm">⏯</span>
        </button>

        <button
          onClick={() => goToLesson(lessonIndex + 1)}
          disabled={lessonIndex >= totalLessons}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          title="Next lesson"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <input
          ref={seekRef}
          type="range"
          min={0}
          max={100}
          defaultValue={0}
          step={0.1}
          onChange={handleSeek}
          className="flex-1 h-1 accent-[#e53e3e] cursor-pointer"
        />

        <span ref={timeRef} className="text-[0.65rem] text-muted-foreground shrink-0 tabular-nums">
          00:00 / 00:00
        </span>

        <button
          onClick={toggleFullscreen}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
