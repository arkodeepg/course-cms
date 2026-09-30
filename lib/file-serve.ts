import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';

// Shared plumbing for the routes that stream files off the read-only archive.

// How much an open-ended range (`bytes=N-`) is allowed to return. This used to be
// 1 MB, which meant the browser could never buffer far ahead however much it
// wanted to: at 2.5x playback on a 7 Mbps lesson that is a round trip every half
// second, and every one of them stalls the picture. 8 MB is roughly 10 seconds of
// the archive's worst-case bitrate.
export const OPEN_RANGE_BYTES = (() => {
  const configured = Number(process.env.VIDEO_CHUNK_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 8 * 1024 * 1024;
})();

function realPathOrSelf(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

// Resolves symlinks (on both the file and the archive root) before the
// containment check, so a link inside the archive cannot point out of it.
// Returns the resolved path, or null when it falls outside the archive.
// A missing file resolves to itself and 404s at the stat.
export function resolveArchivePath(filePath: string): string | null {
  const root = realPathOrSelf(process.env.COURSES_PATH || '/courses');
  const resolved = realPathOrSelf(filePath);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

// Returns stats only for a regular file.
export async function statFile(filePath: string): Promise<fs.Stats | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

export function etagFor(stat: fs.Stats): string {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

// True when If-None-Match lists this ETag (or `*`). Weak comparison, as RFC 9110
// requires for If-None-Match, so a `W/` prefix added by a proxy still matches.
export function etagMatches(req: NextRequest, etag: string): boolean {
  const header = req.headers.get('if-none-match');
  if (!header) return false;
  const strip = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => tag.trim() === '*' || strip(tag) === strip(etag));
}

export function validatorHeaders(stat: fs.Stats): Record<string, string> {
  return {
    ETag: etagFor(stat),
    'Last-Modified': stat.mtime.toUTCString(),
  };
}

// Node read streams are not tied to the request, so a seek or a closed tab used
// to leave the previous stream reading to completion.
export function streamFile(
  filePath: string,
  req: NextRequest,
  options?: { start: number; end: number }
): ReadableStream {
  const stream = fs.createReadStream(filePath, options);
  if (req.signal.aborted) {
    stream.destroy();
  } else {
    req.signal.addEventListener('abort', () => stream.destroy(), { once: true });
  }
  return stream as unknown as ReadableStream;
}
