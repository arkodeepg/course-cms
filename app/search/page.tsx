import Link from "next/link";
import { LayoutList, LayoutGrid, Search } from "lucide-react";
import { Nav } from "@/components/nav";
import { MAX_LIMIT, SearchResult, searchLibrary } from "@/lib/search";
import type { Metadata } from "next";
import { plural } from "@/lib/format";

interface Props {
  searchParams: { q?: string; view?: string };
}

function groupByModule(results: SearchResult[]): Map<string, SearchResult[]> {
  const map = new Map<string, SearchResult[]>();
  for (const r of results) {
    const key = `${r.courseId}::${r.moduleIndex}::${r.categoryName}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

export function generateMetadata({ searchParams }: Props): Metadata {
  const q = (searchParams.q ?? "").trim();
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage({ searchParams }: Props) {
  const q = searchParams.q ?? "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const { results, total } = q ? searchLibrary(q, MAX_LIMIT) : { results: [], total: 0 };
  const grouped = groupByModule(results);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        {/* A plain GET form, so it works before hydration and on any phone. */}
        <form action="/search" method="get" role="search" className="flex items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search lessons"
              aria-label="Search lessons"
              enterKeyHint="search"
              autoComplete="off"
              className="w-full h-10 rounded-md border border-border bg-surface-field/60 pl-9 pr-2 text-base sm:fine:text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          {view === "grid" && <input type="hidden" name="view" value="grid" />}
          <button
            type="submit"
            className="h-10 shrink-0 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Search
          </button>
        </form>
        {!q ? (
          <p className="text-sm text-muted-foreground">Type a word from a lesson title or description.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No results for <span className="text-foreground">&ldquo;{q}&rdquo;</span>.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground">
                {total > results.length ? `Top ${results.length} of ${total}` : total}{" "}
                {plural(total, "result", "results", false)} for &ldquo;{q}&rdquo;
              </p>
              <div className="flex items-center gap-1 coarse:gap-2 shrink-0">
                <Link
                  href={`/search?q=${encodeURIComponent(q)}&view=list`}
                  aria-label="List view"
                  className={`inline-flex items-center justify-center h-[26px] w-[26px] coarse:h-10 coarse:w-10 rounded transition-colors ${view === "list" ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                  title="List view"
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/search?q=${encodeURIComponent(q)}&view=grid`}
                  aria-label="Grid view"
                  className={`inline-flex items-center justify-center h-[26px] w-[26px] coarse:h-10 coarse:w-10 rounded transition-colors ${view === "grid" ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              {Array.from(grouped.entries()).map(([key, group]) => {
                const first = group[0];
                const courseName = first.courseId
                  .split("-")
                  .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
                  .join(" ");

                return (
                  <div key={key}>
                    <div className="text-xs font-semibold text-brand mb-1">
                      {courseName} · {first.categoryName}
                    </div>
                    <div className={view === "grid" ? "grid grid-cols-1 min-[400px]:grid-cols-2 gap-2" : "flex flex-col gap-1 coarse:gap-2"}>
                      {group.map((r) => (
                        <Link
                          key={r.lessonFile}
                          href={r.href}
                          className="flex flex-col min-w-0 rounded-md border border-border bg-card px-3 py-2 coarse:py-2.5 hover:bg-card/80 transition-colors"
                        >
                          <span className="text-sm font-medium text-foreground break-words">
                            {r.lessonTitle}
                          </span>
                          {r.lessonDescription && (
                            <span className="text-[0.75rem] text-muted-foreground mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">
                              {r.lessonDescription}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
