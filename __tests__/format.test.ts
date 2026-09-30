import {
  categoryDurationSeconds,
  courseInitials,
  formatClock,
  formatDuration,
  formatHours,
  hueFor,
  percent,
  relativeTime,
  stringHash,
  sumDurations,
  titleWithoutAuthor,
} from '@/lib/format';
import cro from '@/test/fixtures/new-format/cro-masterclass.json';
import { CourseIndex } from '@/types/course';

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(45000)).toBe('12h 30m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(2700)).toBe('45m');
    expect(formatDuration(20)).toBe('<1m');
    expect(formatDuration(3599.6)).toBe('1h');
  });
  it('is null for missing or invalid values', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
  });
});

describe('formatClock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(452)).toBe('7:32');
    expect(formatClock(59.6)).toBe('1:00');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(5)).toBe('0:05');
  });
  it('is null when absent', () => {
    expect(formatClock(undefined)).toBeNull();
    expect(formatClock(null)).toBeNull();
    expect(formatClock(0)).toBeNull();
  });
});

describe('formatHours', () => {
  it('uses one decimal under ten hours', () => {
    expect(formatHours(5400)).toBe('1.5h');
    expect(formatHours(36000 * 4.26)).toBe('43h');
    expect(formatHours(null)).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = Date.UTC(2026, 8, 30, 12, 0, 0);
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  it('buckets by unit with plurals', () => {
    expect(relativeTime(ago(10), now)).toBe('just now');
    expect(relativeTime(ago(60), now)).toBe('1 minute ago');
    expect(relativeTime(ago(5 * 60), now)).toBe('5 minutes ago');
    expect(relativeTime(ago(3 * 3600), now)).toBe('3 hours ago');
    expect(relativeTime(ago(26 * 3600), now)).toBe('yesterday');
    expect(relativeTime(ago(2 * 86400), now)).toBe('2 days ago');
    expect(relativeTime(ago(14 * 86400), now)).toBe('2 weeks ago');
    expect(relativeTime(ago(65 * 86400), now)).toBe('2 months ago');
    expect(relativeTime(ago(800 * 86400), now)).toBe('2 years ago');
  });
  it('clamps future times and rejects bad input', () => {
    expect(relativeTime(new Date(now + 60000).toISOString(), now)).toBe('just now');
    expect(relativeTime(null, now)).toBeNull();
    expect(relativeTime('not a date', now)).toBeNull();
  });
});

describe('initials', () => {
  it('drops an Author - prefix (hyphen or en dash)', () => {
    expect(titleWithoutAuthor('Dylan Ander - CRO Masterclass')).toBe('CRO Masterclass');
    expect(titleWithoutAuthor('Christian Plascencia – GTM Elites')).toBe('GTM Elites');
    expect(titleWithoutAuthor('BowTiedTetra - Reddit SEO Protocol - Rank Reddit')).toBe(
      'Reddit SEO Protocol - Rank Reddit'
    );
    expect(titleWithoutAuthor('Charisma University')).toBe('Charisma University');
  });
  it('builds initials from the title proper', () => {
    expect(courseInitials('Dylan Ander - CRO Masterclass')).toBe('CM');
    expect(courseInitials('Lead Gen Jay - AI Automation Insiders')).toBe('AA');
    expect(courseInitials('Stirling Cooper - Sexual Dominance [Complete]')).toBe('SD');
    expect(courseInitials('cxl')).toBe('C');
    expect(courseInitials('Matthew Larsen - 10k Per Month')).toBe('1P');
    expect(courseInitials('---')).toBe('?');
  });
});

describe('stringHash / hueFor', () => {
  it('is deterministic and separates anagrams', () => {
    expect(stringHash('abc')).toBe(stringHash('abc'));
    expect(stringHash('abc')).not.toBe(stringHash('cba'));
    expect(hueFor('abc')).toBeGreaterThanOrEqual(0);
    expect(hueFor('abc')).toBeLessThan(360);
  });
  it('spreads real course ids across the hue wheel', () => {
    const ids = [
      'lead-gen-jay-ai-automation-insiders', 'cro-masterclass', 'matthew-larsen-10k-per-month',
      'charisma-university', 'cxl', 'osh-conversion-alchemy', 'sam-ovens-consulting-accelerator',
      'ty-frankel-linkedin-client-lab', 'ai-assisted-agency', 'global-investing-community',
      'introduction-to-psychology', 'communication-masterclass',
    ];
    const buckets = new Set(ids.map((id) => Math.floor(hueFor(id) / 30)));
    // 12 ids over 12 buckets of 30 degrees: a sum-of-char-codes hash clusters; this should not.
    expect(buckets.size).toBeGreaterThanOrEqual(7);
  });
});

describe('durations from an index', () => {
  it('sums only when every value is known', () => {
    expect(sumDurations([1, 2, 3])).toBe(6);
    expect(sumDurations([1, null, 3])).toBeNull();
    expect(sumDurations([])).toBeNull();
  });
  it('reads category totals from the new-format fixture and falls back to lesson sums', () => {
    const index = cro as unknown as CourseIndex;
    expect(categoryDurationSeconds(index.categories[2])).toBeCloseTo(14474.54, 1);
    const stripped = {
      ...index.categories[2],
      duration_seconds: undefined,
    };
    const lessonSum = stripped.sections
      .flatMap((s) => s.lessons)
      .reduce((n, l) => n + (l.duration_seconds ?? 0), 0);
    expect(categoryDurationSeconds(stripped)).toBeCloseTo(lessonSum, 5);
    const oldFormat = {
      sections: [{ lessons: [{}, {}] }],
    };
    expect(categoryDurationSeconds(oldFormat)).toBeNull();
  });
});

describe('percent', () => {
  it('rounds and guards zero', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});
