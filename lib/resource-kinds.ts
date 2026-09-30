// File-kind classification for course resources. Pure so it is unit tested and
// shared by the resources page viewer and its filter chips.

export type ResourceKind =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "csv"
  | "text"
  | "markdown"
  | "json"
  | "subtitle"
  | "doc"
  | "sheet"
  | "slides"
  | "archive"
  | "ebook"
  | "none";

const EXT_KIND: Record<string, ResourceKind> = {
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".svg": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".csv": "csv",
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
  ".json": "json",
  ".srt": "subtitle",
  ".vtt": "subtitle",
  ".docx": "doc",
  ".doc": "doc",
  ".xlsx": "sheet",
  ".xls": "sheet",
  ".pptx": "slides",
  ".ppt": "slides",
  ".zip": "archive",
  ".epub": "ebook",
};

// `ext` is lowercase with a leading dot; anything else is normalised first.
export function kind(ext: string): ResourceKind {
  const e = ext.trim().toLowerCase();
  const withDot = e.startsWith(".") ? e : `.${e}`;
  return EXT_KIND[withDot] ?? "none";
}

export const KIND_LABEL: Record<ResourceKind, string> = {
  pdf: "PDF",
  image: "Image",
  video: "Video",
  audio: "Audio",
  csv: "CSV",
  text: "Text",
  markdown: "Markdown",
  json: "JSON",
  subtitle: "Subtitles",
  doc: "Word",
  sheet: "Excel",
  slides: "PowerPoint",
  archive: "Archive",
  ebook: "eBook",
  none: "Other",
};

// Kinds with an in-browser viewer. Office files, archives and ebooks download.
const VIEWABLE: ReadonlySet<ResourceKind> = new Set<ResourceKind>([
  "pdf",
  "image",
  "video",
  "audio",
  "csv",
  "text",
  "markdown",
  "json",
  "subtitle",
]);

export function isViewableKind(k: ResourceKind): boolean {
  return VIEWABLE.has(k);
}

export function isViewable(ext: string): boolean {
  return isViewableKind(kind(ext));
}

// Office documents get an "Open in Office" download label instead of a viewer.
export function isOfficeKind(k: ResourceKind): boolean {
  return k === "doc" || k === "sheet" || k === "slides";
}

// Plain-text kinds fetched and shown as text (markdown is rendered instead).
export function isPlainTextKind(k: ResourceKind): boolean {
  return k === "text" || k === "json" || k === "subtitle";
}

// Counts per kind across items, in first-seen order, for the filter chips.
export function kindCounts(exts: readonly string[]): { kind: ResourceKind; count: number }[] {
  const counts = new Map<ResourceKind, number>();
  for (const e of exts) {
    const k = kind(e);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, count]) => ({ kind: k, count }));
}
