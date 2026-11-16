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
  | "link"
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

// Pseudo extension the resources page gives an external link item, so the
// ext-keyed kind helpers (filter chips, icons) classify it as "link".
export const LINK_EXT = "link:";

// `ext` is lowercase with a leading dot; anything else is normalised first.
export function kind(ext: string): ResourceKind {
  const e = ext.trim().toLowerCase();
  if (e === LINK_EXT) return "link";
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
  link: "Link",
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

// The URL of an external link resource, or null unless it is absolute http(s).
// Anything else (javascript:, data:, relative paths) is never rendered as a link.
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// A resource that is an external link rather than a file on disk.
export function isLinkResource(r: { url?: string; file?: string; path?: string }): boolean {
  return !r.file && !r.path && !!r.url;
}

export type LinkFlavor = "sheet" | "doc" | "slides" | "form" | "generic";

// Which icon an external link gets: Google Sheets, Docs, Slides and Forms look
// like their file kinds, everything else is a plain link.
export function linkFlavor(url: string): LinkFlavor {
  let host = "";
  let p = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    p = u.pathname;
  } catch {
    return "generic";
  }
  if (host === "docs.google.com") {
    if (p.startsWith("/spreadsheets")) return "sheet";
    if (p.startsWith("/document")) return "doc";
    if (p.startsWith("/presentation")) return "slides";
    if (p.startsWith("/forms")) return "form";
  }
  if (host === "forms.gle") return "form";
  if (host === "airtable.com" || host.endsWith(".airtable.com")) return "sheet";
  return "generic";
}
