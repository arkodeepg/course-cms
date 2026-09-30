export interface Lesson {
  index: number;
  name: string;
  url: string;
  file: string;
  status: string;
  has_description: boolean;
  resources?: Resource[];
  // Emitted by newer index generators; absent on older _index.json files.
  duration_seconds?: number | null;
  size_bytes?: number;
  archived?: boolean;
  playable?: boolean;
}

export interface Resource {
  name: string;
  file: string;
  // Path relative to the course directory. Use for module-level or course-level
  // downloads that do not live inside a lesson's section folder. Falls back to `file`.
  path?: string;
}

export interface Section {
  index: number;
  name: string;
  folder: string;
  lessons: Lesson[];
  duration_seconds?: number | null;
}

export interface Category {
  index: number;
  name: string;
  folder: string;
  sections: Section[];
  resources?: Resource[];
  duration_seconds?: number | null;
}

export interface CourseIndex {
  course: string;
  title?: string;
  cover?: string;
  total_lessons: number;
  downloaded: number;
  missing: number;
  categories: Category[];
  resources?: Resource[];
  duration_seconds?: number | null;
  total_size_bytes?: number;
}

// The slice of a course the library page needs. Built on the server so the
// client never receives a course's full lesson tree.
export interface CourseSummary {
  courseId: string;
  title: string;
  hasCover: boolean;
  totalLessons: number;
  moduleCount: number;
  completedCount: number;
  startedCount: number;
  missingCount: number;
  resumeHref: string | null;
  lastActiveAt: string | null;
  durationSeconds: number | null;
}
