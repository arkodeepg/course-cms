/**
 * The command contract between the command palette and the lesson player.
 * The palette dispatches `window.dispatchEvent(new CustomEvent(CMS_COMMAND_EVENT,
 * { detail: { id } }))`; VideoPlayer (video lessons) and LessonToolbar (article,
 * document and unplayable lessons) listen for it.
 *
 * `speed:<number>` accepts any positive number; the listed entries are the
 * player's speed ladder. `seek:+N` / `seek:-N` accept any number of seconds.
 * `seek-to:N` seeks to an absolute position in seconds (the transcript panel
 * uses it); it is not listed in the palette because it needs a value.
 *
 * The player in turn broadcasts its position as CMS_PLAYER_TIME_EVENT on every
 * timeupdate and seek, so the transcript panel can follow along.
 */

import { PLAYBACK_SPEEDS } from "@/lib/playback";

export const CMS_COMMAND_EVENT = "cms:command";
export const CMS_PLAYER_TIME_EVENT = "cms:player-time";

export type PlayerTimeDetail = { time: number; videoSrc: string };

export interface PlayerCommand {
  id: string;
  label: string;
  hint: string;
}

export const PLAYER_COMMANDS: PlayerCommand[] = [
  { id: "play-toggle", label: "Play / pause", hint: "Space or K" },
  { id: "next", label: "Next lesson", hint: "N" },
  { id: "prev", label: "Previous lesson", hint: "P" },
  { id: "mark-complete", label: "Mark lesson complete", hint: "" },
  { id: "copy-timestamp", label: "Copy link at current time", hint: "" },
  { id: "fullscreen", label: "Toggle fullscreen", hint: "F" },
  { id: "pip", label: "Toggle picture-in-picture", hint: "" },
  { id: "captions-toggle", label: "Toggle captions", hint: "C" },
  { id: "seek:+10", label: "Forward 10 seconds", hint: "L" },
  { id: "seek:-10", label: "Back 10 seconds", hint: "J" },
  ...PLAYBACK_SPEEDS.map((s) => ({ id: `speed:${s}`, label: `Playback speed ${s}x`, hint: "> or <" })),
];

export type CmsCommandDetail = { id: string };

export function dispatchCmsCommand(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CmsCommandDetail>(CMS_COMMAND_EVENT, { detail: { id } }));
}

/** Command id for an absolute seek; null for a non-finite or negative time. */
export function seekToCommandId(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return `seek-to:${Math.round(seconds * 1000) / 1000}`;
}

/** Parses a `seek-to:N` id; null when the id is something else or N is invalid. */
export function parseSeekTo(id: string): number | null {
  if (!id.startsWith("seek-to:")) return null;
  const raw = id.slice(8).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** True when a key event should be left alone: typing in a field, or a modifier chord. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    // Sliders and buttons keep focus after a click; shortcuts should still work there.
    return !["range", "checkbox", "radio", "button", "submit", "reset"].includes(type);
  }
  return false;
}
