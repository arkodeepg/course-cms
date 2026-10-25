/**
 * Caption parsing for the player's CC overlay and the lesson transcript panel.
 *
 * Pure (no fs, no DOM), so the same code runs in the captions API route, in the
 * browser, and in Jest. Handles WebVTT and SubRip, plus the common mislabels:
 * an `.srt` that is really WebVTT, a `.vtt` with no header, CRLF line endings,
 * a UTF-8 BOM, comma millisecond separators, and YouTube auto-caption files
 * whose cues carry inline word timings and roll the previous line forward.
 */

export interface Cue {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  /** Cue payload with markup stripped and entities decoded. May hold newlines. */
  text: string;
}

// hh:mm:ss.mmm, mm:ss.mmm, or either with a comma (SubRip). Hours may exceed 99.
const TIME = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/;
const TIMING_LINE = /^\s*(\S+)\s+-->\s+(\S+)/;

export function parseCueTime(raw: string): number | null {
  const m = TIME.exec(raw.trim());
  if (!m) return null;
  const [, h, mm, ss, frac] = m;
  const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + ms / 1000;
}

function normalise(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lrm: "",
  rlm: "",
};

/** Strips VTT/SRT markup (`<c>`, `<v Name>`, `<b>`, `<00:00:01.000>`, `{\an8}`) and decodes entities. */
export function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Parses the cue blocks of a VTT or SRT body. Both formats are "blocks separated
 * by blank lines, one of which has a `-->` timing line", so one reader serves
 * both; header, NOTE, STYLE and REGION blocks have no timing line and drop out.
 */
function parseBlocks(body: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of normalise(body).split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timingAt = lines.findIndex((l) => l.includes("-->"));
    if (timingAt === -1) continue;
    const first = lines[0].trim();
    if (first.startsWith("NOTE") || first === "STYLE" || first === "REGION") continue;
    const timing = TIMING_LINE.exec(lines[timingAt]);
    if (!timing) continue;
    const start = parseCueTime(timing[1]);
    const end = parseCueTime(timing[2]);
    if (start === null || end === null) continue;
    const text = cleanCueText(lines.slice(timingAt + 1).join("\n"));
    if (!text) continue;
    cues.push({ start, end: Math.max(start, end), text });
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function parseVtt(text: string): Cue[] {
  return parseBlocks(text);
}

export function parseSrt(text: string): Cue[] {
  return parseBlocks(text);
}

/** True when the body starts with the WebVTT signature (after an optional BOM). */
export function isVtt(text: string): boolean {
  return /^WEBVTT(?:[ \t\n]|$)/.test(normalise(text));
}

export function parseCaptions(text: string): Cue[] {
  return parseBlocks(text);
}

function vttTime(raw: string): string | null {
  const seconds = parseCueTime(raw);
  if (seconds === null) return null;
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * SubRip to WebVTT. Keeps cue text (and its basic `<i>`/`<b>` markup) as is,
 * drops the numeric counters, rewrites `00:00:01,000` timings and any trailing
 * SRT position hints. Input that is already WebVTT is returned normalised.
 */
export function srtToVtt(srt: string): string {
  const body = normalise(srt);
  if (isVtt(body)) return body.endsWith("\n") ? body : `${body}\n`;
  const out: string[] = ["WEBVTT", ""];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l, i, all) => !(i === all.length - 1 && l.trim() === ""));
    const timingAt = lines.findIndex((l) => l.includes("-->"));
    if (timingAt === -1) continue;
    const timing = TIMING_LINE.exec(lines[timingAt]);
    if (!timing) continue;
    const start = vttTime(timing[1]);
    const end = vttTime(timing[2]);
    if (!start || !end) continue;
    // A "-->" inside cue text would end the cue early in a VTT parser.
    const text = lines
      .slice(timingAt + 1)
      .map((l) => l.replace(/-->/g, "->").replace(/\{\\[^}]*\}/g, ""))
      .filter((l) => l.trim().length > 0);
    if (text.length === 0) continue;
    out.push(`${start} --> ${end}`, ...text, "");
  }
  return out.join("\n");
}

/**
 * Cues as the transcript panel lists them. YouTube auto-captions repeat the
 * previous cue's line as the first line of the next cue and add ~10 ms "bridge"
 * cues; listing those verbatim doubles every sentence. Lines already shown by
 * the previous cue are dropped, and cues left empty disappear.
 */
export function transcriptCues(cues: readonly Cue[]): Cue[] {
  const out: Cue[] = [];
  let previousLines: string[] = [];
  for (const cue of cues) {
    const lines = cue.text.split("\n");
    const fresh = lines.filter((line) => !previousLines.includes(line));
    previousLines = lines;
    const last = out[out.length - 1];
    if (fresh.length === 0) {
      if (last) last.end = Math.max(last.end, cue.end);
      continue;
    }
    const text = fresh.join(" ");
    if (last && last.text === text) {
      last.end = Math.max(last.end, cue.end);
      continue;
    }
    out.push({ start: cue.start, end: cue.end, text });
  }
  return out;
}

/**
 * Index of the cue to highlight at `time`: the last cue that has started. Between
 * two cues the earlier one stays highlighted, as on YouTube. -1 before the first.
 */
export function activeCueIndex(cues: readonly Cue[], time: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time + 0.05) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export interface TextMatch {
  start: number;
  end: number;
}

/** Case-insensitive, non-overlapping occurrences of `query` in `text`. Blank queries match nothing. */
export function findMatches(text: string, query: string): TextMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hay = text.toLowerCase();
  const out: TextMatch[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(q, from);
    if (at === -1) break;
    out.push({ start: at, end: at + q.length });
    from = at + q.length;
  }
  return out;
}

/** "1:05", "12:30", "1:02:03": the timestamp column of the transcript panel. */
export function formatCueTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
