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
}

export interface CourseIndex {
  course: string;
  title?: string;
  cover?: string;
  total_lessons: number;
  downloaded: number;
  missing: number;
  categories: Category[];
}
