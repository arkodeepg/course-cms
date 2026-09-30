import { CourseEntry, getCourseLibrary, getLessonsFlat, parseLessonDescription } from '@/lib/courses';
import { courseTitle } from '@/lib/utils';

export type SearchKind = 'course' | 'module' | 'lesson' | 'resource';

// The first eight fields are the original /api/search contract, which the nav
// dropdown consumes; keep them. `kind`, `score` and `href` are additions.
export interface SearchResult {
  courseId: string;
  courseDir: string;
  categoryName: string;
  moduleIndex: number;
  lessonIndex: number;
  lessonTitle: string;
  lessonDescription: string;
  lessonFile: string;
  kind: SearchKind;
  score: number;
  href: string;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Lowercase, strip diacritics, and collapse everything that is not a letter or
// digit to single spaces, with a leading and trailing space so " term" finds a
// word start with a plain indexOf.
export function normalize(text: string): string {
  const flat = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return flat ? ` ${flat} ` : '';
}

// Some generators store a module or section blurb after the name, separated
// by a newline. Only the first line is the name; the rest ranks as description.
function splitName(name: string): { head: string; rest: string } {
  const i = name.indexOf('\n');
  return i === -1
    ? { head: name.trim(), rest: '' }
    : { head: name.slice(0, i).trim(), rest: name.slice(i + 1) };
}

interface IndexedEntry {
  result: Omit<SearchResult, 'score'>;
  // The entry's own name: course title, module name, lesson title, resource name.
  primary: string;
  // Other text that belongs to the entry itself (lesson description, section).
  own: string;
  // Surrounding context that may satisfy extra terms but never a match alone.
  context: string;
  kindBonus: number;
}

const KIND_BONUS: Record<SearchKind, number> = { course: 30, module: 20, lesson: 10, resource: 0 };

function buildIndex(entries: readonly CourseEntry[]): IndexedEntry[] {
  const out: IndexedEntry[] = [];

  for (const { courseId, index } of entries) {
    const title = courseTitle(courseId, index);
    const courseText = normalize(`${title} ${courseId.replace(/-/g, ' ')}`);
    const base = { courseId, courseDir: index.course, lessonDescription: '' };

    out.push({
      result: {
        ...base,
        categoryName: 'Course',
        moduleIndex: 1,
        lessonIndex: 1,
        lessonTitle: title,
        lessonFile: `course:${courseId}`,
        kind: 'course',
        href: `/course/${courseId}`,
      },
      primary: normalize(title),
      own: courseText,
      context: '',
      kindBonus: KIND_BONUS.course,
    });

    for (const r of index.resources ?? []) {
      out.push({
        result: {
          ...base,
          categoryName: 'Course downloads',
          moduleIndex: 1,
          lessonIndex: 1,
          lessonTitle: r.name,
          lessonFile: `resource:${r.path ?? r.file}`,
          kind: 'resource',
          href: `/course/${courseId}/resources`,
        },
        primary: normalize(r.name),
        own: '',
        context: courseText,
        kindBonus: KIND_BONUS.resource,
      });
    }

    index.categories.forEach((category, ci) => {
      const moduleName = splitName(category.name);
      // Returned titles use the trimmed first line, never the blurb after it.
      const moduleTitle = moduleName.head.trim();
      const moduleText = normalize(moduleName.head);
      const moduleContext = `${moduleText} ${courseText}`;

      out.push({
        result: {
          ...base,
          categoryName: moduleTitle,
          moduleIndex: category.index,
          lessonIndex: 1,
          lessonTitle: moduleTitle,
          lessonFile: `module:${courseId}:${ci + 1}`,
          kind: 'module',
          href: `/course/${courseId}/${ci + 1}`,
        },
        primary: moduleText,
        own: normalize(moduleName.rest),
        context: courseText,
        kindBonus: KIND_BONUS.module,
      });

      for (const r of category.resources ?? []) {
        out.push({
          result: {
            ...base,
            categoryName: moduleTitle,
            moduleIndex: category.index,
            lessonIndex: 1,
            lessonTitle: r.name,
            lessonFile: `resource:${r.path ?? `${category.folder}/${r.file}`}`,
            kind: 'resource',
            href: `/course/${courseId}/resources`,
          },
          primary: normalize(r.name),
          own: '',
          context: moduleContext,
          kindBonus: KIND_BONUS.resource,
        });
      }

      let li = 0;
      for (const section of category.sections) {
        const sectionText =
          section.name === category.name ? '' : normalize(splitName(section.name).head);
        for (const lesson of section.lessons) {
          li += 1;
          const { title: lessonTitle, description } = parseLessonDescription(lesson);
          const lessonResult = {
            ...base,
            categoryName: moduleTitle,
            moduleIndex: category.index,
            lessonIndex: li,
            lessonDescription: description,
            href: `/course/${courseId}/${ci + 1}/${li}`,
          };
          const primary = normalize(lessonTitle);
          out.push({
            result: { ...lessonResult, lessonTitle, lessonFile: lesson.file, kind: 'lesson' },
            primary,
            own: `${normalize(description)} ${sectionText}`,
            context: moduleContext,
            kindBonus: KIND_BONUS.lesson,
          });
          for (const r of lesson.resources ?? []) {
            out.push({
              result: {
                ...lessonResult,
                lessonDescription: '',
                lessonTitle: r.name,
                lessonFile: `${lesson.file}#${r.file}`,
                kind: 'resource',
              },
              primary: normalize(r.name),
              own: '',
              context: `${primary} ${moduleContext}`,
              kindBonus: KIND_BONUS.resource,
            });
          }
        }
      }
    });
  }

  return out;
}

let searchIndex: { generation: number; entries: IndexedEntry[] } | null = null;

// The search index is derived from the course cache and rebuilt whenever the
// cache's generation moves, so it never outlives an _index.json change.
function getSearchIndex(): IndexedEntry[] {
  const lib = getCourseLibrary();
  if (!searchIndex || searchIndex.generation !== lib.generation) {
    searchIndex = { generation: lib.generation, entries: buildIndex(lib.entries) };
  }
  return searchIndex.entries;
}

// Ranking tiers, highest first:
//   exact or prefix course title
//   exact or prefix lesson (module, resource) name
//   every term starts a word in the name
//   every term appears in the name
//   some terms in the name, the rest in description, section or context
//   no term in the name: description or section only
// Within a tier, courses beat modules beat lessons beat resources, then
// earlier matches and shorter names win.
function scoreEntry(e: IndexedEntry, phrase: string, terms: string[]): number {
  const p = e.primary;
  let inPrimary = 0;
  let wordStarts = 0;
  let inOwn = 0;
  for (const t of terms) {
    if (p.includes(t)) {
      inPrimary += 1;
      if (p.includes(` ${t}`)) wordStarts += 1;
    } else if (e.own.includes(t)) {
      inOwn += 1;
    } else if (!e.context.includes(t)) {
      return 0;
    }
  }
  // Context alone (the course or module name) never makes a lesson a hit.
  if (inPrimary === 0 && inOwn === 0) return 0;

  let tier: number;
  if (p === ` ${phrase} ` || p.startsWith(` ${phrase}`)) {
    tier = e.result.kind === 'course' ? 1000 : 800;
    if (p === ` ${phrase} `) tier += 50;
  } else if (inPrimary === terms.length && wordStarts === terms.length) {
    tier = 500;
  } else if (inPrimary === terms.length) {
    tier = 300;
  } else if (inPrimary > 0) {
    tier = 200;
  } else {
    tier = 100;
  }

  const pos = inPrimary > 0 ? p.indexOf(terms[0]) : 0;
  const tiebreak = Math.max(0, 9 - Math.min(pos, 90) / 10) + Math.max(0, 1 - p.length / 400);
  return tier + e.kindBonus + Math.round(tiebreak * 100) / 100;
}

export function parseLimit(raw: string | null | undefined, fallback = DEFAULT_LIMIT): number {
  const n = raw == null || raw === '' ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_LIMIT);
}

export function searchLibrary(
  query: string,
  limit: number = DEFAULT_LIMIT
): { results: SearchResult[]; total: number } {
  if (query.trim().length < 2) return { results: [], total: 0 };
  const phrase = normalize(query).trim();
  if (!phrase) return { results: [], total: 0 };
  const terms = Array.from(new Set(phrase.split(' ')));

  const hits: Array<{ e: IndexedEntry; score: number; order: number }> = [];
  const entries = getSearchIndex();
  for (let i = 0; i < entries.length; i++) {
    const score = scoreEntry(entries[i], phrase, terms);
    if (score > 0) hits.push({ e: entries[i], score, order: i });
  }
  hits.sort((a, b) => b.score - a.score || a.order - b.order);

  const cap = Math.max(1, Math.min(limit, MAX_LIMIT));
  return {
    total: hits.length,
    results: hits.slice(0, cap).map(({ e, score }) => ({ ...e.result, score })),
  };
}
