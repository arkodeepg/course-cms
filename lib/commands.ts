/**
 * The command contract between the command palette and the lesson player.
 * The palette dispatches `window.dispatchEvent(new CustomEvent(CMS_COMMAND_EVENT,
 * { detail: { id } }))`; VideoPlayer (video lessons) and LessonToolbar (article,
 * document and unplayable lessons) listen for it.
 *
 * `speed:<number>` accepts any positive number; the listed entries are the
 * player's speed ladder. `seek:+N` / `seek:-N` accept any number of seconds.
 */

import { PLAYBACK_SPEEDS } from "@/lib/playback";

export const CMS_COMMAND_EVENT = "cms:command";

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
  { id: "seek:+10", label: "Forward 10 seconds", hint: "L" },
  { id: "seek:-10", label: "Back 10 seconds", hint: "J" },
  ...PLAYBACK_SPEEDS.map((s) => ({ id: `speed:${s}`, label: `Playback speed ${s}x`, hint: "> or <" })),
];

export type CmsCommandDetail = { id: string };

export function dispatchCmsCommand(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CmsCommandDetail>(CMS_COMMAND_EVENT, { detail: { id } }));
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
