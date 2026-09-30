import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCourseEntry, getCoursesPath } from '@/lib/courses';
import { generatedCoverPath } from '@/lib/covers';
import { etagMatches, statFile, validatorHeaders } from '@/lib/file-serve';

// Covers can be replaced in place, so a day with revalidation by ETag rather
// than the archive's immutable year.
const CACHE_CONTROL = 'private, max-age=86400';

const ORIGINAL_EXTS: Array<[string, string]> = [
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['png', 'image/png'], ['webp', 'image/webp'], ['avif', 'image/avif'],
];

async function serve(req: NextRequest, p: string, mime: string): Promise<NextResponse | null> {
  const stat = await statFile(p);
  if (!stat) return null;
  const headers: Record<string, string> = {
    ...validatorHeaders(stat),
    'Content-Type': mime,
    'Cache-Control': CACHE_CONTROL,
  };
  if (etagMatches(req, headers.ETag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  // Covers are small (a generated WebP is ~40 KB at most, an original up to
  // ~600 KB), so the body is read whole. Returning a Node read stream here made
  // undici log ERR_INVALID_STATE ("ReadableStream is already closed") on
  // every request in the standalone server.
  let body: Buffer;
  try {
    body = await fs.promises.readFile(p);
  } catch {
    return null;
  }
  return new NextResponse(new Uint8Array(body), {
    headers: { ...headers, 'Content-Length': String(body.length) },
  });
}

// Serves the generated 640 px WebP thumbnail when there is one (see
// lib/covers.ts), else the course's original cover.<ext>, else 404.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const entry = getCourseEntry(courseId);
  if (!entry) return new NextResponse(null, { status: 404 });

  const generated = generatedCoverPath(courseId);
  if (generated) {
    const res = await serve(req, generated, 'image/webp');
    if (res) return res;
  }

  for (const [ext, mime] of ORIGINAL_EXTS) {
    const res = await serve(req, path.join(getCoursesPath(), entry.dir, `cover.${ext}`), mime);
    if (res) return res;
  }
  return new NextResponse(null, { status: 404 });
}
