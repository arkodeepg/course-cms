"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft } from "lucide-react";
import { openCommandPalette } from "@/lib/palette";

interface NavProps {
  breadcrumb?: { label: string; href: string };
  /**
   * The compact back link shown below sm, where the full breadcrumb is hidden.
   * Defaults to the breadcrumb; lesson pages point it at their module instead.
   */
  mobileBack?: { label: string; href: string; title?: string };
}

export function Nav({ breadcrumb, mobileBack }: NavProps) {
  const back: { label: string; href: string; title?: string } | undefined = mobileBack ?? breadcrumb;
  // Set after mount so the server render and first client render agree.
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut("⌘K");
  }, []);

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-surface-nav">
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-1.5 sm:fine:py-3">
        <Link href="/" className="text-sm font-bold tracking-wide text-white shrink-0 coarse:inline-flex coarse:min-h-11 coarse:items-center">
          CourseVault
        </Link>

        {/* Mobile: always a visible way back, 44 px tall */}
        {back && (
          <Link
            href={back.href}
            title={back.title ?? back.label}
            className="sm:hidden flex flex-1 min-h-11 items-center gap-0.5 -ml-1 pr-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="truncate">{back.label}</span>
          </Link>
        )}

        {breadcrumb && (
          <Link
            href={breadcrumb.href}
            className="hidden sm:flex items-center gap-1 coarse:min-h-11 coarse:pr-2 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
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
          className="hidden sm:flex flex-1 max-w-sm ml-auto items-center gap-2 rounded-md border border-border bg-surface-field py-1.5 coarse:min-h-11 pl-2.5 pr-2 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">Search lessons, pages, tools…</span>
          <kbd className="rounded border border-border bg-surface-toolbar px-1.5 py-px text-xs lg:text-[0.65rem]">
            {shortcut}
          </kbd>
        </button>

        {/* Mobile: icon only */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-haspopup="dialog"
          aria-label="Search"
          className="sm:hidden ml-auto -mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
