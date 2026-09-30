// Pure display helpers shared by the library, course, module and lesson pages.
// Every function is null-safe: a missing value returns null so the caller can
// hide the element instead of rendering "0m" or "NaN".

function validSeconds(seconds: number | null | undefined): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

// Long form for course and module totals: "12h 30m", "45m", "<1m".
export function formatDuration(seconds: number | null | undefined): string | null {
  const s = validSeconds(seconds);
  if (s === null) return null;
  const totalMinutes = Math.round(s / 60);
  if (totalMinutes < 1) return "<1m";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Clock form for a single lesson: "7:32", "1:02:05".
export function formatClock(seconds: number | null | undefined): string | null {
  const s = validSeconds(seconds);
  if (s === null) return null;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

// Whole hours for the library stats line, one decimal under ten hours.
export function formatHours(seconds: number | null | undefined): string | null {
  const s = validSeconds(seconds);
  if (s === null) return null;
  const h = s / 3600;
  if (h < 10) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(h)}h`;
}

// "just now", "5 minutes ago", "yesterday", "2 days ago", "3 weeks ago".
// `now` is passed in so the server render and the client hydration agree.
export function relativeTime(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, now - then) / 1000;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (diff < 60) return "just now";
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

// Strips an "Author - " (or en dash) prefix: "Dylan Ander - CRO Masterclass"
// becomes "CRO Masterclass". Titles without a prefix come back unchanged.
export function titleWithoutAuthor(title: string): string {
  const m = title.match(/^[^-\u2013\u2014]{2,40}?\s+[-\u2013\u2014]\s+(.+)$/);
  return m ? m[1].trim() : title.trim();
}

// Up to `max` initials from the significant words of the title after any
// author prefix. Brackets and punctuation are ignored.
export function courseInitials(title: string, max = 2): string {
  const words = titleWithoutAuthor(title)
    .replace(/[\[\](){}:,.!?'"]/g, " ")
    .split(/[\s\-\u2013\u2014_/]+/)
    .filter((w) => /[A-Za-z0-9]/.test(w));
  const initials = words.map((w) => (w.match(/[A-Za-z0-9]/)?.[0] ?? "").toUpperCase());
  return initials.slice(0, max).join("") || "?";
}

// 32-bit FNV-1a. Unlike a character-code sum, anagrams and near-identical
// slugs land far apart, so placeholder hues spread across the wheel.
export function stringHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche so short inputs still use the high bits.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

export function hueFor(input: string): number {
  return stringHash(input) % 360;
}

export function percent(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

// Sum of durations, or null unless every entry has a positive number, so a
// partly indexed module never shows a misleadingly short total.
export function sumDurations(values: readonly (number | null | undefined)[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    total += v;
  }
  return total;
}

interface Timed {
  duration_seconds?: number | null;
}

// A module's (category's) duration: the indexed total if present, else the sum
// of its lessons when all of them are known.
export function categoryDurationSeconds(category: Timed & { sections: { lessons: Timed[] }[] }): number | null {
  if (typeof category.duration_seconds === "number" && category.duration_seconds > 0) {
    return category.duration_seconds;
  }
  return sumDurations(category.sections.flatMap((s) => s.lessons.map((l) => l.duration_seconds)));
}

// Singular or plural noun for a count: plural(1, "lesson") is "1 lesson",
// plural(3, "lesson") is "3 lessons". Irregular plurals pass their own form.
// `countLabel` false returns the noun alone, for "4 of 12 files" style lines.
export function plural(
  n: number,
  singular: string,
  pluralForm: string = singular + "s",
  countLabel = true
): string {
  const word = n === 1 ? singular : pluralForm;
  return countLabel ? `${n.toLocaleString("en")} ${word}` : word;
}
