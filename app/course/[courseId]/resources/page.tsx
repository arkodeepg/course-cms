import { notFound } from "next/navigation";
import Link from "next/link";
import fs from "fs";
import { ChevronLeft, Download, FileText } from "lucide-react";
import {
  getCourseEntry,
  getResourceAbsPath,
  resourceHref,
  collectResourceGroups,
} from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

interface Props {
  params: { courseId: string };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export default async function ResourcesPage({ params }: Props) {
  const { courseId } = params;
  const entry = getCourseEntry(courseId);
  if (!entry) notFound();

  const { index } = entry;
  const groups = collectResourceGroups(index);
  const courseName = courseTitle(courseId, index);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav breadcrumb={{ label: courseName, href: `/course/${courseId}` }} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        <Link
          href={`/course/${courseId}`}
          className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="h-3 w-3" />
          {courseName}
        </Link>
        <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground mb-4">
          Downloads &amp; Resources
        </p>

        {groups.length === 0 ? (
          <p className="text-[0.8rem] text-muted-foreground">
            This course has no downloadable resources.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#e53e3e] mb-2">
                  {group.label}
                </h2>
                <div className="flex flex-col gap-2">
                  {group.resources.map((resource) => {
                    let size = "";
                    let exists = true;
                    try {
                      const abs = getResourceAbsPath(courseId, resource);
                      exists = fs.existsSync(abs);
                      if (exists) size = formatBytes(fs.statSync(abs).size);
                    } catch {
                      exists = false;
                    }
                    const href = resourceHref(getResourceAbsPath(courseId, resource));
                    return (
                      <a
                        key={resource.file}
                        href={exists ? href : undefined}
                        className={`flex items-center gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2.5 transition-colors ${
                          exists
                            ? "hover:bg-secondary/50"
                            : "opacity-50 pointer-events-none"
                        }`}
                      >
                        <FileText className="h-4 w-4 shrink-0 text-[#e53e3e]" />
                        <span className="flex-1 text-[0.78rem] font-medium text-foreground leading-snug">
                          {resource.name}
                        </span>
                        {size && (
                          <span className="text-[0.62rem] tabular-nums text-muted-foreground shrink-0">
                            {size}
                          </span>
                        )}
                        {exists ? (
                          <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <span className="text-[0.6rem] text-muted-foreground shrink-0">
                            missing
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
