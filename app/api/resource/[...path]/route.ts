import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { contentTypeFor } from '@/lib/content-types';
import { parseRange } from '@/lib/http-range';
import {
  OPEN_RANGE_BYTES,
  etagMatches,
  resolveArchivePath,
  statFile,
  streamFile,
  validatorHeaders,
} from '@/lib/file-serve';

// Types the browser can render inline. Anything else is sent as a download.
const INLINE_EXTS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.mp3',
  '.wav',
  '.m4a',
  '.txt',
  '.csv',
]);

// Archive files never change in place. See the video route.
const CACHE_CONTROL = 'private, max-age=31536000, immutable';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = resolveArchivePath(path.join('/', ...params.path));
  if (!filePath) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const stat = await statFile(filePath);
  if (!stat) {
    return new NextResponse('Not found', { status: 404 });
  }

  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();

  // `?download=1` always forces a download. Otherwise viewable types open
  // inline in the browser; non-viewable types still download.
  const forceDownload = req.nextUrl.searchParams.get('download') === '1';
  const disposition =
    forceDownload || !INLINE_EXTS.has(ext) ? 'attachment' : 'inline';
  const dispositionHeader = `${disposition}; filename="${path.basename(filePath)}"`;

  const headers: Record<string, string> = {
    ...validatorHeaders(stat),
    'Cache-Control': CACHE_CONTROL,
    'Content-Type': contentTypeFor(filePath),
    'Accept-Ranges': 'bytes',
    'Content-Disposition': dispositionHeader,
  };
  const rangeHeader = req.headers.get('range');

  if (!rangeHeader && etagMatches(req, headers.ETag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  // Range support so inline audio/video can seek and stream.
  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize, OPEN_RANGE_BYTES);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const { start, end } = range;
    return new NextResponse(streamFile(filePath, req, { start, end }), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }

  return new NextResponse(streamFile(filePath, req), {
    headers: { ...headers, 'Content-Length': String(fileSize) },
  });
}
