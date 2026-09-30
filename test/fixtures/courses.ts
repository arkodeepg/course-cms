import fs from 'fs';
import os from 'os';
import path from 'path';
import { CourseIndex, Lesson } from '@/types/course';

export function lesson(index: number, name: string, file: string, extra: Partial<Lesson> = {}): Lesson {
  return {
    index,
    name,
    url: '',
    file,
    status: 'downloaded',
    has_description: name.includes('\n'),
    ...extra,
  };
}

export function makeCoursesRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'course-cms-test-'));
}

export function writeCourse(root: string, dir: string, index: CourseIndex): string {
  const dirPath = path.join(root, dir);
  fs.mkdirSync(dirPath, { recursive: true });
  const indexPath = path.join(dirPath, '_index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index));
  return indexPath;
}

export function rmRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

export const larsenCourse: CourseIndex = {
  course: 'matthew-larsen-10k-per-month',
  title: 'Matthew Larsen - 10k Per Month',
  total_lessons: 3,
  downloaded: 2,
  missing: 1,
  categories: [
    {
      index: 1,
      name: 'Getting Clients',
      folder: '01 - Getting Clients',
      sections: [
        {
          index: 1,
          name: 'Outreach Basics',
          folder: '01 - Outreach Basics',
          lessons: [
            lesson(1, 'Offer of the week', '01 - Offer.mp4', {
              resources: [{ name: 'Offer Template', file: 'offer.pdf' }],
            }),
            lesson(2, 'Cold email scripts\n\nA list of scripts for your offer', '02 - Scripts.mp4'),
          ],
        },
      ],
    },
    {
      index: 2,
      name: 'Scaling',
      folder: '02 - Scaling',
      sections: [
        {
          index: 1,
          name: 'Scaling',
          folder: '',
          lessons: [lesson(1, 'Hiring', '03 - Hiring.mp4', { status: 'missing' })],
        },
      ],
    },
  ],
};

export const croCourse: CourseIndex = {
  course: 'cro-masterclass',
  title: 'Dylan Ander - CRO Masterclass',
  cover: 'cover.jpg',
  total_lessons: 3,
  downloaded: 3,
  missing: 0,
  duration_seconds: 5400,
  categories: [
    {
      index: 1,
      name: 'Module 2 - Mindset',
      folder: '02 - Mindset',
      sections: [
        {
          index: 1,
          name: 'Mindset',
          folder: '',
          lessons: [
            lesson(1, 'Lesson 2.0 - Mindset overview', '01.mp4'),
            lesson(2, 'Lesson 2.1 - The Billion Dollar CRO Mindset', '02.mp4'),
            lesson(3, 'Lesson 2.2 - Testing culture\n\nwhy mindset beats tactics in CRO', '03.mp4'),
          ],
        },
      ],
    },
  ],
};
