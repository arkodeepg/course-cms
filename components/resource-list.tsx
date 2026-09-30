"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  Captions,
  ChevronRight,
  ExternalLink,
  Download,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KIND_LABEL,
  ResourceKind,
  isOfficeKind,
  isPlainTextKind,
  isViewable,
  kind,
  kindCounts,
} from "@/lib/resource-kinds";
import { LessonArticle } from "@/components/lesson-article";
import { plural } from "@/lib/format";
import { isGroupOpen, nextToggle, type GroupToggle } from "@/lib/resource-groups";
import { HANDHELD_QUERY, useMediaQuery } from "@/lib/use-media-query";

export interface ResourceItem {
  name: string;
  href: string; // inline view URL
  downloadHref: string; // forced-download URL
  ext: string; // lowercase, with leading dot
  size: string;
  exists: boolean;
}

export interface ResourceGroupView {
  label: string;
  items: ResourceItem[];
}

const KIND_ICON: Record<ResourceKind, { Icon: LucideIcon; color: string }> = {
  pdf: { Icon: FileText, color: "text-red-400" },
  image: { Icon: FileImage, color: "text-sky-400" },
  video: { Icon: FileVideo, color: "text-violet-400" },
  audio: { Icon: FileAudio, color: "text-pink-400" },
  csv: { Icon: FileSpreadsheet, color: "text-emerald-400" },
  text: { Icon: FileText, color: "text-slate-300" },
  markdown: { Icon: FileType, color: "text-teal-300" },
  json: { Icon: FileJson, color: "text-yellow-300" },
  subtitle: { Icon: Captions, color: "text-cyan-300" },
  doc: { Icon: FileText, color: "text-blue-400" },
  sheet: { Icon: FileSpreadsheet, color: "text-green-500" },
  slides: { Icon: Presentation, color: "text-orange-400" },
  archive: { Icon: FileArchive, color: "text-amber-400" },
  ebook: { Icon: BookOpen, color: "text-indigo-300" },
  none: { Icon: File, color: "text-muted-foreground" },
};

function KindIcon({ ext, className = "h-4 w-4" }: { ext: string; className?: string }) {
  const { Icon, color } = KIND_ICON[kind(ext)];
  return <Icon className={cn(className, "shrink-0", color)} aria-hidden="true" />;
}

