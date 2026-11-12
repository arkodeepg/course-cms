import { findCompanionMarkdown, stripTitleHeading } from '@/lib/courses';
import { Lesson, Resource } from '@/types/course';

function lesson(file: string, resources?: Resource[]): Lesson {
  return { index: 1, name: 'x', url: '', file, status: 'downloaded', has_description: false, resources };
}

describe('findCompanionMarkdown', () => {
  it('finds the same-stem .md of a video lesson', () => {
    const md = { name: 'Lesson MD', file: '07 - The Future.md' };
    const l = lesson('07 - The Future.mp4', [md, { name: 'Transcript', file: '07 - The Future.transcript.txt' }]);
    expect(findCompanionMarkdown(l)).toBe(md);
  });

  it('matches the stem case-insensitively and through a relative path', () => {
    const md = { name: 'Notes', file: 'x', path: 'mod/01 - intro.MD' };
    expect(findCompanionMarkdown(lesson('01 - Intro.mp4', [md]))).toBe(md);
  });

  it('ignores other markdown handouts and non-md resources', () => {
    const l = lesson('01 - Intro.mp4', [
      { name: 'Cheat Sheet', file: 'Cheat Sheet.md' },
      { name: 'Lesson PDF', file: '01 - Intro.pdf' },
    ]);
    expect(findCompanionMarkdown(l)).toBeNull();
  });

  it('returns null without resources, and for text or document lessons', () => {
    expect(findCompanionMarkdown(lesson('01 - Intro.mp4'))).toBeNull();
    expect(findCompanionMarkdown(lesson('01 - Intro.md', [{ name: 'Lesson MD', file: '01 - Intro.md' }]))).toBeNull();
    expect(findCompanionMarkdown(lesson('01 - Intro.pdf', [{ name: 'Lesson MD', file: '01 - Intro.md' }]))).toBeNull();
  });
});

describe('stripTitleHeading', () => {
  it('drops a leading H1 that repeats the title', () => {
    expect(stripTitleHeading('# The Future Of Cold Email\n\n# Body Heading\n\ntext', 'The Future Of Cold Email'))
      .toBe('# Body Heading\n\ntext');
  });

  it('keeps a leading H1 that differs from the title', () => {
    expect(stripTitleHeading('# Something Else\n\ntext', 'The Title')).toBe('# Something Else\n\ntext');
  });

  it('keeps markdown with no heading', () => {
    expect(stripTitleHeading('  just text\n', 'Title')).toBe('just text');
  });
});
