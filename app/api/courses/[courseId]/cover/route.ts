import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getCourseEntry, getCoursesPath } from '@/lib/courses';

export async function GET(
  _req: NextRequest,
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
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      return new NextResponse(buf, {
        headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' },
      });
    }
  }
  return new NextResponse(null, { status: 404 });
}
