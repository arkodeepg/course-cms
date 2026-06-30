"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const VIDEO_EXTS = [".mp4", ".webm", ".mov"];
const AUDIO_EXTS = [".mp3", ".wav", ".m4a"];
const TEXT_EXTS = [".txt", ".csv"];

function kind(ext: string): "pdf" | "image" | "video" | "audio" | "csv" | "text" | "none" {
  if (ext === ".pdf") return "pdf";
  if (ext === ".csv") return "csv";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (TEXT_EXTS.includes(ext)) return "text";
  return "none";
}

function isViewable(ext: string): boolean {
  return kind(ext) !== "none";
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

  if (kind(item.ext) === "csv") {
    const rows = parseCsv(text);
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">Empty file.</p>;
    const [header, ...body] = rows;
    return (
      <div className="overflow-auto h-full w-full">
        <table className="text-[0.72rem] border-collapse w-full">
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
    <pre className="text-[0.72rem] leading-relaxed whitespace-pre-wrap break-words h-full w-full overflow-auto p-1">
      {text}
    </pre>
  );
}

function Viewer({ item }: { item: ResourceItem }) {
  const k = kind(item.ext);
  switch (k) {
    case "pdf":
      return <iframe src={item.href} className="w-full h-full border-0" title={item.name} />;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <div className="flex items-center justify-center h-full w-full overflow-auto">
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
    case "csv":
    case "text":
      return <TextPreview item={item} />;
    default:
      return <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>;
  }
}

function ViewerModal({ item, onClose }: { item: ResourceItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-background border border-border rounded-lg shadow-xl w-full max-w-5xl h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 shrink-0">
          <FileText className="h-4 w-4 shrink-0 text-[#e53e3e]" />
          <span className="flex-1 text-[0.8rem] font-medium truncate">{item.name}</span>
          <a
            href={item.downloadHref}
            className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-3 bg-secondary/10">
          <Viewer item={item} />
        </div>
      </div>
    </div>
  );
}

export function ResourceList({ groups }: { groups: ResourceGroupView[] }) {
  const [active, setActive] = useState<ResourceItem | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#e53e3e] mb-2">
            {group.label}
          </h2>
          <div className="flex flex-col gap-2">
            {group.items.map((item) => {
              const viewable = item.exists && isViewable(item.ext);
              return (
                <div
                  key={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2.5 transition-colors",
                    !item.exists && "opacity-50"
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-[#e53e3e]" />
                  <span className="flex-1 text-[0.78rem] font-medium text-foreground leading-snug">
                    {item.name}
                  </span>
                  {item.size && (
                    <span className="text-[0.62rem] tabular-nums text-muted-foreground shrink-0">
                      {item.size}
                    </span>
                  )}
                  {!item.exists ? (
                    <span className="text-[0.6rem] text-muted-foreground shrink-0">missing</span>
                  ) : (
                    <>
                      {viewable && (
                        <button
                          onClick={() => setActive(item)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      )}
                      <a
                        href={item.downloadHref}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                        aria-label={`Download ${item.name}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {active && <ViewerModal item={active} onClose={() => setActive(null)} />}
    </div>
  );
}
