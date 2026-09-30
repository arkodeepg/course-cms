"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Route error boundary. The root layout (and its command palette) stays
// mounted, so the viewer can retry or go home without a full reload.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 min-h-screen items-center justify-center px-4 py-16">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-brand" aria-hidden="true" />
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-[0.8rem] text-muted-foreground leading-relaxed">
          This page failed to load. It is usually a course folder that moved or an index that is
          being rewritten. Try again, or head back to your library.
        </p>
        {error.digest && (
          <p className="text-[0.65rem] text-muted-foreground tabular-nums">Error id: {error.digest}</p>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-border bg-secondary/30 px-3 py-1.5 text-[0.75rem] font-medium text-foreground hover:bg-secondary/60 transition-colors"
          >
            My Courses
          </Link>
        </div>
      </div>
    </main>
  );
}
