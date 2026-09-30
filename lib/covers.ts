import fs from 'fs';
import path from 'path';
import type { CourseIndex } from '@/types/course';

// Generated cover thumbnails: one <courseId>.webp per course, written by
// AIW2 execution/course_cms_covers.py (640 px wide, a resized cover.<ext> or a
// frame from the first video lesson). They live in the app's writable data
// directory, not the read-only archive: ./data/covers in dev, /app/data/covers
// in the container (the standalone server runs with cwd /app).

export function getCoversPath(): string {
  return process.env.COVERS_PATH || path.join(process.cwd(), 'data', 'covers');
}

// A course id is a slug. Anything that could name another directory or a
// hidden file is refused before it reaches the filesystem.
export function isSafeCourseId(courseId: string): boolean {
  return (
    courseId.length > 0 &&
    !courseId.startsWith('.') &&
    !courseId.includes('..') &&
    !/[\\/\0]/.test(courseId)
  );
}

// The absolute path of a course's generated cover, or null when the id would
// resolve outside the covers directory. The file itself may not exist.
export function generatedCoverPath(courseId: string, dir: string = getCoversPath()): string | null {
  if (!isSafeCourseId(courseId)) return null;
  const root = path.resolve(dir);
  const p = path.resolve(root, `${courseId}.webp`);
  return path.dirname(p) === root ? p : null;
}

// ---------------------------------------------------------------------------
// Which courses have a generated cover. Same approach as the course cache:
// kept in memory and validated per call by one stat of the covers directory
// (the generator writes a temp file and renames it, which changes the
// directory's mtime). The directory is only re-listed when that changes.
// ---------------------------------------------------------------------------

interface CoverIdCache {
  dir: string;
  mtimeMs: number | null;
  ids: Set<string>;
}

let idCache: CoverIdCache | null = null;

export function generatedCoverIds(dir: string = getCoversPath()): ReadonlySet<string> {
  const st = fs.statSync(dir, { throwIfNoEntry: false });
  const mtimeMs = st && st.isDirectory() ? st.mtimeMs : null;
  if (idCache && idCache.dir === dir && idCache.mtimeMs === mtimeMs) return idCache.ids;

  const ids = new Set<string>();
  if (mtimeMs !== null) {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!dirent.isFile() || !dirent.name.endsWith('.webp') || dirent.name.startsWith('.')) continue;
      ids.add(dirent.name.slice(0, -'.webp'.length));
    }
  }
  idCache = { dir, mtimeMs, ids };
  return ids;
}

// Test hook: drop the cached listing.
export function resetCoverCache(): void {
  idCache = null;
}

// True when the course has a generated thumbnail or an original cover.<ext>
// (index.cover is filled from disk by the course cache when the index lacks it).
export function courseHasCover(courseId: string, index: Pick<CourseIndex, 'cover'>): boolean {
  return Boolean(index.cover) || generatedCoverIds().has(courseId);
}
