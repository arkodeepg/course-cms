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

// Archive files never change in place, so they can be cached hard. `private`
// rather than `public`: this is a personal library behind Tailscale and there is
// no proxy that should be holding copies of it.
const CACHE_CONTROL = 'private, max-age=31536000, immutable';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const filePath = resolveArchivePath(path.join('/', ...params.path));
  if (!filePath) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const stat = await statFile(filePath);
  if (!stat) {
    return new NextResponse('Not found', { status: 404 });
  }

  const fileSize = stat.size;
  const headers: Record<string, string> = {
    ...validatorHeaders(stat),
    'Cache-Control': CACHE_CONTROL,
    'Content-Type': contentTypeFor(filePath, 'video/mp4'),
    'Accept-Ranges': 'bytes',
  };
  const rangeHeader = req.headers.get('range');

  if (!rangeHeader && etagMatches(req, headers.ETag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  if (!rangeHeader) {
    return new NextResponse(streamFile(filePath, req), {
      headers: { ...headers, 'Content-Length': String(fileSize) },
    });
  }

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
