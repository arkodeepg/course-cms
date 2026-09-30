"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Compass,
  CornerDownLeft,
  Download,
  FileText,
  History,
  Keyboard,
  PlayCircle,
  Search,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LIBRARY_VIEW_EVENT,
  LIBRARY_VIEW_STORAGE_KEY,
  PALETTE_OPEN_EVENT,
  PLAYER_COMMAND_IDS,
  PLAYER_SHORTCUTS,
  dispatchPlayerCommand,
  prepareIndex,
  search,
  type PaletteIndex,
  type PaletteItem,
  type PlayerCommandId,
  type PreparedIndex,
  type ResultGroup,
} from "@/lib/palette";

// ---------------------------------------------------------------------------
// Index cache: fetched once per page load (prefetched on idle), kept in module
// memory, and revalidated in the background when older than a minute.

let cached: PreparedIndex | null = null;
let cachedAt = 0;
let inflight: Promise<PreparedIndex | null> | null = null;

function loadIndex(force = false): Promise<PreparedIndex | null> {
  if (inflight) return inflight;
  if (cached && !force && Date.now() - cachedAt < 60_000) return Promise.resolve(cached);
  inflight = fetch("/api/palette")
    .then((r) => (r.ok ? (r.json() as Promise<PaletteIndex>) : null))
    .then((raw) => {
      if (raw) {
        cached = prepareIndex(raw);
        cachedAt = Date.now();
      }
      return cached;
    })
    .catch(() => cached)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// ---------------------------------------------------------------------------
// Recent picks (localStorage, best effort)

const RECENT_KEY = "coursevault-palette-recent";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeRecent(key: string): string[] {
  const next = [key, ...readRecent().filter((k) => k !== key)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
  return next;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const ICONS = {
  course: BookOpen,
  lesson: PlayCircle,
  resource: FileText,
  page: Compass,
  action: Zap,
  search: Search,
} as const;

// ---------------------------------------------------------------------------

export function CommandPalette() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<PreparedIndex | null>(cached);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [help, setHelp] = useState(false);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Visible viewport while open, so the on-screen keyboard never hides results.
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setViewport(null);
    };
  }, [open]);

  const openPalette = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIdx(0);
    setHelp(false);
    setRecentKeys(readRecent());
    setOpen(true);
    if (!cached) setLoading(true);
    loadIndex().then((p) => {
      setIndex(p);
      setLoading(false);
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setHelp(false);
    const el = returnFocus.current;
    returnFocus.current = null;
    // Wait for the dialog to unmount before moving focus back.
    requestAnimationFrame(() => {
      if (el && el.isConnected) el.focus();
    });
  }, []);

  // Prefetch the index once the page is idle.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const run = () => {
      loadIndex().then((p) => p && setIndex(p));
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);

  // Global shortcuts: Cmd/Ctrl+K toggles, "/" opens outside fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (
        !open &&
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditable(e.target) &&
        !isEditable(document.activeElement)
      ) {
        e.preventDefault();
        openPalette();
      }
    }
    function onOpenEvent() {
      openPalette();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpenEvent);
    };
  }, [open, openPalette, close]);

  // Lock page scroll and focus the input while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus trap: anything that pulls focus out of the dialog sends it back.
  useEffect(() => {
    if (!open) return;
    function onFocusIn(e: FocusEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        inputRef.current?.focus();
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  // Close on route change (after navigating from a row).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const groups: ResultGroup[] = useMemo(
    () => (open ? search(index, query, { pathname, recentKeys }) : []),
    [open, index, query, pathname, recentKeys]
  );

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let n = 0;
    for (const g of groups) {
      starts.push(n);
      n += g.items.length;
    }
    return starts;
  }, [groups]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const active = Math.min(activeIdx, Math.max(0, flat.length - 1));
  const activeItem = flat[active];
  const optionId = (i: number) => `cmdk-opt-${i}`;

  // Keep the active row visible.
  useEffect(() => {
    if (!open || help) return;
    const el = document.getElementById(optionId(active));
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, help]);

  function runAction(item: PaletteItem) {
    const id = item.action!;
    if ((PLAYER_COMMAND_IDS as readonly string[]).includes(id)) {
      // Dispatch inside the user gesture so fullscreen and PiP are allowed.
      dispatchPlayerCommand(id as PlayerCommandId);
      close();
      return;
    }
    if (id === "shortcuts") {
      setHelp(true);
      setQuery("");
      requestAnimationFrame(() => backRef.current?.focus());
      return;
    }
    if (id === "resume") {
      close();
      if (item.href) router.push(item.href);
      return;
    }
    if (id === "toggle-view") {
      close();
      if (pathname === "/") {
        window.dispatchEvent(new CustomEvent(LIBRARY_VIEW_EVENT, { detail: "toggle" }));
      } else {
        try {
          const cur = localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY);
          localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, cur === "grid" ? "list" : "grid");
        } catch {
          // storage unavailable
        }
        router.push("/");
      }
    }
  }

  function pick(item: PaletteItem | undefined, newTab: boolean) {
    if (!item) return;
    if (item.kind !== "search") setRecentKeys(writeRecent(item.key));
    if (item.action && !(item.action === "resume" && newTab)) {
      runAction(item);
      return;
    }
    if (!item.href) return;
    if (newTab) {
      window.open(item.href, "_blank", "noopener");
      close();
      return;
    }
    if (item.download) {
      close();
      window.location.href = item.href;
      return;
    }
    close();
    router.push(item.href);
  }

  function jumpGroup(dir: 1 | -1) {
    if (groups.length === 0) return;
    let g = 0;
    for (let i = 0; i < groupStarts.length; i++) if (groupStarts[i] <= active) g = i;
    const next = (g + dir + groups.length) % groups.length;
    setActiveIdx(groupStarts[next]);
  }

  function onDialogKeyDown(e: React.KeyboardEvent) {
    // Keep keys from reaching page-level handlers (player shortcuts).
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (help) {
        // Trap focus between the input and the back button.
        if (document.activeElement === inputRef.current) backRef.current?.focus();
        else inputRef.current?.focus();
        return;
      }
      jumpGroup(e.shiftKey ? -1 : 1);
      return;
    }
    if (help) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setActiveIdx((active + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setActiveIdx((active - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      pick(activeItem, e.metaKey || e.ctrlKey);
    }
  }

  if (!open) return null;

  const expanded = !help && flat.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-3 pt-3 pb-3 sm:pb-0 sm:pt-[14vh]"
      style={viewport ? { top: viewport.top, height: viewport.height, bottom: "auto" } : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onDialogKeyDown}
        onMouseDown={(e) => {
          // Clicking empty space would blur the input and lose the key handling.
          if (!(e.target as HTMLElement).closest("input, button")) e.preventDefault();
        }}
        className="flex w-full max-w-xl max-h-full sm:max-h-[75vh] flex-col overflow-hidden rounded-lg border border-border bg-surface-toolbar shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={expanded}
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={expanded ? optionId(active) : undefined}
            aria-label="Search courses, lessons, pages and actions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (help) setHelp(false);
            }}
            placeholder="Search courses, lessons, resources, pages, actions…"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-3 text-base sm:fine:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="-mr-1 inline-flex sm:fine:hidden h-11 shrink-0 items-center rounded-md px-2 text-sm font-medium text-brand hover:bg-secondary"
          >
            Cancel
          </button>
          <kbd className="hidden sm:inline rounded border border-border bg-surface-field px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
            Esc
          </kbd>
        </div>

        {help ? (
          <div className="flex-1 overflow-y-auto overscroll-contain p-3">
            <div className="mb-2 flex items-center gap-2">
              <button
                ref={backRef}
                type="button"
                onClick={() => {
                  setHelp(false);
                  inputRef.current?.focus();
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 coarse:min-h-10 coarse:px-2.5 text-[0.7rem] text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                Player keyboard shortcuts
              </span>
            </div>
            <ul className="divide-y divide-border/50 rounded-md border border-border">
              {PLAYER_SHORTCUTS.map(([keys, what]) => (
                <li key={keys} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-[0.78rem] text-foreground">{what}</span>
                  <kbd className="shrink-0 rounded border border-border bg-surface-field px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div
            ref={listRef}
            id="cmdk-listbox"
            role="listbox"
            aria-label="Results"
            className="flex-1 overflow-y-auto overscroll-contain py-1"
          >
            {loading && !index && (
              <p className="px-4 py-6 text-center text-[0.75rem] text-muted-foreground">Loading index…</p>
            )}
            {!loading && flat.length === 0 && (
              <p className="px-4 py-6 text-center text-[0.75rem] text-muted-foreground">No matches.</p>
            )}
            {groups.map((g, gi) => (
              <div key={g.id} role="group" aria-labelledby={`cmdk-group-${g.id}`} className="py-1">
                <div
                  id={`cmdk-group-${g.id}`}
                  className="flex items-center gap-1.5 px-4 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {g.id === "recent" && <History className="h-3 w-3" aria-hidden />}
                  {g.label}
                </div>
                {g.items.map((item, ii) => {
                  const i = groupStarts[gi] + ii;
                  const selected = i === active;
                  const Icon =
                    item.action === "shortcuts"
                      ? Keyboard
                      : item.download
                        ? Download
                        : ICONS[item.kind];
                  return (
                    <div
                      key={`${g.id}:${item.key}`}
                      id={optionId(i)}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => {
                        if (!selected) setActiveIdx(i);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => pick(item, e.metaKey || e.ctrlKey)}
                      className={cn(
                        "mx-1.5 flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 coarse:min-h-11",
                        selected
                          ? "bg-secondary text-foreground ring-1 ring-inset ring-brand/60"
                          : "text-foreground/90"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected ? "text-brand" : "text-muted-foreground"
                        )}
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[0.8rem] font-medium leading-snug">{item.title}</span>
                        {item.subtitle && (
                          <span className="truncate text-[0.65rem] text-muted-foreground">{item.subtitle}</span>
                        )}
                      </span>
                      {item.hint && (
                        <kbd className="shrink-0 rounded border border-border bg-surface-field px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                          {item.hint}
                        </kbd>
                      )}
                      {selected && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="hidden sm:flex items-center gap-4 border-t border-border px-3 py-2 text-[0.65rem] text-muted-foreground">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span><Kbd>Enter</Kbd> open</span>
          <span><Kbd>Ctrl/⌘ Enter</Kbd> new tab</span>
          <span><Kbd>Tab</Kbd> next group</span>
          <span className="ml-auto"><Kbd>Esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-1 rounded border border-border bg-surface-field px-1 py-px text-[0.65rem]">{children}</kbd>
  );
}
