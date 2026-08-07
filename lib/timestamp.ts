/**
 * Parsing and formatting for the `?t=` deep-link parameter on lesson pages.
 *
 * Accepts the three shapes people actually type, YouTube-style:
 *   plain seconds  90
 *   unit form      90s, 1m30s, 1h2m3s
 *   clock form     1:30, 1:02:30
 *
 * Anything else is null, and the caller falls back to saved progress.
 */

const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/;
const UNITS = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

export function parseTimestamp(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;

  const value = raw.trim().toLowerCase();
  if (!value) return null;

  if (/^\d+$/.test(value)) return Number(value);

  const clock = CLOCK.exec(value);
  if (clock) {
    const [, h, m, s] = clock;
    return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
  }

  const units = UNITS.exec(value);
  // UNITS matches the empty string too, so require at least one unit to be present
  if (units && (units[1] || units[2] || units[3])) {
    const [, h, m, s] = units;
    return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  }

  return null;
}

/**
 * An explicit `?t=` beats saved progress. A missing or unparseable one falls
 * through to wherever the viewer left off.
 */
export function resolveStartPosition(
  raw: string | string[] | undefined,
  savedPosition: number | null | undefined
): number {
  return parseTimestamp(raw) ?? savedPosition ?? 0;
}

/** Seconds to the `?t=` value the copy-link button emits. */
export function formatTimestampParam(seconds: number): string {
  return String(Math.max(0, Math.floor(seconds)));
}
