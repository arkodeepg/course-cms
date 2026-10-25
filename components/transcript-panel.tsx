"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Crosshair, Search, X } from "lucide-react";
import {
  activeCueIndex,
  findMatches,
  formatCueTime,
  parseCaptions,
  transcriptCues,
  type Cue,
  type TextMatch,
} from "@/lib/captions";
import { CMS_PLAYER_TIME_EVENT, dispatchCmsCommand, seekToCommandId, type PlayerTimeDetail } from "@/lib/commands";

/**
 * YouTube-style transcript for a video lesson. With a timed source (VTT/SRT via
 * /api/captions) it lists cues with timestamps, follows playback, and seeks on
 * click. With only an untimed .txt it shows the text with the same search but
 * no seeking. With neither it renders nothing but the player.
 *
 * It wraps the player (passed as children) so that, open on wide screens (xl),
 * the panel sits beside the video at the player's height; below xl, or closed,
 * it is a collapsible block under the player. The page always renders it around
 * the player, so the player keeps its place in the tree from lesson to lesson
 * and is never remounted by a transcript appearing or disappearing.
 */

interface TranscriptPanelProps {
  /** /api/captions URL (text/vtt), or null. Preferred when present. */
  timedSrc: string | null;
  /** /api/resource URL of a plain-text transcript, or null. Fallback. */
  textSrc: string | null;
  /** The video player. */
  children: React.ReactNode;
}

type Loaded =
  { kind: "loading" } | { kind: "timed"; cues: Cue[] } | { kind: "text"; paragraphs: string[] } | { kind: "error" };

const OPEN_KEY = "cms:transcript:open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // storage unavailable: the panel just starts closed next time
  }
}

