"use client";

import { useEffect, useState } from "react";

// Media query state for client components. Starts at `initial` so the server
// render and hydration agree, then follows the real query after mount.
export function useMediaQuery(query: string, initial = false): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

// Phones and touch tablets. The resources page starts with its groups folded
// there, and PDFs open in the system viewer instead of an iframe: Android
// Chrome has no inline PDF viewer and iOS shows only the first page.
export const HANDHELD_QUERY = "(max-width: 639px), (pointer: coarse)";
