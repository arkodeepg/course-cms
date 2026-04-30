import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const rows = await prisma.progress.findMany({
    where: { courseId: params.courseId },
    select: { lessonFile: true, positionSeconds: true, completed: true, updatedAt: true },
  });

  return NextResponse.json(rows);
}
