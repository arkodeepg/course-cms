import { isGroupOpen, nextToggle } from '@/lib/resource-groups';

describe('resource group expansion', () => {
  const phone = { compact: true, filtering: false };
  const desktop = { compact: false, filtering: false };

  it('opens every group on wide screens by default', () => {
    expect(isGroupOpen(undefined, 0, desktop)).toBe(true);
    expect(isGroupOpen(undefined, 7, desktop)).toBe(true);
  });

  it('opens only the first group on phones by default', () => {
    expect(isGroupOpen(undefined, 0, phone)).toBe(true);
    expect(isGroupOpen(undefined, 1, phone)).toBe(false);
    expect(isGroupOpen(undefined, 30, phone)).toBe(false);
  });

  it('opens every matching group while a filter is active', () => {
    const filtering = { compact: true, filtering: true };
    expect(isGroupOpen(undefined, 5, filtering)).toBe(true);
  });

  it('lets the reader override the default either way', () => {
    expect(isGroupOpen('open', 4, phone)).toBe(true);
    expect(isGroupOpen('closed', 0, phone)).toBe(false);
    expect(isGroupOpen('closed', 0, desktop)).toBe(false);
    expect(isGroupOpen('closed', 2, { compact: true, filtering: true })).toBe(false);
  });

  it('flips what the reader currently sees', () => {
    expect(nextToggle(true)).toBe('closed');
    expect(nextToggle(false)).toBe('open');
  });
});
