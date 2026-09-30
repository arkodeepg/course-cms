import { isOfficeKind, isViewable, kind, kindCounts } from '@/lib/resource-kinds';
import { isViewableExt } from '@/lib/palette';

describe('resource kinds', () => {
  it('classifies office, markdown, archive, ebook, data and subtitle files', () => {
    expect(kind('.docx')).toBe('doc');
    expect(kind('.DOC')).toBe('doc');
    expect(kind('xlsx')).toBe('sheet');
    expect(kind('.xls')).toBe('sheet');
    expect(kind('.pptx')).toBe('slides');
    expect(kind('.ppt')).toBe('slides');
    expect(kind('.md')).toBe('markdown');
    expect(kind('.zip')).toBe('archive');
    expect(kind('.epub')).toBe('ebook');
    expect(kind('.json')).toBe('json');
    expect(kind('.srt')).toBe('subtitle');
    expect(kind('.vtt')).toBe('subtitle');
    expect(kind('.pdf')).toBe('pdf');
    expect(kind('.exe')).toBe('none');
    expect(kind('')).toBe('none');
  });
  it('views text-like kinds inline and downloads office, archives and ebooks', () => {
    for (const e of ['.md', '.json', '.srt', '.vtt', '.pdf', '.csv', '.txt', '.png']) {
      expect(isViewable(e)).toBe(true);
    }
    for (const e of ['.docx', '.xlsx', '.pptx', '.zip', '.epub', '.bin']) {
      expect(isViewable(e)).toBe(false);
    }
    expect(isOfficeKind(kind('.docx'))).toBe(true);
    expect(isOfficeKind(kind('.pdf'))).toBe(false);
  });
  it('keeps the palette in step with the resources page', () => {
    for (const e of ['.md', '.PDF', '.docx', '.zip', '.vtt']) {
      expect(isViewableExt(e)).toBe(isViewable(e.toLowerCase()));
    }
  });
  it('counts kinds in first-seen order', () => {
    expect(kindCounts(['.pdf', '.docx', '.pdf', '.doc', '.md'])).toEqual([
      { kind: 'pdf', count: 2 },
      { kind: 'doc', count: 2 },
      { kind: 'markdown', count: 1 },
    ]);
  });
});
