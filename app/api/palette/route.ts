import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { discoverCourses } from "@/lib/courses";
import { prisma } from "@/lib/db";
import { acceptsGzip, buildPaletteIndex, gzipForEtag } from "@/lib/palette-index";

export const dynamic = "force-dynamic";

// One compact index for the command palette: courses, modules, lessons,
// resources and the five most recently watched lessons.
export async function GET(req: NextRequest) {
  const recentRows = await prisma.progress.findMany({
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: { courseId: true, lessonFile: true },
  });

  const body = JSON.stringify(buildPaletteIndex(discoverCourses(), recentRows));
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  // The ETag is of the uncompressed body; Vary keeps caches from mixing the
  // gzipped and plain variants.
  const headers = {
    "Cache-Control": "private, max-age=60",
    ETag: etag,
    Vary: "Accept-Encoding",
  };

  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  if (acceptsGzip(req.headers.get("accept-encoding"))) {
    const gz = gzipForEtag(etag, body);
    return new NextResponse(new Uint8Array(gz), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Encoding": "gzip",
        "Content-Length": String(gz.length),
      },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
