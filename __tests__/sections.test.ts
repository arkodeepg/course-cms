import { sectionsToOpen } from '@/lib/sections';
import cro from '@/test/fixtures/new-format/cro-masterclass.json';
import { CourseIndex } from '@/types/course';

const index = cro as unknown as CourseIndex;
const multi = index.categories[2]; // module 3: nine sections

describe('sectionsToOpen', () => {
  it('opens the first section of this module when nothing has activity', () => {
    expect([...sectionsToOpen(multi.sections, () => false)]).toEqual([0]);
  });
  it('opens only the sections holding activity', () => {
    const target = multi.sections[4].lessons[1].file;
    expect([...sectionsToOpen(multi.sections, (f) => f === target)]).toEqual([4]);
    const also = multi.sections[7].lessons[0].file;
    expect([...sectionsToOpen(multi.sections, (f) => f === target || f === also)]).toEqual([4, 7]);
  });
  it('does not depend on section.index numbering', () => {
    // Course-global numbering (a module whose sections start at 12) behaves the same.
    const renumbered = multi.sections.map((s, i) => ({ ...s, index: 12 + i }));
    expect([...sectionsToOpen(renumbered, () => false)]).toEqual([0]);
    const target = renumbered[2].lessons[0].file;
    expect([...sectionsToOpen(renumbered, (f) => f === target)]).toEqual([2]);
  });
  it('handles an empty module', () => {
    expect(sectionsToOpen([], () => true).size).toBe(0);
  });
});
