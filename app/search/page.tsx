import Link from "next/link";
import { Nav } from "@/components/nav";
import { SearchResult } from "@/app/api/search/route";
import { discoverCourses, getLessonsFlat, parseLessonDescription } from "@/lib/courses";

interface Props {
  searchParams: { q?: string };
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

async function search(q: string): Promise<SearchResult[]> {
  const lower = q.toLowerCase().trim();
  if (lower.length < 2) return [];

  const courses = discoverCourses();
  const results: SearchResult[] = [];

  for (const { courseId, index } of courses) {
    for (const category of index.categories) {
      const flat = getLessonsFlat(category);
      flat.forEach((lesson, idx) => {
        const { title, description } = parseLessonDescription(lesson);
        const searchText = `${title} ${description}`.toLowerCase();
        if (searchText.includes(lower)) {
          results.push({
            courseId,
            courseDir: index.course,
            categoryName: category.name,
            moduleIndex: category.index,
            lessonIndex: idx + 1,
            lessonTitle: title,
            lessonDescription: description,
            lessonFile: lesson.file,
          });
        }
      });
    }
  }

  return results;
}

export default async function SearchPage({ searchParams }: Props) {
  const q = searchParams.q ?? "";
  const results = q ? await search(q) : [];
  const grouped = groupByModule(results);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full">
        {!q ? (
          <p className="text-sm text-muted-foreground">Enter a search query above.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No results for <span className="text-foreground">&ldquo;{q}&rdquo;</span>.
          </p>
        ) : (
          <>
            <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground mb-4">
              {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
            </p>
            <div className="flex flex-col gap-6">
              {Array.from(grouped.entries()).map(([key, group]) => {
                const first = group[0];
                const courseName = first.courseId
                  .split("-")
                  .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
                  .join(" ");

                return (
                  <div key={key}>
                    <div className="text-xs font-semibold text-[#e53e3e] mb-1">
                      {courseName} · {first.categoryName}
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.map((r) => (
                        <Link
                          key={r.lessonFile}
                          href={`/course/${r.courseId}/${r.moduleIndex}/${r.lessonIndex}`}
                          className="flex flex-col rounded-md border border-border bg-card px-3 py-2 hover:bg-card/80 transition-colors"
                        >
                          <span className="text-sm font-medium text-foreground">
                            {r.lessonTitle}
                          </span>
                          {r.lessonDescription && (
                            <span className="text-[0.7rem] text-muted-foreground mt-0.5 line-clamp-2">
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
