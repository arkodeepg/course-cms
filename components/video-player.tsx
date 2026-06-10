"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SkipBack, SkipForward, Maximize2, Volume2, Volume1, VolumeX } from "lucide-react";

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
  const completedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const router = useRouter();

  const SPEEDS = [1, 1.5, 2, 2.5, 3];

  function setPlaybackSpeed(s: number) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = s;
    setSpeed(s);
    setSpeedOpen(false);
  }

  const saveProgress = useCallback(
    async (completed: boolean) => {
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

    completedRef.current = false;
    let timer: NodeJS.Timeout | null = null;
    let seekApplied = false;

    const applySeek = () => {
      if (!seekApplied && initialPosition > 0) {
        seekApplied = true;
        video.currentTime = initialPosition;
      }
    };

    const onMeta = () => {
      applySeek();
      timer = setInterval(() => saveProgress(completedRef.current), 10_000);
    };

    // canplay fires once the browser has buffered enough to start playing —
    // a reliable fallback if loadedmetadata fired before we attached the listener
    const onCanPlay = () => applySeek();

    const onTime = () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (seek) seek.value = String(pct);
      if (timeRef.current) {
        const fmt = (s: number) =>
          `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
            Math.floor(s % 60)
          ).padStart(2, "0")}`;
        timeRef.current.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
      }
      if (!completedRef.current && pct >= 90) {
        completedRef.current = true;
        saveProgress(true);
      }
    };

    // Save immediately when user pauses — don't wait for the 10s timer
    const onPause = () => saveProgress(completedRef.current);

    // If metadata is already loaded (e.g. cached video), attach + fire immediately
    if (video.readyState >= 1) {
      onMeta();
    } else {
      video.addEventListener("loadedmetadata", onMeta);
    }
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onPause);

    return () => {
      if (timer) clearInterval(timer);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onPause);

      // Beacon-save on unmount so position is preserved on client-side navigation
      if (video.currentTime > 1) {
        const data = JSON.stringify({
          courseId,
          lessonFile,
          positionSeconds: video.currentTime,
          completed: completedRef.current,
        });
        try {
          navigator.sendBeacon(
            "/api/progress",
            new Blob([data], { type: "application/json" })
          );
        } catch {
          // sendBeacon unavailable in SSR / test environments
        }
      }
    };
  }, [initialPosition, saveProgress]);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    video.currentTime = (Number(e.target.value) / 100) * video.duration;
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      const restored = volume === 0 ? 1 : volume;
      video.muted = false;
      video.volume = restored;
      setMuted(false);
      setVolume(restored);
    } else {
      video.muted = true;
      setMuted(true);
    }
  }

  function goToLesson(idx: number) {
    saveProgress(completedRef.current);
    router.push(`/course/${courseId}/${moduleIndex}/${idx}`);
  }

  function toggleFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen();
  }

  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex flex-col">
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full bg-black cursor-pointer"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => {
          const v = e.currentTarget;
          v.paused ? v.play() : v.pause();
        }}
      />
      <div className="flex items-center gap-1 sm:gap-2 bg-[#1a1c26] border-b border-border px-2 sm:px-3 min-h-[44px]">
        <button
          onClick={() => goToLesson(lessonIndex - 1)}
          disabled={lessonIndex <= 1}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
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
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Play / Pause"
        >
          <span className="text-sm leading-none">⏯</span>
        </button>

        <button
          onClick={() => goToLesson(lessonIndex + 1)}
          disabled={lessonIndex >= totalLessons}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
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

        <span
          ref={timeRef}
          className="text-[0.65rem] text-muted-foreground shrink-0 tabular-nums hidden sm:inline"
        >
          00:00 / 00:00
        </span>

        {/* Speed picker */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setSpeedOpen((o) => !o); setVolumeOpen(false); }}
            className="text-[0.65rem] font-semibold tabular-nums w-9 h-9 flex items-center justify-center rounded transition-colors hover:text-foreground"
            style={{ color: speed !== 1 ? "hsl(0 72% 51%)" : "hsl(var(--muted-foreground))" }}
            title="Playback speed"
          >
            {speed}×
          </button>
          {speedOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSpeedOpen(false)} />
              <div className="absolute bottom-full mb-1 right-0 z-20 bg-[#1e2030] border border-border rounded shadow-lg py-1 min-w-[64px]">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaybackSpeed(s)}
                    className={`w-full text-left px-3 py-2 text-[0.7rem] transition-colors hover:bg-[#2a2d3e] ${
                      s === speed ? "text-[#e53e3e] font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Volume control */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setVolumeOpen((o) => !o); setSpeedOpen(false); }}
            onDoubleClick={toggleMute}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Volume (double-click to mute)"
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          {volumeOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setVolumeOpen(false)} />
              <div className="absolute bottom-full mb-1 right-0 z-20 bg-[#1e2030] border border-border rounded-lg shadow-lg px-3 py-3 flex flex-col gap-2 w-32">
                <div className="flex items-center justify-between">
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground font-semibold">Volume</span>
                  <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                    {Math.round(effectiveVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={effectiveVolume}
                  onChange={handleVolumeChange}
                  className="w-full h-1 accent-[#e53e3e] cursor-pointer"
                />
                <button
                  onClick={toggleMute}
                  className="text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors text-center"
                >
                  {muted || volume === 0 ? "Unmute" : "Mute"}
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={toggleFullscreen}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
