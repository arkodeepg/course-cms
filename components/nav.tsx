"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ChevronLeft } from "lucide-react";

interface NavProps {
  breadcrumb?: { label: string; href: string };
}

export function Nav({ breadcrumb }: NavProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = inputRef.current?.value.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length >= 2) {
      debounceRef.current = setTimeout(() => {
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }, 400);
    }
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

        <form onSubmit={handleSearch} className="flex-1 max-w-sm ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search lessons… (⌘K)"
              onChange={handleInputChange}
              className="w-full rounded-md border border-border bg-[#252532] py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </form>
      </div>
    </header>
  );
}
