"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft } from "lucide-react";
import { openCommandPalette } from "@/lib/palette";

interface NavProps {
  breadcrumb?: { label: string; href: string };
}

export function Nav({ breadcrumb }: NavProps) {
  // Set after mount so the server render and first client render agree.
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut("⌘K");
  }, []);

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-[#16181f]">
      <div className="flex items-center gap-3 px-3 sm:px-6 py-3">
        <Link href="/" className="text-sm font-bold tracking-wide text-white shrink-0">
          CourseVault
        </Link>

        {breadcrumb && (
          <Link
            href={breadcrumb.href}
            className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
          >
            <ChevronLeft className="h-3 w-3 shrink-0" />
            <span className="truncate">{breadcrumb.label}</span>
          </Link>
        )}

        {/* Desktop: looks like the old search box, opens the command palette */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          className="hidden sm:flex flex-1 max-w-sm ml-auto items-center gap-2 rounded-md border border-border bg-[#252532] py-1.5 pl-2.5 pr-2 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">Search lessons, pages, tools…</span>
          <kbd className="rounded border border-border bg-[#1a1c26] px-1.5 py-px text-[0.6rem]">
            {shortcut}
          </kbd>
        </button>

        {/* Mobile: icon only */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-haspopup="dialog"
          aria-label="Search"
          className="sm:hidden ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