// Minimal CSV parser handling quoted fields and embedded commas/newlines.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function TextPreview({ item }: { item: ResourceItem }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(item.href)
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.text();
      })
      .then((t) => {
        if (active) setText(t);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [item.href]);

  if (error) return <p className="text-sm text-muted-foreground">Could not load file.</p>;
  if (text === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const k = kind(item.ext);

  if (k === "markdown") {
    return (
      <div className="resource-md h-full w-full overflow-auto px-2 py-1" data-testid="markdown-preview">
        <LessonArticle markdown={text} />
      </div>
    );
  }

  if (k === "csv") {
    const rows = parseCsv(text);
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">Empty file.</p>;
    const [header, ...body] = rows;
    return (
      <div className="overflow-auto h-full w-full">
        <table className="text-[0.8125rem] sm:text-[0.72rem] border-collapse w-full">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="sticky top-0 bg-secondary text-left font-semibold px-2 py-1.5 border border-border whitespace-nowrap"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri} className={ri % 2 ? "bg-secondary/20" : ""}>
                {r.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 border border-border align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="text-[0.8125rem] sm:text-[0.72rem] leading-relaxed whitespace-pre-wrap break-words h-full w-full overflow-auto p-1">
      {k === "json" ? prettyJson(text) : text}
    </pre>
  );
}

// Phones get buttons instead of an inline PDF: Android Chrome cannot render one
// in an iframe and iOS shows only the first page. The viewer only ever mounts
// after a tap (or the ?view= effect), never in the server render, so reading
// matchMedia here cannot cause a hydration mismatch.
function isHandheld(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(HANDHELD_QUERY).matches;
}

function PdfViewer({ item }: { item: ResourceItem }) {
  const [handheld] = useState(isHandheld);
  if (!handheld) return <iframe src={item.href} className="w-full h-full border-0" title={item.name} />;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-4 text-center" data-testid="pdf-handheld">
      <FileText className="h-10 w-10 text-red-400" aria-hidden="true" />
      <p className="max-w-xs text-sm text-muted-foreground">
        Open the PDF in your phone&apos;s viewer to read every page, or save it.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open PDF
        </a>
        <a
          href={item.downloadHref}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download
        </a>
      </div>
    </div>
  );
}

function Viewer({ item }: { item: ResourceItem }) {
  const k = kind(item.ext);
  if (k === "csv" || k === "markdown" || isPlainTextKind(k)) return <TextPreview item={item} />;
  switch (k) {
    case "pdf":
      return <PdfViewer item={item} />;
    case "image":
      return (
        <div className="flex items-center justify-center h-full w-full overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.href} alt={item.name} className="max-w-full max-h-full object-contain" />
        </div>
      );
    case "video":
      return (
        <div className="flex items-center justify-center h-full w-full bg-black">
          <video src={item.href} controls className="max-w-full max-h-full" />
        </div>
      );
    case "audio":
      return (
        <div className="flex items-center justify-center h-full w-full">
          <audio src={item.href} controls className="w-full max-w-lg" />
        </div>
      );
    default:
      return <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>;
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])';

function ViewerModal({
  item,
  onClose,
  returnTo,
}: {
  item: ResourceItem;
  onClose: () => void;
  /** Element to refocus on close (iOS does not focus a tapped button). */
  returnTo?: HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus the close button on open and hand focus back on close. Lock scroll
  // on both <html> and <body>: iOS Safari ignores overflow on body alone.
  useEffect(() => {
    const opener =
      returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Keep Tab inside the dialog.
      const els = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0
      );
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
    // Open once per item; `returnTo` is fixed for the modal's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        ref={dialogRef}
        className="flex flex-col bg-background border border-border rounded-lg shadow-xl w-full max-w-5xl h-[88dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 coarse:gap-2 border-b border-border px-4 coarse:pl-4 coarse:pr-1.5 py-2.5 coarse:py-1 shrink-0">
          <KindIcon ext={item.ext} />
          <span className="flex-1 min-w-0 text-sm sm:text-[0.8rem] font-medium truncate" title={item.name}>
            {item.name}
          </span>
          <a
            href={item.downloadHref}
            aria-label={`Download ${item.name}`}
            className="inline-flex items-center justify-center gap-1 rounded-md text-[0.7rem] coarse:text-xs text-muted-foreground hover:text-foreground transition-colors coarse:h-11 coarse:min-w-11 coarse:px-2"
          >
            <Download className="h-3.5 w-3.5 coarse:h-4 coarse:w-4" />
            <span className="max-[380px]:sr-only">Download</span>
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 w-7 coarse:h-11 coarse:w-11 rounded-md hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4 coarse:h-5 coarse:w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-3 bg-secondary/10">
          <Viewer item={item} />
        </div>
      </div>
    </div>
  );
}

// Decoded on-disk path behind an /api/resource href.
function hrefPath(href: string): string {
  try {
    return href
      .replace(/^\/api\/resource/, "")
      .split("/")
      .map((s) => decodeURIComponent(s))
      .join("/");
  } catch {
    return "";
  }
}

// `?view=<course-relative path>` opens that item's viewer on arrival (used by
// the command palette).
function findViewTarget(groups: ResourceGroupView[], view: string): ResourceItem | null {
  const wanted = "/" + view.replace(/^\/+/, "");
  for (const group of groups) {
    for (const item of group.items) {
      if (!item.exists || !item.href || !isViewable(item.ext)) continue;
      if (hrefPath(item.href).endsWith(wanted)) return item;
    }
  }
  return null;
}

function noopSubscribe() {
  return () => {};
}

export function ResourceList({ groups }: { groups: ResourceGroupView[] }) {
  const [active, setActive] = useState<ResourceItem | null>(null);
  const [fromUrl, setFromUrl] = useState(false);
  const [kindFilter, setKindFilter] = useState<ResourceKind | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  // Header taps, remembered per filter: a new filter starts from the defaults,
  // which open every matching group.
  const [toggleState, setToggleState] = useState<{ key: string; map: Record<string, GroupToggle> }>({
    key: "",
    map: {},
  });
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  // Phones start with only the first group open. Before mount `compact` and
  // `mounted` are false, so the server render opens everything and CSS
  // (max-sm:hidden) hides the other groups on phones until React takes over;
  // no hydration mismatch.
  const compact = useMediaQuery(HANDHELD_QUERY);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (!view) return;
    const target = findViewTarget(groups, view);
    if (target) {
      setActive(target);
      setFromUrl(true);
    }
  }, [groups]);

  function closeViewer() {
    setActive(null);
    if (fromUrl) {
      // Drop ?view= so a refresh does not reopen the viewer.
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      setFromUrl(false);
    }
  }

  const chips = useMemo(
    () => kindCounts(groups.flatMap((g) => g.items.map((i) => i.ext))),
    [groups]
  );
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);

  const q = nameFilter.trim().toLowerCase();
  const filtering = kindFilter !== null || q !== "";

  const filterKey = `${kindFilter ?? ""}|${q}`;
  const toggles = toggleState.key === filterKey ? toggleState.map : {};
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (kindFilter === null || kind(i.ext) === kindFilter) &&
          (!q || i.name.toLowerCase().includes(q))
      ),
    }))
    .filter((g) => g.items.length > 0);
  const visibleCount = visibleGroups.reduce((n, g) => n + g.items.length, 0);

  const chipClass = (on: boolean) =>
    cn(
      "inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border h-9 px-3 text-xs coarse:h-10 sm:fine:h-auto sm:fine:px-2.5 sm:fine:py-1 sm:fine:text-[0.68rem] font-medium transition-colors",
      on
        ? "border-brand/60 bg-brand/15 text-foreground"
        : "border-border bg-secondary/20 text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="flex flex-col gap-6 coarse:gap-3">
      <div className="flex flex-col gap-3">
        <div className="relative sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 sm:fine:left-2 top-1/2 -translate-y-1/2 h-4 w-4 sm:fine:h-3.5 sm:fine:w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by name"
            aria-label="Filter resources by name"
            className="w-full rounded-md border border-border bg-surface-field/60 py-1.5 coarse:h-11 pl-9 sm:fine:pl-7 pr-2 text-base sm:fine:text-xs text-foreground placeholder:text-muted-foreground"
          />
        </div>
        {chips.length > 1 && (
          // Phones: one swipeable row of chips instead of four wrapped lines.
          <div
            className="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-px-4 scrollbar-none sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:fine:gap-1.5"
            role="group"
            aria-label="Filter by file type"
          >
            <button
              type="button"
              aria-pressed={kindFilter === null}
              onClick={() => setKindFilter(null)}
              className={chipClass(kindFilter === null)}
            >
              All <span className="tabular-nums opacity-70">{totalItems}</span>
            </button>
            {chips.map(({ kind: k, count }) => {
              const { Icon, color } = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kindFilter === k}
                  onClick={() => setKindFilter(kindFilter === k ? null : k)}
                  className={chipClass(kindFilter === k)}
                >
                  <Icon className={cn("h-3.5 w-3.5 sm:fine:h-3 sm:fine:w-3", color)} aria-hidden="true" />
                  {KIND_LABEL[k]} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {(kindFilter !== null || q) && (
          <p className="text-xs sm:fine:text-[0.68rem] text-muted-foreground" aria-live="polite">
            {visibleCount} of {plural(totalItems, "file")}
          </p>
        )}
      </div>

      {visibleGroups.length === 0 && (
        <p className="text-[0.8rem] text-muted-foreground">No resources match.</p>
      )}

      {visibleGroups.map((group, pos) => {
        const toggle = toggles[group.label];
        const open = isGroupOpen(toggle, pos, { compact, filtering });
        // Before mount, a default-closed group is only hidden on phones by CSS.
        const cssOnlyClosed = !mounted && !toggle && !filtering && pos > 0;
        const bodyId = `resource-group-${pos}`;
        return (
        <section key={group.label} data-group-open={open ? "true" : "false"}>
          <h2 className="mb-2 coarse:mb-1">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() =>
                setToggleState({ key: filterKey, map: { ...toggles, [group.label]: nextToggle(open) } })
              }
              className="group/h flex w-full items-center gap-1.5 rounded text-left text-[0.7rem] coarse:text-xs font-semibold uppercase tracking-wide text-brand coarse:min-h-11 hover:text-brand-hover"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-90",
                  cssOnlyClosed && "max-sm:rotate-0 coarse:rotate-0"
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 break-words">
                {group.label}{" "}
                <span className="text-muted-foreground font-normal tabular-nums">· {group.items.length}</span>
              </span>
            </button>
          </h2>
          {(open || !mounted) && (
          <div id={bodyId} className={cn("flex flex-col gap-2", cssOnlyClosed && "max-sm:hidden coarse:hidden")}>
            {group.items.map((item) => {
              const k = kind(item.ext);
              const viewable = item.exists && isViewable(item.ext);
              const office = isOfficeKind(k);
              return (
                <div
                  key={item.href || item.name}
                  data-kind={k}
                  className={cn(
                    "flex items-center gap-3 coarse:gap-2 rounded-md border border-border bg-secondary/20 px-3 coarse:pr-1.5 py-2.5 coarse:py-1.5 transition-colors",
                    !item.exists && "opacity-50"
                  )}
                >
                  <KindIcon ext={item.ext} />
                  <span className="flex-1 min-w-0 text-[0.78rem] coarse:text-[0.8125rem] font-medium text-foreground leading-snug [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                  <span className="hidden sm:inline text-[0.65rem] uppercase tracking-wide text-muted-foreground shrink-0">
                    {KIND_LABEL[k]}
                  </span>
                  {item.size && (
                    <span className="text-[0.65rem] tabular-nums text-muted-foreground shrink-0">
                      {item.size}
                    </span>
                  )}
                  {!item.exists ? (
                    <span className="text-[0.65rem] text-muted-foreground shrink-0">missing</span>
                  ) : (
                    <>
                      {viewable && (
                        <button
                          type="button"
                          onClick={(e) => {
                            setOpener(e.currentTarget);
                            setActive(item);
                          }}
                          className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 coarse:h-10 coarse:min-w-11 coarse:px-2.5 text-[0.68rem] coarse:text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      )}
                      {office && (
                        <a
                          href={item.downloadHref}
                          download
                          title="Downloads the file to open in Word, Excel, PowerPoint or a compatible app"
                          className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 coarse:h-10 coarse:px-2.5 text-[0.68rem] coarse:text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Open in Office
                        </a>
                      )}
                      {!office && (
                        <a
                          href={item.downloadHref}
                          className="inline-flex items-center justify-center h-7 w-7 coarse:h-10 coarse:w-10 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                          aria-label={`Download ${item.name}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </section>
        );
      })}
      {active && <ViewerModal item={active} onClose={closeViewer} returnTo={opener} />}
    </div>
  );
}
