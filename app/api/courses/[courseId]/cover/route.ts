import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getCourseEntry, getCoursesPath } from '@/lib/courses';
import { etagMatches, statFile, streamFile, validatorHeaders } from '@/lib/file-serve';

// Covers can be replaced in place, so a day with revalidation by ETag rather
// than the archive's immutable year.
const CACHE_CONTROL = 'private, max-age=86400';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const entry = getCourseEntry(courseId);
  if (!entry) return new NextResponse(null, { status: 404 });

  const exts: Array<[string, string]> = [
    ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
    ['png', 'image/png'], ['webp', 'image/webp'], ['avif', 'image/avif'],
  ];
  for (const [ext, mime] of exts) {
    const p = path.join(getCoursesPath(), entry.dir, `cover.${ext}`);
    const stat = await statFile(p);
    if (!stat) continue;

    const headers: Record<string, string> = {
      ...validatorHeaders(stat),
      'Content-Type': mime,
      'Cache-Control': CACHE_CONTROL,
    };
    if (etagMatches(req, headers.ETag)) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(streamFile(p, req), {
      headers: { ...headers, 'Content-Length': String(stat.size) },
    });
  }
  return new NextResponse(null, { status: 404 });
}
