"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ChevronLeft } from "lucide-react";

interface SearchHit {
  courseId: string;
  categoryName: string;
  moduleIndex: number;
  lessonIndex: number;
  lessonTitle: string;
  lessonFile: string;
}

interface NavProps {
  breadcrumb?: { label: string; href: string };
}

export function Nav({ breadcrumb }: NavProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K focuses the search bar; Escape closes the dropdown
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside the input + panel closes the dropdown
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !inputRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const fetchResults = useCallback((q: string) => {
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data: SearchHit[]) => {
        setHits(data.slice(0, 8));
        setOpen(true);
      })
      .catch(() => {});
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length >= 2) {
      debounceRef.current = setTimeout(() => fetchResults(q.trim()), 250);
    } else {
      setHits([]);
      setOpen(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function pickResult(href: string) {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[#16181f]">
      <div className="flex items-center gap-4 px-6 py-3">
        <Link href="/" className="text-sm font-bold tracking-wide text-white shrink-0">
          CourseVault
        </Link>

        {breadcrumb && (
          <Link
            href={breadcrumb.href}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="h-3 w-3" />
            {breadcrumb.label}
          </Link>
        )}

        <form onSubmit={handleSubmit} className="flex-1 max-w-sm ml-auto relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={handleChange}
              onFocus={() => {
                if (hits.length > 0) setOpen(true);
              }}
              placeholder="Search lessons… (⌘K)"
              className="w-full rounded-md border border-border bg-[#252532] py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {open && hits.length > 0 && (
            <div
              ref={panelRef}
              className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-lg border border-border bg-[#1a1c26] shadow-2xl overflow-hidden"
            >
              {hits.map((r) => {
                const href = `/course/${r.courseId}/${r.moduleIndex}/${r.lessonIndex}`;
                const courseName = r.courseId
                  .split("-")
                  .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
                  .join(" ");
                return (
                  <button
                    key={r.lessonFile}
                    type="button"
                    onClick={() => pickResult(href)}
                    className="w-full flex flex-col items-start px-3 py-2.5 hover:bg-secondary/50 transition-colors border-b border-border/40 last:border-0 text-left"
                  >
                    <span className="text-[0.8rem] font-medium text-foreground leading-snug">
                      {r.lessonTitle}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground mt-0.5">
                      {courseName} · {r.categoryName}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/search?q=${encodeURIComponent(query)}`);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-[0.7rem] text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors border-t border-border"
              >
                <span>See all results for &ldquo;{query}&rdquo;</span>
                <span className="text-[0.6rem] opacity-50">Enter ↵</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </header>
  );
}
