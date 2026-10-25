/**
 * Picks a lesson's caption and transcript files out of its `resources[]`.
 *
 * Transcripts are ordinary resources in `_index.json` ({name, file}, file may be
 * a relative path such as "../x.vtt"), so detection is by extension, filename
 * and resource name. Pure, so it is unit tested and shared by the lesson page.
 *
 *   timed:   same-stem .vtt, then any .vtt, then same-stem .srt, then any .srt
 *   untimed: a .txt named "Transcript", or with "transcript" in its filename,
 *            or with the video's stem. Plenty of .txt resources are not
 *            transcripts (`*_description.txt`, "Group Buy.txt"), so nothing
 *            broader than that counts.
 */

import type { Resource } from "@/types/course";

export interface CaptionSources {
  /** A WebVTT or SubRip file, served through /api/captions as text/vtt. */
  timed: Resource | null;
  /** Plain transcript text without timings. */
  text: Resource | null;
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
}

function resourceFileName(resource: Resource): string {
  return baseName(resource.path ?? resource.file);
}

/**
 * Same stem as the video, allowing a language or flavour suffix after a dot:
 * `Lesson.mp4` matches `Lesson.vtt`, `Lesson.en.vtt`, `Lesson.en-auto.srt`.
 */
export function isSameStem(videoFile: string, resourceFile: string): boolean {
  const video = stemOf(baseName(videoFile));
  const res = stemOf(baseName(resourceFile));
  if (!video) return false;
  return res === video || res.startsWith(`${video}.`);
}

export function detectCaptionSources(lesson: {
  file: string;
  resources?: readonly Resource[] | null;
}): CaptionSources {
  const resources = lesson.resources ?? [];
  const withExt = (ext: string) => resources.filter((r) => extOf(resourceFileName(r)) === ext);
  const sameStem = (r: Resource) => isSameStem(lesson.file, resourceFileName(r));

  const vtt = withExt(".vtt");
  const srt = withExt(".srt");
  const timed = vtt.find(sameStem) ?? vtt[0] ?? srt.find(sameStem) ?? srt[0] ?? null;

  const txt = withExt(".txt");
  const text =
    txt.find((r) => r.name.trim().toLowerCase() === "transcript") ??
    txt.find((r) => resourceFileName(r).toLowerCase().includes("transcript")) ??
    txt.find(sameStem) ??
    null;

  return { timed, text };
}
