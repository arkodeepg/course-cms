import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { courseId, lessonFile, positionSeconds, completed } = await req.json();

  if (!courseId || !lessonFile) {
    return NextResponse.json({ error: 'courseId and lessonFile required' }, { status: 400 });
  }

  const progress = await prisma.progress.upsert({
    where: { courseId_lessonFile: { courseId, lessonFile } },
    // Never downgrade completed=true to false — once marked complete, it stays complete
    update: {
      positionSeconds: positionSeconds ?? 0,
      ...(completed ? { completed: true } : {}),
    },
    create: { courseId, lessonFile, positionSeconds: positionSeconds ?? 0, completed: completed ?? false },
  });

  return NextResponse.json(progress);
}
