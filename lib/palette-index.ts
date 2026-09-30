// Server half of the command palette: builds the compact index served by
// /api/palette from the course folders plus recent progress rows.

import path from "path";
import { gzipSync } from "zlib";
import {
  collectResourceGroups,
  courseHasResources,
  discoverCourses,
  getCoursesPath,
  getLessonsFlat,
} from "@/lib/courses";
import { courseTitle } from "@/lib/utils";
import {
  isViewableExt,
  type CourseRow,
  type LessonRow,
  type ModuleRow,
  type PaletteIndex,
  type RecentRow,
  type ResourceRow,
} from "@/lib/palette";

export interface ProgressLike {
  courseId: string;
  lessonFile: string;
}

type Discovered = ReturnType<typeof discoverCourses>;

export function buildPaletteIndex(
  discovered: Discovered,
  recentProgress: ProgressLike[],
  root: string = getCoursesPath()
): PaletteIndex {
  const sorted = [...discovered].sort((a, b) =>
    courseTitle(a.courseId, a.index).localeCompare(courseTitle(b.courseId, b.index))
  );

  const courses: CourseRow[] = [];
  const modules: ModuleRow[] = [];
  const lessons: LessonRow[] = [];
  const resources: ResourceRow[] = [];
  // courseId -> lessonFile -> [m, l]
  const fileLookup = new Map<string, Map<string, [number, number]>>();
  const courseIdx = new Map<string, number>();

  sorted.forEach(({ courseId, index, dir }, ci) => {
    courseIdx.set(courseId, ci);
    courses.push([courseId, courseTitle(courseId, index), courseHasResources(index) ? 1 : 0, dir]);
    const files = new Map<string, [number, number]>();
    fileLookup.set(courseId, files);

    index.categories.forEach((category, mi) => {
      const m = mi + 1;
      modules.push([ci, m, category.name.split("\n")[0].trim()]);
      getLessonsFlat(category).forEach((lesson, li) => {
        const l = li + 1;
        lessons.push([ci, m, l, lesson.name.split("\n")[0].trim()]);
        if (!files.has(lesson.file)) files.set(lesson.file, [m, l]);
      });
    });

    const groups = collectResourceGroups(index);
    groups.forEach((group, gi) => {
      const courseLevel = gi === 0 && (index.resources?.length ?? 0) > 0;
      const m = courseLevel ? 0 : index.categories.findIndex((c) => c.name === group.label) + 1;
      for (const r of group.resources) {
        const rel = r.path ?? r.file;
        const ext = path.extname(r.file || r.path || "").toLowerCase();
        resources.push([ci, m, r.name.trim(), rel, isViewableExt(ext) ? 1 : 0]);
      }
    });
  });

  const recent: RecentRow[] = [];
  for (const row of recentProgress) {
    if (recent.length >= 5) break;
    const ci = courseIdx.get(row.courseId);
    const hit = fileLookup.get(row.courseId)?.get(row.lessonFile);
    if (ci === undefined || !hit) continue;
    recent.push([ci, hit[0], hit[1]]);
  }

  return { v: 1, root, courses, modules, lessons, resources, recent };
}

// ---------------------------------------------------------------------------
// Compression. The standalone server does not gzip route handler responses, so
// the palette route compresses itself. The gzipped body is cached by ETag, so
// it is compressed once per content change rather than per request.

// True when an Accept-Encoding header allows gzip (q > 0, or `*`).
export function acceptsGzip(header: string | null | undefined): boolean {
  if (!header) return false;
  let star: boolean | null = null;
  for (const part of header.toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const allowed = q ? Number(q.slice(2)) > 0 : true;
    if (name.trim() === "gzip" || name.trim() === "x-gzip") return allowed;
    if (name.trim() === "*") star = allowed;
  }
  return star === true;
}

let gzipCache: { etag: string; buf: Buffer } | null = null;

export function gzipForEtag(etag: string, body: string): Buffer {
  if (gzipCache && gzipCache.etag === etag) return gzipCache.buf;
  const buf = gzipSync(Buffer.from(body, "utf8"), { level: 6 });
  gzipCache = { etag, buf };
  return buf;
}
