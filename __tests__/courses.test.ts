import {
  getLessonsFlat,
  parseLessonDescription,
  getLesson,
} from '@/lib/courses';
import { Category, CourseIndex } from '@/types/course';

const mockCategory: Category = {
  index: 1,
  name: 'Introduction',
  folder: '01 - Introduction',
  sections: [
    {
      index: 1,
      name: 'Introduction',
      folder: '01 - Introduction',
      lessons: [
        { index: 1, name: 'Welcome: Start Here', url: '', file: '01 - Welcome.mp4', status: 'downloaded', has_description: false },
        { index: 2, name: 'Mindset & Bottleneck Thinking\n\nGamma doc: https://example.com', url: '', file: '02 - Mindset.mp4', status: 'downloaded', has_description: true },
      ],
    },
  ],
};

const mockCourse: CourseIndex = {
  course: 'test-course',
  total_lessons: 2,
  downloaded: 2,
  missing: 0,
  categories: [mockCategory],
};

describe('getLessonsFlat', () => {
  it('returns all lessons across sections as a flat array', () => {
    const result = getLessonsFlat(mockCategory);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Welcome: Start Here');
    expect(result[1].file).toBe('02 - Mindset.mp4');
  });
});

describe('parseLessonDescription', () => {
  it('returns title only when has_description is false', () => {
    const { title, description } = parseLessonDescription(mockCategory.sections[0].lessons[0]);
    expect(title).toBe('Welcome: Start Here');
    expect(description).toBe('');
  });

  it('splits on first newline when has_description is true', () => {
    const { title, description } = parseLessonDescription(mockCategory.sections[0].lessons[1]);
    expect(title).toBe('Mindset & Bottleneck Thinking');
    expect(description).toBe('Gamma doc: https://example.com');
  });
});

describe('getLesson', () => {
  it('returns the correct lesson by 1-based module and lesson index', () => {
    const result = getLesson(mockCourse, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.lesson.file).toBe('02 - Mindset.mp4');
    expect(result!.category.name).toBe('Introduction');
  });

  it('returns null for out-of-range module index', () => {
    expect(getLesson(mockCourse, 99, 1)).toBeNull();
  });

  it('returns null for out-of-range lesson index', () => {
    expect(getLesson(mockCourse, 1, 99)).toBeNull();
  });
});
