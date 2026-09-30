export interface ByteRange {
  start: number;
  end: number;
}

// Parses a single HTTP byte range against a known file size. Returns null when
// the header is malformed or unsatisfiable, which the caller turns into a 416.
// Multi-range headers (`bytes=0-1,5-6`) are not supported and also return null.
//
// Forms handled:
//   bytes=0-1023   explicit window, end clamped to the last byte
//   bytes=1024-    open ended, capped at openRangeBytes
//   bytes=-1024    suffix, the last N bytes. Safari uses this to find the moov
//                  atom of a file that was not written faststart.
//
// This lives outside the route files because a Next route module may only
// export HTTP method handlers and route config.
export function parseRange(
  header: string,
  fileSize: number,
  openRangeBytes: number
): ByteRange | null {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startStr, endStr] = match;

  if (startStr === '') {
    if (endStr === '') return null;
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, fileSize - suffixLength), end: fileSize - 1 };
  }

  const start = Number(startStr);
  if (!Number.isFinite(start) || start >= fileSize) return null;

  let end: number;
  if (endStr === '') {
    const cap = Number.isFinite(openRangeBytes) && openRangeBytes > 0 ? openRangeBytes : fileSize;
    end = Math.min(start + cap - 1, fileSize - 1);
  } else {
    const requested = Number(endStr);
    if (!Number.isFinite(requested)) return null;
    end = Math.min(requested, fileSize - 1);
  }

  if (end < start) return null;
  return { start, end };
}
