import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { discoverCourses } from "@/lib/courses";
import { prisma } from "@/lib/db";
import { buildPaletteIndex } from "@/lib/palette-index";

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
  const headers = {
    "Cache-Control": "private, max-age=60",
    ETag: etag,
  };

  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
