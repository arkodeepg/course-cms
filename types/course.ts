export interface Lesson {
  index: number;
  name: string;
  url: string;
  file: string;
  status: string;
  has_description: boolean;
  resources?: Resource[];
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
}

export interface Category {
  index: number;
  name: string;
  folder: string;
  sections: Section[];
  resources?: Resource[];
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
}
