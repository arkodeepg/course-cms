"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ExpandableTextProps {
  text: string;
  className?: string;
}

// A two-line clamp that the reader can open. It renders as plain text first
// (server and hydration agree), then, only if the text really overflows, turns
// expandable: tapping the text (or "more") expands it in place.
export function ExpandableText({ text, className }: ExpandableTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!open) setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);

  // The text node never remounts (so the measurement stays attached); when it
  // overflows, a transparent button covers the whole block as the tap target.
  return (
    <div className={cn("relative", className)}>
      <span
        ref={ref}
        data-desc
        className={cn("block [overflow-wrap:anywhere]", !open && "line-clamp-2")}
      >
        {text}
      </span>
      {overflows && (
        <>
          <span className="mt-0.5 inline-block font-medium text-brand" aria-hidden="true">
            {open ? "less" : "more"}
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Show less of the description" : "Show the full description"}
            data-desc-toggle
            onClick={() => setOpen((v) => !v)}
            className="absolute inset-0 h-full w-full cursor-pointer rounded"
          />
        </>
      )}
    </div>
  );
}