async function fetchText(src: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(src, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// One match in the whole transcript: which unit (cue or paragraph) and where.
interface UnitMatch extends TextMatch {
  unit: number;
}

function Highlighted({
  text,
  matches,
  current,
}: {
  text: string;
  matches: { start: number; end: number; global: number }[];
  current: number;
}) {
  if (matches.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const m of matches) {
    if (m.start > at) parts.push(text.slice(at, m.start));
    parts.push(
      <mark
        key={m.start}
        data-match={m.global}
        className={
          m.global === current
            ? "rounded-sm bg-brand px-0.5 text-white"
            : "rounded-sm bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/40 dark:text-foreground"
        }
      >
        {text.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

export function TranscriptPanel({ timedSrc, textSrc, children }: TranscriptPanelProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [onlyMatches, setOnlyMatches] = useState(false);
  // False once the viewer scrolls the list by hand; a cue click or "Sync" restores it.
  const [follow, setFollow] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // True once Enter or prev/next has jumped since the query last changed, so the
  // first Enter lands on the first match and later ones step forward.
  const jumpedRef = useRef(false);
  // Which sources the loaded transcript came from, so reopening does not refetch.
  const loadedForRef = useRef<string | null>(null);

  // Client-side navigation to another lesson keeps this component mounted (it
  // wraps the player), so drop the previous lesson's transcript and search.
  const srcKey = `${timedSrc ?? ""}|${textSrc ?? ""}`;
  const hasSource = !!(timedSrc || textSrc);
  const [stateFor, setStateFor] = useState(srcKey);
  if (stateFor !== srcKey) {
    setStateFor(srcKey);
    setLoaded({ kind: "loading" });
    setActive(-1);
    setQuery("");
    setCurrent(0);
    setOnlyMatches(false);
    setFollow(true);
  }

  // Restore the open/closed choice after hydration (the server always renders closed).
  useEffect(() => {
    if (!readOpen()) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Load the transcript the first time the panel opens for this lesson.
  useEffect(() => {
    if (!open || !hasSource || loadedForRef.current === srcKey) return;
    const ctrl = new AbortController();
    const done = (value: Loaded) => {
      loadedForRef.current = srcKey;
      setLoaded(value);
    };
    const load = async () => {
      if (timedSrc) {
        try {
          const cues = transcriptCues(parseCaptions(await fetchText(timedSrc, ctrl.signal)));
          if (cues.length > 0) {
            done({ kind: "timed", cues });
            return;
          }
        } catch {
          if (ctrl.signal.aborted) return;
        }
      }
      if (textSrc) {
        try {
          const raw = (await fetchText(textSrc, ctrl.signal)).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
          const paragraphs = raw
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean);
          done({ kind: "text", paragraphs });
          return;
        } catch {
          if (ctrl.signal.aborted) return;
        }
      }
      setLoaded({ kind: "error" });
    };
    void load();
    return () => ctrl.abort();
  }, [open, hasSource, srcKey, timedSrc, textSrc]);

  const cues = loaded.kind === "timed" ? loaded.cues : null;
  const units = useMemo<string[]>(
    () => (loaded.kind === "timed" ? loaded.cues.map((c) => c.text) : loaded.kind === "text" ? loaded.paragraphs : []),
    [loaded],
  );

  // Follow the player.
  useEffect(() => {
    if (!cues) return;
    const onTime = (e: Event) => {
      const detail = (e as CustomEvent<PlayerTimeDetail>).detail;
      if (!detail) return;
      setActive(activeCueIndex(cues, detail.time));
    };
    window.addEventListener(CMS_PLAYER_TIME_EVENT, onTime);
    return () => window.removeEventListener(CMS_PLAYER_TIME_EVENT, onTime);
  }, [cues]);

  // ---- search ----------------------------------------------------------------

  const matches = useMemo<UnitMatch[]>(() => {
    if (!query.trim()) return [];
    const out: UnitMatch[] = [];
    units.forEach((text, unit) => {
      for (const m of findMatches(text, query)) out.push({ ...m, unit });
    });
    return out;
  }, [units, query]);

  const matchesByUnit = useMemo(() => {
    const map = new Map<number, { start: number; end: number; global: number }[]>();
    matches.forEach((m, global) => {
      const list = map.get(m.unit) ?? [];
      list.push({ start: m.start, end: m.end, global });
      map.set(m.unit, list);
    });
    return map;
  }, [matches]);

  const searching = matches.length > 0;
  const currentMatch = searching ? Math.min(current, matches.length - 1) : -1;

  // Scrolls the list (never the page) so `el` sits about a third of the way down.
  const scrollIntoList = useCallback((el: Element | null, smooth: boolean) => {
    const list = listRef.current;
    if (!list || !el) return;
    const listBox = list.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const target = list.scrollTop + (box.top - listBox.top) - list.clientHeight / 3;
    list.scrollTo({ top: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
  }, []);

  const seek = useCallback((seconds: number) => {
    const id = seekToCommandId(seconds);
    if (id) dispatchCmsCommand(id);
  }, []);

  const goToMatch = useCallback(
    (index: number) => {
      if (matches.length === 0) return;
      const i = ((index % matches.length) + matches.length) % matches.length;
      jumpedRef.current = true;
      setCurrent(i);
      const m = matches[i];
      if (cues) {
        seek(cues[m.unit].start);
        setFollow(true);
      }
      // After render, so the mark carries its "current" styling and exists in a filtered list.
      requestAnimationFrame(() => {
        scrollIntoList(listRef.current?.querySelector(`[data-match="${i}"]`) ?? null, true);
      });
    },
    [matches, cues, seek, scrollIntoList],
  );

  // Auto-scroll to the active cue, unless the viewer took over the scrolling or is searching.
  useEffect(() => {
    if (!open || !follow || query.trim() || active < 0) return;
    scrollIntoList(listRef.current?.querySelector(`[data-cue="${active}"]`) ?? null, true);
  }, [active, open, follow, query, scrollIntoList]);

  // Any hand scroll (wheel, touch, keys, dragging the scrollbar) stops following.
  const stopFollowing = useCallback(() => setFollow(false), []);
  const onListPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setFollow(false); // the scrollbar itself
  };
  // Scroll keys scroll the list while it has focus, instead of reaching the
  // player's shortcuts (arrows there mean volume and seek).
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
      e.stopPropagation();
      setFollow(false);
    }
  };

  const toggleOpen = () => {
    setOpen((o) => {
      writeOpen(!o);
      return !o;
    });
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!searching) return;
      // Shift+Enter steps back.
      goToMatch(e.shiftKey ? currentMatch - 1 : currentMatch + (jumpedRef.current ? 1 : 0));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) setQuery("");
      else searchRef.current?.blur();
    }
  };

  const timed = loaded.kind === "timed";
  const label = timed || (loaded.kind === "loading" && timedSrc) ? "Transcript" : "Transcript (text only)";

  const beside = open && hasSource;

  return (
    <div data-lesson-media className={beside ? "xl:flex xl:items-stretch" : undefined}>
      <div className={beside ? "min-w-0 xl:flex-1" : undefined}>{children}</div>
      {hasSource && (
        <section
          data-transcript-panel
          aria-label="Transcript"
          className={`border-b border-border bg-surface-toolbar/40 ${
            beside ? "xl:relative xl:w-[22rem] 2xl:w-[26rem] xl:shrink-0 xl:border-l" : ""
          }`}
        >
          {/* Beside the video the panel must not grow the row: it fills the player's height and scrolls inside. */}
          <div className={beside ? "xl:absolute xl:inset-0 xl:flex xl:flex-col" : undefined}>
            <button
              type="button"
              onClick={toggleOpen}
              aria-expanded={open}
              aria-controls="lesson-transcript"
              className="flex w-full items-center gap-2 px-4 py-2.5 min-h-11 lg:min-h-0 text-left text-xs lg:text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex-1">{label}</span>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {open && (
              <div id="lesson-transcript" className="px-4 pb-3 xl:flex-1 xl:min-h-0 xl:flex xl:flex-col">
                {loaded.kind === "loading" && (
                  <p className="py-3 text-sm lg:text-[0.72rem] text-muted-foreground">Loading transcript…</p>
                )}
                {loaded.kind === "error" && (
                  <p className="py-3 text-sm lg:text-[0.72rem] text-muted-foreground">
                    The transcript could not be loaded.
                  </p>
                )}

                {(loaded.kind === "timed" || loaded.kind === "text") && (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[12rem]">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          ref={searchRef}
                          type="search"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setCurrent(0);
                            jumpedRef.current = false;
                          }}
                          onKeyDown={onSearchKey}
                          placeholder="Search transcript"
                          aria-label="Search transcript"
                          className="h-9 lg:h-8 w-full rounded-md border border-border bg-surface-field pl-8 pr-8 text-base sm:text-sm lg:text-[0.75rem] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
                        />
                        {query && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuery("");
                              searchRef.current?.focus();
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {query.trim() && (
                        <div className="flex items-center gap-1">
                          <span
                            className="min-w-[4.5rem] text-center text-xs lg:text-[0.68rem] tabular-nums text-muted-foreground"
                            aria-live="polite"
                          >
                            {searching ? `${currentMatch + 1} of ${matches.length}` : "No matches"}
                          </span>
                          <button
                            type="button"
                            onClick={() => goToMatch(currentMatch - 1)}
                            disabled={!searching}
                            className="p-2 coarse:p-3 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                            aria-label="Previous match"
                            title="Previous match (Shift+Enter)"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => goToMatch(currentMatch + 1)}
                            disabled={!searching}
                            className="p-2 coarse:p-3 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                            aria-label="Next match"
                            title="Next match (Enter)"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setOnlyMatches((v) => !v)}
                            aria-pressed={onlyMatches}
                            disabled={!searching}
                            className={`rounded px-1.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide transition-colors disabled:opacity-30 ${
                              onlyMatches ? "text-brand" : "text-muted-foreground hover:text-foreground"
                            }`}
                            title="Show only matching lines"
                          >
                            Filter
                          </button>
                        </div>
                      )}
                      {timed && !follow && !query.trim() && (
                        <button
                          type="button"
                          onClick={() => setFollow(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/30 px-2 py-1 text-xs lg:text-[0.68rem] font-medium text-foreground hover:bg-secondary/60"
                          title="Scroll back to the current line and keep following"
                        >
                          <Crosshair className="h-3.5 w-3.5 text-brand" />
                          Sync
                        </button>
                      )}
                    </div>

                    <div
                      ref={listRef}
                      data-transcript-list
                      tabIndex={0}
                      onWheel={stopFollowing}
                      onTouchMove={stopFollowing}
                      onPointerDown={onListPointerDown}
                      onKeyDown={onListKeyDown}
                      className="relative max-h-[45vh] lg:max-h-[min(22rem,40vh)] xl:max-h-none xl:flex-1 xl:min-h-0 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {loaded.kind === "timed" ? (
                        <ol className="py-1">
                          {loaded.cues.map((cue, i) => {
                            const unitMatches = matchesByUnit.get(i) ?? [];
                            if (onlyMatches && searching && unitMatches.length === 0) return null;
                            const isActive = i === active;
                            return (
                              <li key={i}>
                                <button
                                  type="button"
                                  data-cue={i}
                                  aria-current={isActive ? "true" : undefined}
                                  onClick={() => {
                                    seek(cue.start);
                                    setFollow(true);
                                  }}
                                  className={`group flex w-full items-start gap-3 px-3 py-1.5 coarse:py-2.5 text-left transition-colors ${
                                    isActive ? "bg-surface-active" : "hover:bg-secondary/30"
                                  }`}
                                >
                                  <span
                                    className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[0.7rem] lg:text-[0.65rem] font-semibold tabular-nums ${
                                      isActive
                                        ? "bg-brand text-white"
                                        : "bg-secondary/40 text-muted-foreground group-hover:text-foreground"
                                    }`}
                                  >
                                    {formatCueTime(cue.start)}
                                  </span>
                                  <span
                                    className={`text-sm lg:text-[0.75rem] leading-relaxed ${
                                      isActive ? "text-foreground font-medium" : "text-foreground/80"
                                    }`}
                                  >
                                    <Highlighted text={cue.text} matches={unitMatches} current={currentMatch} />
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      ) : loaded.kind === "text" ? (
                        <div className="space-y-3 px-3 py-2.5">
                          {loaded.paragraphs.map((p, i) => {
                            const unitMatches = matchesByUnit.get(i) ?? [];
                            if (onlyMatches && searching && unitMatches.length === 0) return null;
                            return (
                              <p
                                key={i}
                                className="whitespace-pre-line text-sm lg:text-[0.75rem] leading-relaxed text-foreground/85"
                              >
                                <Highlighted text={p} matches={unitMatches} current={currentMatch} />
                              </p>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    {loaded.kind === "text" && (
                      <p className="mt-1.5 text-[0.7rem] lg:text-[0.65rem] text-muted-foreground">
                        This transcript has no timings, so lines cannot jump to a moment in the video.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
