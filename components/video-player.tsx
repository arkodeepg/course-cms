"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Volume2,
  Volume1,
  VolumeX,
  Link2,
  Check,
  Download,
  FileWarning,
  Play,
  Pause,
  MoreHorizontal,
} from "lucide-react";
import { formatTimestampParam } from "@/lib/timestamp";
import { PLAYBACK_SPEEDS, resolveResumePosition, stepSpeed } from "@/lib/playback";
import { CMS_COMMAND_EVENT, isTypingTarget } from "@/lib/commands";
import { choosePreload, SSR_PRELOAD, type PreloadMode } from "@/lib/preload";

/**
 * CourseVault is served over plain HTTP on the LAN / tailnet, which is not a
 * secure context, so `navigator.clipboard` is undefined there. Fall back to the
 * legacy textarea trick rather than failing silently.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

// Every storage access is wrapped: private windows and blocked site data throw.
const LS = {
  speed: "cms:player:speed",
  volume: "cms:player:volume",
  muted: "cms:player:muted",
  autoplayNext: "cms:player:autoplayNext",
};
// Session flag holding the href we are about to open, so that lesson starts playing.
const AUTOPLAY_FLAG = "cms:player:autoplay";

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the preference is just not remembered
  }
}
function setAutoplayFlag(href: string) {
  try {
    window.sessionStorage.setItem(AUTOPLAY_FLAG, href);
  } catch {
    // ignore
  }
}
function takeAutoplayFlag(): boolean {
  try {
    const href = window.sessionStorage.getItem(AUTOPLAY_FLAG);
    if (href === null) return false;
    window.sessionStorage.removeItem(AUTOPLAY_FLAG);
    return href === window.location.pathname;
  } catch {
    return false;
  }
}

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function mediaErrorMessage(code: number | undefined): string {
  switch (code) {
    case 1:
      return "Playback was aborted.";
    case 2:
      return "A network error stopped the video from loading.";
    case 3:
      return "The browser could not decode this video.";
    case 4:
      return "This video format cannot play in a browser.";
    default:
      return "This video could not be played.";
  }
}

// Vendor-prefixed fullscreen bits (Safari).
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type OrientationLockable = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};
type NetworkNavigator = Navigator & { connection?: { saveData?: boolean } };

function isCoarsePointer(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

// Phones rotate into landscape for fullscreen video; both calls are best-effort.
function lockLandscape() {
  try {
    void (screen.orientation as OrientationLockable | undefined)?.lock?.("landscape")?.catch(() => {});
  } catch {
    // orientation lock unsupported
  }
}
function unlockOrientation() {
  try {
    (screen.orientation as OrientationLockable | undefined)?.unlock?.();
  } catch {
    // nothing locked
  }
}

type PipDocument = Document & {
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
  pictureInPictureEnabled?: boolean;
};

interface VideoPlayerProps {
  courseId: string;
  lessonFile: string;
  videoSrc: string;
  initialPosition: number;
  /** True when initialPosition came from an explicit `?t=`; skips the resume guard. */
  explicitStart?: boolean;
  initialCompleted?: boolean;
  /** Course-wide neighbours, computed on the server; null at either end of the course. */
  prevHref: string | null;
  nextHref: string | null;
  nextTitle: string | null;
}

