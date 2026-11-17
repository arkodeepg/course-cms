import { isStarted, lessonSecondsLeft, timeTotals, watchedPercent } from '@/lib/time-left';

const lessons = [
  { file: 'a.mp4', duration_seconds: 600 },
  { file: 'b.mp4', duration_seconds: 300 },
  { file: 'c.pdf', duration_seconds: null },
  { file: 'd.mp4' },
  { file: 'e.mp4', duration_seconds: 900 },
];

describe('lessonSecondsLeft', () => {
  it('is the full length for an unstarted lesson', () => {
    expect(lessonSecondsLeft(lessons[0], new Set(), {})).toBe(600);
  });
  it('is zero for a completed lesson, whatever the position', () => {
    expect(lessonSecondsLeft(lessons[0], new Set(['a.mp4']), { 'a.mp4': 100 })).toBe(0);
  });
  it('subtracts the saved position and clamps at zero', () => {
    expect(lessonSecondsLeft(lessons[0], new Set(), { 'a.mp4': 250 })).toBe(350);
    expect(lessonSecondsLeft(lessons[0], new Set(), { 'a.mp4': 9999 })).toBe(0);
    expect(lessonSecondsLeft(lessons[0], new Set(), { 'a.mp4': -5 })).toBe(600);
  });
  it('is null when the length is unknown', () => {
    expect(lessonSecondsLeft(lessons[2], new Set(), {})).toBeNull();
    expect(lessonSecondsLeft(lessons[3], new Set(['d.mp4']), {})).toBeNull();
  });
});

describe('timeTotals', () => {
  it('sums only known durations', () => {
    expect(timeTotals(lessons, new Set(), {})).toEqual({ total: 1800, left: 1800 });
  });
  it('removes finished lessons and watched positions', () => {
    const t = timeTotals(lessons, new Set(['a.mp4', 'c.pdf']), { 'b.mp4': 100 });
    expect(t).toEqual({ total: 1800, left: 200 + 900 });
    expect(watchedPercent(t)).toBeCloseTo((700 / 1800) * 100);
  });
  it('is zero for an untimed group', () => {
    const t = timeTotals([lessons[2], lessons[3]], new Set(), {});
    expect(t).toEqual({ total: 0, left: 0 });
    expect(watchedPercent(t)).toBe(0);
  });
});

describe('isStarted', () => {
  it('detects completion or a saved position', () => {
    expect(isStarted(lessons, new Set(), {})).toBe(false);
    expect(isStarted(lessons, new Set(['c.pdf']), {})).toBe(true);
    expect(isStarted(lessons, new Set(), { 'e.mp4': 30 })).toBe(true);
    expect(isStarted(lessons, new Set(), { 'e.mp4': 0 })).toBe(false);
  });
});
