import { notFound } from "next/navigation";
import Link from "next/link";
import fs from "fs";
import path from "path";
import { ChevronLeft } from "lucide-react";
import {
  getCourseEntry,
  getResourceAbsPath,
  resourceHref,
  collectResourceGroups,
} from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import { Nav } from "@/components/nav";
import {
  ResourceList,
  type ResourceGroupView,
} from "@/components/resource-list";

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

  const viewGroups: ResourceGroupView[] = groups.map((group) => ({
    label: group.label,
    items: group.resources.map((resource) => {
      let size = "";
      let exists = true;
      let abs = "";
      try {
        abs = getResourceAbsPath(courseId, resource);
        exists = fs.existsSync(abs);
        if (exists) size = formatBytes(fs.statSync(abs).size);
      } catch {
        exists = false;
      }
      const href = abs ? resourceHref(abs) : "";
      return {
        name: resource.name,
        href,
        downloadHref: href ? `${href}?download=1` : "",
        ext: path.extname(resource.file || resource.path || "").toLowerCase(),
        size,
        exists,
      };
    }),
  }));

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

        {viewGroups.length === 0 ? (
          <p className="text-[0.8rem] text-muted-foreground">
            This course has no downloadable resources.
          </p>
        ) : (
          <ResourceList groups={viewGroups} />
        )}
      </main>
    </div>
  );
}
