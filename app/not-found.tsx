import Link from "next/link";
import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { Nav } from "@/components/nav";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <SearchX className="h-8 w-8 text-brand" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground">Page not found</h1>
          <p className="text-[0.8rem] text-muted-foreground leading-relaxed">
            That course, module or lesson is not in the library. It may have been renamed or
            re-indexed.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center rounded-md bg-brand px-3 py-1.5 coarse:min-h-11 coarse:px-4 text-[0.75rem] font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Back to My Courses
          </Link>
        </div>
      </main>
    </div>
  );
}
