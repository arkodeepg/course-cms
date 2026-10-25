import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { srtToVtt } from '@/lib/captions';
import { etagMatches, resolveArchivePath, statFile, validatorHeaders } from '@/lib/file-serve';

// Captions for the player's <track> and the transcript panel, always as
// text/vtt. Same path scheme and containment as /api/resource (an absolute
// archive path, symlinks resolved, nothing outside COURSES_PATH), but limited to
// .vtt and .srt files: SubRip is converted on the fly, and a .vtt that is really
// SubRip (no WEBVTT header) is converted too, since browsers reject it.

const CAPTION_EXTS = new Set(['.vtt', '.srt']);
// Hours of dense captions are a few hundred KB; anything far larger is not a caption file.
const MAX_BYTES = 5 * 1024 * 1024;
// Shorter than the resource route's year: the bytes are derived, and the
// conversion may change between app versions. The ETag still makes revalidation cheap.
const CACHE_CONTROL = 'private, max-age=3600';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = resolveArchivePath(path.join('/', ...params.path));
  if (!filePath) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!CAPTION_EXTS.has(path.extname(filePath).toLowerCase())) {
    return new NextResponse('Not a caption file', { status: 415 });
  }

  const stat = await statFile(filePath);
  if (!stat) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (stat.size > MAX_BYTES) {
    return new NextResponse('Caption file too large', { status: 413 });
  }

  const headers: Record<string, string> = {
    ...validatorHeaders(stat),
    'Cache-Control': CACHE_CONTROL,
    'Content-Type': 'text/vtt; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };

  if (etagMatches(req, headers.ETag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf-8');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  // srtToVtt passes real WebVTT through (normalised) and converts everything else.
  return new NextResponse(srtToVtt(raw), { headers });
}