export function VideoPlayer({
  courseId,
  lessonFile,
  videoSrc,
  initialPosition,
  explicitStart = false,
  initialCompleted = false,
  prevHref,
  nextHref,
  nextTitle,
}: VideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const completedRef = useRef(false);
  // Last position seen on timeupdate for the CURRENT src. The unmount beacon
  // reads this, because by cleanup time React has already swapped `src`.
  const lastTimeRef = useRef(0);
  const lastSavedRef = useRef(-1);
  const isScrubbingRef = useRef(false);
  // The src whose saved position has been applied; a refresh of the same lesson must not re-seek.
  const seekAppliedForRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false); // mobile overflow menu
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const speedButtonRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [upNext, setUpNext] = useState<number | null>(null); // seconds left, null = hidden
  // Mirrors the element's paused state for the play/pause button icon only.
  const [playing, setPlaying] = useState(false);
  // Server and first client render agree on "metadata"; a mount effect upgrades desktops to "auto".
  const [preload, setPreload] = useState<PreloadMode>(SSR_PRELOAD);
  const router = useRouter();
  const pathname = usePathname();

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 900);
  }, []);

  // ---- persisted preferences -------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    const s = Number(readStore(LS.speed));
    const v = readStore(LS.volume);
    const m = readStore(LS.muted);
    const a = readStore(LS.autoplayNext);
    if (s > 0 && s <= 16) {
      setSpeed(s);
      if (video) {
        video.defaultPlaybackRate = s;
        video.playbackRate = s;
      }
    }
    if (v !== null && v !== "" && Number.isFinite(Number(v))) {
      const vol = Math.min(1, Math.max(0, Number(v)));
      setVolume(vol);
      if (video) video.volume = vol;
    }
    if (m !== null) {
      setMuted(m === "1");
      if (video) video.muted = m === "1";
    }
    if (a !== null) setAutoplayNext(a === "1");
    if (video) {
      setPipSupported(!!(document as PipDocument).pictureInPictureEnabled && !video.disablePictureInPicture);
    }
  }, []);

  const applySpeed = useCallback(
    (s: number, announce = true) => {
      const video = videoRef.current;
      if (!video || !(s > 0)) return;
      const rate = Math.min(16, Math.max(0.0625, s));
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
      setSpeed(rate);
      setSpeedOpen(false);
      writeStore(LS.speed, String(rate));
      if (announce) showToast(`${rate}x`);
    },
    [showToast]
  );

  const applyVolume = useCallback(
    (v: number, announce = true) => {
      const video = videoRef.current;
      if (!video) return;
      const vol = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
      video.volume = vol;
      video.muted = vol === 0;
      setVolume(vol);
      setMuted(vol === 0);
      writeStore(LS.volume, String(vol));
      writeStore(LS.muted, vol === 0 ? "1" : "0");
      if (announce) showToast(`Volume ${Math.round(vol * 100)}%`);
    },
    [showToast]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      const restored = video.volume === 0 ? 1 : video.volume;
      video.muted = false;
      video.volume = restored;
      setMuted(false);
      setVolume(restored);
      writeStore(LS.muted, "0");
      writeStore(LS.volume, String(restored));
      showToast(`Volume ${Math.round(restored * 100)}%`);
    } else {
      video.muted = true;
      setMuted(true);
      writeStore(LS.muted, "1");
      showToast("Muted");
    }
  }, [showToast]);

  function toggleAutoplayNext() {
    const next = !autoplayNext;
    setAutoplayNext(next);
    writeStore(LS.autoplayNext, next ? "1" : "0");
    if (!next) setUpNext(null);
  }

  // ---- progress --------------------------------------------------------------

  const postProgress = useCallback(
    async (positionSeconds: number, completed: boolean) => {
      lastSavedRef.current = positionSeconds;
      try {
        await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, lessonFile, positionSeconds, completed }),
        });
      } catch {
        // best-effort
      }
    },
    [courseId, lessonFile]
  );

  const saveProgress = useCallback(
    (completed: boolean) => postProgress(lastTimeRef.current, completed),
    [postProgress]
  );

  // Paint played / buffered / rest on the seek track.
  const paintSeek = useCallback((playedPct: number) => {
    const video = videoRef.current;
    const seek = seekRef.current;
    if (!video || !seek) return;
    let bufferedPct = 0;
    const d = video.duration;
    if (d && Number.isFinite(d)) {
      const t = video.currentTime;
      const b = video.buffered;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= t + 0.5 && b.end(i) >= t) {
          bufferedPct = (b.end(i) / d) * 100;
          break;
        }
      }
    }
    const p = Math.max(0, Math.min(100, playedPct));
    const buf = Math.max(p, Math.min(100, bufferedPct));
    // Only the image: size/position classes keep it a thin band inside the taller hit area.
    seek.style.backgroundImage = `linear-gradient(to right, hsl(var(--brand)) 0%, hsl(var(--brand)) ${p}%, rgba(255,255,255,0.38) ${p}%, rgba(255,255,255,0.38) ${buf}%, rgba(255,255,255,0.12) ${buf}%, rgba(255,255,255,0.12) 100%)`;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const seek = seekRef.current;
    if (!video || !seek) return;

    const src = videoSrc;
    // Listeners stay attached for a moment after React swaps src on client-side
    // navigation; anything they see then belongs to the next lesson.
    const isCurrent = () => video.getAttribute("src") === src;
    const isNewSrc = seekAppliedForRef.current !== src;

    if (isNewSrc) {
      completedRef.current = initialCompleted;
      lastTimeRef.current = 0;
      lastSavedRef.current = -1;
      setError(null);
      setUpNext(null);
      seek.value = "0";
      paintSeek(0);
    } else {
      // Same lesson re-rendered (router.refresh): keep what the viewer has done.
      completedRef.current = completedRef.current || initialCompleted;
      lastTimeRef.current = video.currentTime;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    let autoplayChecked = !isNewSrc;

    const sendBeacon = () => {
      const t = lastTimeRef.current;
      if (t <= 1) return;
      lastSavedRef.current = t;
      const data = JSON.stringify({
        courseId,
        lessonFile,
        positionSeconds: t,
        completed: completedRef.current,
      });
      try {
        navigator.sendBeacon("/api/progress", new Blob([data], { type: "application/json" }));
      } catch {
        // sendBeacon unavailable
      }
    };

    const applySeek = () => {
      if (!isCurrent()) return;
      if (seekAppliedForRef.current !== src) {
        seekAppliedForRef.current = src;
        const start = explicitStart
          ? initialPosition
          : resolveResumePosition(initialPosition, video.duration, initialCompleted);
        if (start > 0) {
          video.currentTime = start;
          lastTimeRef.current = start;
          lastSavedRef.current = start;
        }
      }
      if (!autoplayChecked) {
        autoplayChecked = true;
        if (takeAutoplayFlag()) video.play().catch(() => {});
      }
    };

    const onMeta = () => {
      if (!isCurrent()) return;
      // The load algorithm resets playbackRate to defaultPlaybackRate; keep them aligned.
      if (video.playbackRate !== video.defaultPlaybackRate) video.playbackRate = video.defaultPlaybackRate;
      applySeek();
      if (!timer) {
        timer = setInterval(() => {
          if (!isCurrent() || video.paused) return;
          const t = lastTimeRef.current;
          if (Math.abs(t - lastSavedRef.current) < 0.5) return;
          void postProgress(t, completedRef.current);
        }, 10_000);
      }
    };

    const onCanPlay = () => applySeek();

    const onTime = () => {
      if (!isCurrent() || !video.duration) return;
      lastTimeRef.current = video.currentTime;
      const pct = (video.currentTime / video.duration) * 100;
      if (!isScrubbingRef.current) {
        seek.value = String(pct);
        paintSeek(pct);
      }
      if (timeRef.current) {
        timeRef.current.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
      }
      if (!completedRef.current && pct >= 90) {
        completedRef.current = true;
        void postProgress(video.currentTime, true);
      }
    };

    const onProgress = () => {
      if (!isCurrent() || isScrubbingRef.current || !video.duration) return;
      paintSeek((video.currentTime / video.duration) * 100);
    };

    // Save immediately when the viewer pauses, do not wait for the 10 s timer
    const onPause = () => {
      if (!isCurrent() || video.ended) return;
      void postProgress(lastTimeRef.current, completedRef.current);
    };

    const onPlay = () => setUpNext(null);

    const onEnded = () => {
      if (!isCurrent()) return;
      completedRef.current = true;
      lastTimeRef.current = video.duration || lastTimeRef.current;
      void postProgress(lastTimeRef.current, true);
      if (handlersRef.current.nextHref && handlersRef.current.autoplayNext) setUpNext(5);
    };

    const onError = () => {
      if (!isCurrent()) return;
      setError(mediaErrorMessage(video.error?.code));
    };

    const onPageHide = () => sendBeacon();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendBeacon();
    };

    if (video.readyState >= 1) onMeta();
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("progress", onProgress);
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    // An error that fired before hydration would otherwise go unseen.
    if (video.error) onError();

    return () => {
      if (timer) clearInterval(timer);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // Beacon-save on unmount / lesson switch so position survives client-side navigation
      sendBeacon();
    };
  }, [videoSrc, courseId, lessonFile, initialPosition, explicitStart, initialCompleted, postProgress, paintSeek]);

  // ---- preload: buffer eagerly on desktop, sip data on phones and Save-Data --

  useEffect(() => {
    const video = videoRef.current;
    const saveData = (navigator as NetworkNavigator).connection?.saveData ?? false;
    setPreload(choosePreload({ coarsePointer: isCoarsePointer(), saveData, hasPlayed: !!video && !video.paused }));
    if (!video) return;
    const onPlay = () => setPreload("auto");
    video.addEventListener("play", onPlay);
    return () => video.removeEventListener("play", onPlay);
    // Re-decide per lesson: a new src on a phone should not inherit "auto" from the last one.
  }, [videoSrc]);

  // ---- fullscreen / PiP state ------------------------------------------------

  useEffect(() => {
    const doc = document as WebkitDocument;
    const onFs = () => {
      const el = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsFullscreen(!!el && el === wrapperRef.current);
      if (!el) unlockOrientation();
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    const video = videoRef.current;
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);
    video?.addEventListener("enterpictureinpicture", onEnterPip);
    video?.addEventListener("leavepictureinpicture", onLeavePip);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      video?.removeEventListener("enterpictureinpicture", onEnterPip);
      video?.removeEventListener("leavepictureinpicture", onLeavePip);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as WebkitDocument;
    const wrapper = wrapperRef.current as WebkitElement | null;
    const video = videoRef.current as WebkitVideo | null;
    if (!wrapper || !video) return;
    const current = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (current) {
        if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
        else void doc.webkitExitFullscreen?.();
        return;
      }
      if (wrapper.requestFullscreen) {
        wrapper
          .requestFullscreen()
          .then(() => {
            if (isCoarsePointer()) lockLandscape();
          })
          .catch(() => {
            // Element fullscreen refused (iPhone Safari): the native video fullscreen still works.
            try {
              video.webkitEnterFullscreen?.();
            } catch {
              // refused as well
            }
          });
      } else if (wrapper.webkitRequestFullscreen) {
        void wrapper.webkitRequestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        // iOS Safari: only the video element itself can go fullscreen
        video.webkitEnterFullscreen();
      }
    } catch {
      // fullscreen refused
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const doc = document as PipDocument;
    try {
      if (doc.pictureInPictureElement) await doc.exitPictureInPicture?.();
      else if (doc.pictureInPictureEnabled) await video.requestPictureInPicture();
    } catch {
      // PiP refused (no metadata yet, or not allowed)
    }
  }, []);

  // ---- actions ---------------------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setPlaying(!video.paused);
    sync();
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("emptied", sync);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("emptied", sync);
    };
  }, [videoSrc]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || !v.duration) return;
      const t = Math.max(0, Math.min(v.duration, v.currentTime + delta));
      v.currentTime = t;
      showToast(`${delta > 0 ? "+" : "-"}${Math.abs(delta)}s  ${fmtTime(t)}`);
    },
    [showToast]
  );

  const seekToFraction = useCallback(
    (fraction: number) => {
      const v = videoRef.current;
      if (!v || !v.duration) return;
      const t = v.duration * fraction;
      v.currentTime = t;
      showToast(fmtTime(t));
    },
    [showToast]
  );

  const goTo = useCallback(
    (href: string | null, opts: { autoplay?: boolean } = {}) => {
      if (!href) return;
      const v = videoRef.current;
      setUpNext(null);
      // Save before leaving; the unmount beacon is the backstop.
      void saveProgress(completedRef.current);
      // Keep playing across lessons if it was playing when the viewer moved on.
      if (opts.autoplay ?? (v ? !v.paused : false)) setAutoplayFlag(href);
      router.push(href);
    },
    [router, saveProgress]
  );

  const markComplete = useCallback(() => {
    completedRef.current = true;
    void postProgress(lastTimeRef.current, true);
    showToast("Marked complete");
  }, [postProgress, showToast]);

  const copyLinkAtCurrentTime = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const t = formatTimestampParam(video.currentTime);
    const url = `${window.location.origin}${pathname}?t=${t}`;
    if (await copyText(url)) {
      setCopied(true);
      showToast("Link copied");
      setTimeout(() => setCopied(false), 1500);
    }
  }, [pathname, showToast]);

  // Latest values for the long-lived window/document listeners.
  const latest = {
    togglePlay,
    seekBy,
    seekToFraction,
    applySpeed,
    applyVolume,
    toggleMute,
    toggleFullscreen,
    togglePip,
    goTo,
    markComplete,
    copyLinkAtCurrentTime,
    prevHref,
    nextHref,
    autoplayNext,
  };
  const handlersRef = useRef(latest);
  handlersRef.current = latest;

  // ---- keyboard shortcuts + palette commands ---------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      const h = handlersRef.current;
      const video = videoRef.current;
      const currentVolume = video ? (video.muted ? 0 : video.volume) : 1;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let handled = true;
      switch (key) {
        case " ":
        case "k":
          h.togglePlay();
          break;
        case "ArrowLeft":
          h.seekBy(-5);
          break;
        case "ArrowRight":
          h.seekBy(5);
          break;
        case "j":
          h.seekBy(-10);
          break;
        case "l":
          h.seekBy(10);
          break;
        case "ArrowUp":
          h.applyVolume(currentVolume + 0.05);
          break;
        case "ArrowDown":
          h.applyVolume(currentVolume - 0.05);
          break;
        case "m":
          h.toggleMute();
          break;
        case "f":
          h.toggleFullscreen();
          break;
        case ">":
          h.applySpeed(stepSpeed(video?.playbackRate ?? 1, 1));
          break;
        case "<":
          h.applySpeed(stepSpeed(video?.playbackRate ?? 1, -1));
          break;
        case "n":
          h.goTo(h.nextHref);
          break;
        case "p":
          h.goTo(h.prevHref);
          break;
        default:
          if (/^[0-9]$/.test(key)) h.seekToFraction(Number(key) / 10);
          else handled = false;
      }
      if (handled) e.preventDefault();
    };

    const onCommand = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const h = handlersRef.current;
      if (id === "play-toggle") h.togglePlay();
      else if (id === "next") h.goTo(h.nextHref);
      else if (id === "prev") h.goTo(h.prevHref);
      else if (id === "mark-complete") h.markComplete();
      else if (id === "copy-timestamp") void h.copyLinkAtCurrentTime();
      else if (id === "fullscreen") h.toggleFullscreen();
      else if (id === "pip") void h.togglePip();
      else if (id.startsWith("speed:")) {
        const s = Number(id.slice(6));
        if (s > 0) h.applySpeed(s);
      } else if (id.startsWith("seek:")) {
        const d = Number(id.slice(5));
        if (Number.isFinite(d) && d !== 0) h.seekBy(d);
      }
    };

    document.addEventListener("keydown", onKey);
    window.addEventListener(CMS_COMMAND_EVENT, onCommand);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(CMS_COMMAND_EVENT, onCommand);
    };
  }, []);

  // ---- up-next countdown -----------------------------------------------------

  useEffect(() => {
    if (upNext === null) return;
    if (upNext <= 0) {
      handlersRef.current.goTo(handlersRef.current.nextHref, { autoplay: true });
      return;
    }
    const t = setTimeout(() => setUpNext((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNext]);

  // ---- seek bar --------------------------------------------------------------

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const pct = Number(e.target.value);
    video.currentTime = (pct / 100) * video.duration;
    paintSeek(pct);
    if (timeRef.current) {
      timeRef.current.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
    }
  }

  function startScrub() {
    isScrubbingRef.current = true;
    const end = () => {
      isScrubbingRef.current = false;
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    applyVolume(Number(e.target.value), false);
  }

  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  // More menu: focus its first item on open; Esc (from anywhere) closes it and
  // returns focus to the More button.
  useEffect(() => {
    if (!moreOpen) return;
    moreMenuRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [moreOpen]);

  // Speed sheet / popover: Esc closes it and returns focus to the speed button.
  useEffect(() => {
    if (!speedOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setSpeedOpen(false);
      speedButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [speedOpen]);

  // Coarse pointers get 44 px rows in the popovers; the bottom sheet always has them.
  const menuRow = "[@media(pointer:coarse)]:min-h-11";

  return (
    <div ref={wrapperRef} className={`flex flex-col ${isFullscreen ? "h-full w-full bg-black" : ""}`}>
      <div className={`relative bg-black ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
        <video
          ref={videoRef}
          src={videoSrc}
          preload={preload}
          playsInline
          className={`block w-full bg-black cursor-pointer ${isFullscreen ? "h-full object-contain" : ""}`}
          style={isFullscreen ? undefined : { maxHeight: "70vh" }}
          onClick={togglePlay}
        />

        {toast && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-[0.75rem] font-semibold tabular-nums text-white whitespace-pre">
            {toast}
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 px-6 text-center">
            <FileWarning className="h-7 w-7 text-brand" />
            <p className="text-[0.95rem] lg:text-[0.85rem] font-semibold text-foreground">{error}</p>
            <p className="text-sm lg:text-[0.7rem] text-muted-foreground max-w-md leading-relaxed">
              Download the file and open it in a desktop player such as VLC.
            </p>
            <a
              href={videoSrc}
              download
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5 text-xs lg:text-[0.7rem] font-medium text-foreground hover:bg-secondary/60"
            >
              <Download className="h-3.5 w-3.5" />
              Download video
            </a>
          </div>
        )}

        {upNext !== null && nextHref && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6">
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <span className="text-xs lg:text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Playing in {upNext}s
              </span>
              <p className="text-[0.95rem] font-semibold leading-snug text-foreground line-clamp-2">
                Up next: {nextTitle ?? "Next lesson"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUpNext(null)}
                  className={`rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-xs lg:text-[0.72rem] font-medium text-foreground hover:bg-secondary/60 ${menuRow}`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => goTo(nextHref, { autoplay: true })}
                  className={`inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs lg:text-[0.72rem] font-semibold text-white hover:bg-brand-hover ${menuRow}`}
                >
                  Play now
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Below lg the seek bar owns a full-width row and secondary controls live in More;
          from lg up everything sits on one row. */}
      <div
        data-player-bar
        className="flex flex-wrap lg:flex-nowrap items-center gap-x-1 lg:gap-2 bg-surface-toolbar border-b border-border px-2 lg:px-3 min-h-[44px] shrink-0"
      >
        <button
          onClick={() => goTo(prevHref)}
          disabled={!prevHref}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          title="Previous lesson (P)"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        <button
          onClick={togglePlay}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Play / Pause (Space or K)"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <button
          onClick={() => goTo(nextHref)}
          disabled={!nextHref}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          title="Next lesson (N)"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        {/* The input is the (tall) hit area; the visible track is a 4 px background band. */}
        <input
          ref={seekRef}
          type="range"
          min={0}
          max={100}
          defaultValue={0}
          step={0.1}
          onChange={handleSeek}
          onPointerDown={startScrub}
          aria-label="Seek"
          className="order-first basis-full mt-1 lg:order-none lg:basis-auto lg:m-0 flex-1 min-w-0 lg:min-w-[240px] h-6 [@media(pointer:coarse)]:h-11 cursor-pointer appearance-none bg-transparent bg-[linear-gradient(rgba(255,255,255,0.12),rgba(255,255,255,0.12))] bg-no-repeat bg-center bg-[length:100%_4px] [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [@media(pointer:coarse)]:[&::-webkit-slider-thumb]:h-5 [@media(pointer:coarse)]:[&::-webkit-slider-thumb]:w-5 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand [@media(pointer:coarse)]:[&::-moz-range-thumb]:h-5 [@media(pointer:coarse)]:[&::-moz-range-thumb]:w-5"
        />

        <span
          ref={timeRef}
          className="text-xs lg:text-[0.65rem] text-muted-foreground shrink-0 tabular-nums mr-auto pl-1 lg:mr-0 lg:pl-0 whitespace-nowrap"
        >
          00:00 / 00:00
        </span>

        {/* Speed picker: a bottom sheet below lg (the player sits right under the sticky
            nav on phones, so an upward popover would hide behind it), a popover from lg up. */}
        <div className="relative shrink-0">
          <button
            ref={speedButtonRef}
            onClick={() => { setSpeedOpen((o) => !o); setVolumeOpen(false); setMoreOpen(false); }}
            className="text-xs lg:text-[0.65rem] font-semibold tabular-nums min-w-9 h-9 px-1 flex items-center justify-center rounded transition-colors hover:text-foreground"
            style={{ color: speed !== 1 ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))" }}
            title="Playback speed (< and >)"
            aria-haspopup="true"
            aria-expanded={speedOpen}
          >
            {speed}×
          </button>
          {speedOpen && (
            <>
              <div
                className="fixed inset-0 z-[60] bg-black/50 lg:z-10 lg:bg-transparent"
                onClick={() => setSpeedOpen(false)}
              />
              <div
                data-speed-menu
                role="group"
                aria-label="Playback speed"
                className="fixed inset-x-0 bottom-0 z-[61] max-h-[60dvh] overflow-y-auto overscroll-contain rounded-t-xl border-t border-border bg-surface-active pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg lg:absolute lg:inset-x-auto lg:bottom-full lg:right-0 lg:mb-1 lg:max-h-[calc(100dvh-8rem)] lg:min-w-[64px] lg:rounded lg:border lg:py-1"
              >
                <div className="lg:hidden px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Playback speed
                </div>
                {PLAYBACK_SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => applySpeed(s, false)}
                    aria-pressed={s === speed}
                    className={`w-full flex items-center text-left px-4 min-h-11 text-sm lg:px-3 lg:py-2 lg:text-[0.7rem] lg:[@media(pointer:fine)]:min-h-0 transition-colors hover:bg-surface-field ${
                      s === speed ? "text-brand font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Volume control (from sm; below sm it lives in the More menu) */}
        <div className="relative shrink-0 hidden sm:block">
          <button
            onClick={() => { setVolumeOpen((o) => !o); setSpeedOpen(false); setMoreOpen(false); }}
            onDoubleClick={toggleMute}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Volume (double-click or M to mute)"
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          {volumeOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setVolumeOpen(false)} />
              <div className="absolute bottom-full mb-1 right-0 z-20 bg-surface-active border border-border rounded-lg shadow-lg px-3 py-3 flex flex-col gap-2 w-36 lg:w-32">
                <div className="flex items-center justify-between">
                  <span className="text-xs lg:text-[0.65rem] uppercase tracking-widest text-muted-foreground font-semibold">Volume</span>
                  <span className="text-xs lg:text-[0.65rem] text-muted-foreground tabular-nums">
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
                  aria-label="Volume"
                  className="w-full h-1 [@media(pointer:coarse)]:h-6 accent-brand cursor-pointer"
                />
                <button
                  onClick={toggleMute}
                  className={`text-xs lg:text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors text-center ${menuRow}`}
                >
                  {muted || volume === 0 ? "Unmute" : "Mute"}
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={toggleAutoplayNext}
          aria-pressed={autoplayNext}
          className={`hidden lg:inline-flex shrink-0 items-center rounded px-1.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition-colors ${
            autoplayNext ? "text-brand" : "text-muted-foreground/60 hover:text-foreground"
          }`}
          title={autoplayNext ? "Autoplay next lesson: on" : "Autoplay next lesson: off"}
        >
          Auto
        </button>

        <button
          onClick={copyLinkAtCurrentTime}
          className="hidden lg:inline-flex p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Copy link at current time"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
        </button>

        {pipSupported && (
          <button
            onClick={togglePip}
            className={`hidden lg:inline-flex p-2 transition-colors shrink-0 ${isPip ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
            title="Picture-in-picture"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}

        {/* More menu below lg: Auto next, Copy link, PiP, and volume below sm */}
        <div className="relative shrink-0 lg:hidden">
          <button
            ref={moreButtonRef}
            onClick={() => { setMoreOpen((o) => !o); setSpeedOpen(false); setVolumeOpen(false); }}
            className={`p-2 transition-colors ${moreOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="More controls"
            aria-label="More controls"
            aria-haspopup="true"
            aria-expanded={moreOpen}
            aria-controls="player-more-menu"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
              <div
                ref={moreMenuRef}
                id="player-more-menu"
                role="group"
                aria-label="More player controls"
                className="absolute bottom-full mb-1 right-0 z-20 w-60 max-w-[calc(100vw-1rem)] bg-surface-active border border-border rounded-lg shadow-lg py-1"
              >
                <button
                  onClick={toggleAutoplayNext}
                  role="switch"
                  aria-checked={autoplayNext}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-surface-field transition-colors ${menuRow}`}
                >
                  <span>Auto next lesson</span>
                  <span className={`text-xs font-semibold uppercase ${autoplayNext ? "text-brand" : "text-muted-foreground"}`}>
                    {autoplayNext ? "On" : "Off"}
                  </span>
                </button>
                <button
                  onClick={() => void copyLinkAtCurrentTime()}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-surface-field transition-colors ${menuRow}`}
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Link2 className="h-4 w-4" />}
                  <span>{copied ? "Link copied" : "Copy link at current time"}</span>
                </button>
                {pipSupported && (
                  <button
                    onClick={() => { setMoreOpen(false); void togglePip(); }}
                    aria-pressed={isPip}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-field transition-colors ${menuRow} ${isPip ? "text-brand" : "text-foreground"}`}
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                    <span>Picture-in-picture</span>
                  </button>
                )}
                <div className="sm:hidden border-t border-border mt-1 px-3 pt-2 pb-1.5 flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="shrink-0 p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors [@media(pointer:coarse)]:p-2.5 [@media(pointer:coarse)]:-ml-2.5"
                    aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                    title={muted || volume === 0 ? "Unmute" : "Mute"}
                  >
                    <VolumeIcon className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={effectiveVolume}
                    onChange={handleVolumeChange}
                    aria-label="Volume"
                    className="flex-1 min-w-0 h-1 [@media(pointer:coarse)]:h-6 accent-brand cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
                    {Math.round(effectiveVolume * 100)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={toggleFullscreen}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Fullscreen (F)"
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
