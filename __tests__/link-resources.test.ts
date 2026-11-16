import {
  isLinkResource,
  kind,
  kindCounts,
  linkFlavor,
  LINK_EXT,
  safeExternalUrl,
} from '@/lib/resource-kinds';
import { collectResourceGroups, courseHasResources, findCompanionMarkdown } from '@/lib/courses';
import { prepareIndex, search, type PaletteIndex } from '@/lib/palette';
import { detectCaptionSources } from '@/lib/caption-sources';
import type { CourseIndex, Lesson } from '@/types/course';

const SHEET = 'https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing';

describe('external link resources', () => {
  it('only accepts absolute http(s) urls', () => {
    expect(safeExternalUrl(SHEET)).toBe(SHEET);
    expect(safeExternalUrl('http://example.com/x')).toBe('http://example.com/x');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,hi')).toBeNull();
    expect(safeExternalUrl('/api/resource/x')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });

  it('classifies links and their flavor', () => {
    expect(kind(LINK_EXT)).toBe('link');
    expect(kindCounts([LINK_EXT, '.pdf', LINK_EXT])).toEqual([
      { kind: 'link', count: 2 },
      { kind: 'pdf', count: 1 },
    ]);
    expect(linkFlavor(SHEET)).toBe('sheet');
    expect(linkFlavor('https://docs.google.com/document/d/x/edit')).toBe('doc');
    expect(linkFlavor('https://docs.google.com/presentation/d/x/edit')).toBe('slides');
    expect(linkFlavor('https://forms.gle/abc')).toBe('form');
    expect(linkFlavor('https://www.notion.so/page')).toBe('generic');
    expect(isLinkResource({ url: SHEET })).toBe(true);
    expect(isLinkResource({ url: SHEET, file: 'a.pdf' })).toBe(false);
    expect(isLinkResource({ file: 'a.pdf' })).toBe(false);
  });

  const lesson: Lesson = {
    index: 1,
    name: 'Intro',
    url: '',
    file: '01 - Intro.mp4',
    status: 'downloaded',
    has_description: false,
    resources: [
      { name: 'Data Funnel Spreadsheet', url: SHEET },
      { name: 'Slides', file: '01 - Intro.pdf' },
    ],
  };
  const course: CourseIndex = {
    course: 'c',
    total_lessons: 1,
    downloaded: 1,
    missing: 0,
    categories: [
      {
        index: 1,
        name: 'Module 1',
        folder: '01 - M1',
        sections: [{ index: 1, name: 'S', folder: '01 - S', lessons: [lesson] }],
      },
    ],
  };

  it('collectResourceGroups carries the url and gives no path', () => {
    const groups = collectResourceGroups(course);
    expect(groups).toHaveLength(1);
    const [link, file] = groups[0].resources;
    expect(link).toEqual({ name: 'Intro · Data Funnel Spreadsheet', url: SHEET });
    expect(file.path).toBe('01 - M1/01 - S/01 - Intro.pdf');
    expect(courseHasResources(course)).toBe(true);
  });

  it('file-only helpers ignore url resources', () => {
    expect(findCompanionMarkdown(lesson)).toBeNull();
    expect(detectCaptionSources(lesson)).toEqual(expect.objectContaining({ timed: null }));
  });

  it('palette opens links in a new tab', () => {
    const raw: PaletteIndex = {
      v: 1,
      root: '/courses',
      courses: [['c', 'Course', 1, 'Course Dir']],
      modules: [[0, 1, 'Module 1']],
      lessons: [[0, 1, 1, 'Intro']],
      resources: [
        [0, 1, 'Intro · Data Funnel Spreadsheet', SHEET, 0, 1],
        [0, 1, 'Bad link', 'javascript:alert(1)', 0, 1],
      ],
      recent: [],
    };
    const prep = prepareIndex(raw);
    const res = search(prep, 'funnel spreadsheet', { pathname: '/' }).find((g) => g.id === 'resources');
    expect(res?.items[0].href).toBe(SHEET);
    expect(res?.items[0].external).toBe(true);
    const bad = prep.resources.find((r) => r.title === 'Bad link');
    expect(bad?.href).toBe('/course/c/resources');
    expect(bad?.external).toBe(false);
  });
});
