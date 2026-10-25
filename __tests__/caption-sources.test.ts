import { detectCaptionSources, isSameStem } from '@/lib/caption-sources';

const r = (name: string, file: string, path?: string) => (path ? { name, file, path } : { name, file });

describe('isSameStem', () => {
  it('matches the video stem with an optional dotted suffix', () => {
    expect(isSameStem('01-Lesson.mp4', '01-Lesson.vtt')).toBe(true);
    expect(isSameStem('01-Lesson.mp4', '01-Lesson.en.vtt')).toBe(true);
    expect(isSameStem('01-Lesson.mp4', '../subs/01-lesson.EN.srt')).toBe(true);
    expect(isSameStem('01-Lesson.mp4', '01-Lesson extra.vtt')).toBe(false);
    expect(isSameStem('01-Lesson.mp4', '01-en-auto.vtt')).toBe(false);
  });
});

describe('detectCaptionSources', () => {
  it('returns nothing for a lesson without resources', () => {
    expect(detectCaptionSources({ file: 'a.mp4' })).toEqual({ timed: null, text: null });
    expect(detectCaptionSources({ file: 'a.mp4', resources: [] })).toEqual({ timed: null, text: null });
  });

  it('takes a different-stem .vtt when it is the only one (Revenue Reset)', () => {
    const lesson = {
      file: '01-Revenue Audit.mp4',
      resources: [
        r('Lesson PDF', '01-Revenue Audit.pdf'),
        r('revenue-audit-template', '01-revenue-audit-template.pdf'),
        r('en-auto', '01-en-auto.vtt'),
      ],
    };
    expect(detectCaptionSources(lesson)).toEqual({ timed: r('en-auto', '01-en-auto.vtt'), text: null });
  });

  it('prefers a same-stem .vtt over any other .vtt and over .srt', () => {
    const lesson = {
      file: '01-Your Wiring Explained.mp4',
      resources: [
        r('Subtitles', '01-Your Wiring Explained.srt'),
        r('other', 'other.vtt'),
        r('Captions', '01-Your Wiring Explained.en.vtt'),
      ],
    };
    expect(detectCaptionSources(lesson).timed?.file).toBe('01-Your Wiring Explained.en.vtt');
  });

  it('falls back to any .vtt, then a same-stem .srt, then any .srt', () => {
    expect(
      detectCaptionSources({ file: 'L.mp4', resources: [r('s', 'L.srt'), r('v', 'x.vtt')] }).timed?.file
    ).toBe('x.vtt');
    expect(
      detectCaptionSources({ file: 'L.mp4', resources: [r('a', 'zz.srt'), r('b', 'L.srt')] }).timed?.file
    ).toBe('L.srt');
    expect(detectCaptionSources({ file: 'L.mp4', resources: [r('a', 'zz.SRT')] }).timed?.file).toBe('zz.SRT');
  });

  it('handles relative paths such as ../x.vtt and resource.path', () => {
    expect(
      detectCaptionSources({ file: 'L.mp4', resources: [r('pdf', '../L.pdf'), r('cc', '../L.en.vtt')] }).timed?.file
    ).toBe('../L.en.vtt');
    const viaPath = r('cc', 'ignored', 'Module/Section/L.vtt');
    expect(detectCaptionSources({ file: 'L.mp4', resources: [r('o', 'o.vtt'), viaPath] }).timed).toEqual(viaPath);
  });

  it('finds untimed transcripts by name, filename, or stem', () => {
    expect(
      detectCaptionSources({
        file: '01-Your Wiring Explained.mp4',
        resources: [r('your-wiring-transcript', '01-your-wiring-transcript.txt')],
      })
    ).toEqual({ timed: null, text: r('your-wiring-transcript', '01-your-wiring-transcript.txt') });
    expect(
      detectCaptionSources({ file: 'L.mp4', resources: [r('Notes', 'n.txt'), r('Transcript', 'L text.txt')] }).text?.name
    ).toBe('Transcript');
    expect(detectCaptionSources({ file: 'L.mp4', resources: [r('Words', '../L.txt')] }).text?.file).toBe('../L.txt');
  });

  it('ignores .txt resources that are not transcripts', () => {
    const lesson = {
      file: '01-Intro.mp4',
      resources: [r('Description', '01-Intro_description.txt'), r('Group Buy', 'Group Buy.txt')],
    };
    expect(detectCaptionSources(lesson)).toEqual({ timed: null, text: null });
  });

  it('reports both when a lesson has captions and a transcript', () => {
    const out = detectCaptionSources({
      file: 'L.mp4',
      resources: [r('Transcript', 'L.txt'), r('cc', 'L.vtt')],
    });
    expect(out.timed?.file).toBe('L.vtt');
    expect(out.text?.file).toBe('L.txt');
  });
});
