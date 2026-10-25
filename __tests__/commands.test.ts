import { PLAYER_COMMANDS, parseSeekTo, seekToCommandId } from '@/lib/commands';

describe('absolute seek command', () => {
  it('builds and parses seek-to ids', () => {
    expect(seekToCommandId(12.3456)).toBe('seek-to:12.346');
    expect(seekToCommandId(0)).toBe('seek-to:0');
    expect(parseSeekTo('seek-to:12.346')).toBeCloseTo(12.346);
    expect(parseSeekTo(seekToCommandId(3723)!)).toBe(3723);
  });

  it('rejects invalid values and other commands', () => {
    expect(seekToCommandId(-1)).toBeNull();
    expect(seekToCommandId(NaN)).toBeNull();
    expect(seekToCommandId(Infinity)).toBeNull();
    expect(parseSeekTo('seek:+10')).toBeNull();
    expect(parseSeekTo('seek-to:')).toBeNull();
    expect(parseSeekTo('seek-to:-5')).toBeNull();
    expect(parseSeekTo('seek-to:abc')).toBeNull();
  });

  it('does not collide with the relative seek prefix', () => {
    expect('seek-to:5'.startsWith('seek:')).toBe(false);
  });

  it('lists the captions toggle with its shortcut', () => {
    expect(PLAYER_COMMANDS).toContainEqual({ id: 'captions-toggle', label: 'Toggle captions', hint: 'C' });
  });
});
