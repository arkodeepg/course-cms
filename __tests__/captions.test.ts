import {
  activeCueIndex,
  cleanCueText,
  findMatches,
  formatCueTime,
  isVtt,
  parseCaptions,
  parseCueTime,
  parseSrt,
  parseVtt,
  srtToVtt,
  transcriptCues,
} from '@/lib/captions';

describe('parseCueTime', () => {
  it('reads hh:mm:ss.mmm, mm:ss.mmm and SRT commas', () => {
    expect(parseCueTime('00:00:01.629')).toBeCloseTo(1.629);
    expect(parseCueTime('01:02:03.004')).toBeCloseTo(3723.004);
    expect(parseCueTime('02:03.5')).toBeCloseTo(123.5);
    expect(parseCueTime('00:00:05,291')).toBeCloseTo(5.291);
    expect(parseCueTime('100:00:00.000')).toBe(360000);
    expect(parseCueTime('00:00:07')).toBe(7);
  });

  it('rejects garbage', () => {
    expect(parseCueTime('')).toBeNull();
    expect(parseCueTime('abc')).toBeNull();
    expect(parseCueTime('1.5')).toBeNull();
  });
});

describe('parseVtt', () => {
  const vtt = [
    '﻿WEBVTT',
    'Kind: captions',
    '',
    'NOTE this is a comment',
    'spanning lines --> with an arrow',
    '',
    'STYLE',
    '::cue { color: red }',
    '',
    'intro',
    '00:00:01.629 --> 00:00:05.291 align:start position:0%',
    'Welcome to <b>day one</b>.',
    '',
    '',
    '00:00:05.871 --> 00:00:12.453',
    '<v Jan>So five days,</v>',
    'five tasks &amp; one system',
    '',
  ].join('\r\n');

  it('returns timed cues, skipping header, NOTE and STYLE blocks', () => {
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1.629, end: 5.291, text: 'Welcome to day one.' });
    expect(cues[1].start).toBeCloseTo(5.871);
    expect(cues[1].text).toBe('So five days,\nfive tasks & one system');
  });

  it('strips inline word timings from YouTube auto captions', () => {
    const cues = parseVtt(
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello<00:00:00.500><c> there</c><00:00:01.000><c> friend</c>\n'
    );
    expect(cues[0].text).toBe('hello there friend');
  });

  it('sorts cues and drops empty ones', () => {
    const cues = parseVtt(
      'WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nsecond\n\n00:00:01.000 --> 00:00:02.000\nfirst\n\n00:00:03.000 --> 00:00:04.000\n   \n'
    );
    expect(cues.map((c) => c.text)).toEqual(['first', 'second']);
  });
});

describe('parseSrt', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:02,500\r\nFirst line\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000 X1:0 X2:0\r\n<i>Second</i>\r\nline two\r\n';

  it('reads numbered blocks with comma timings', () => {
    expect(parseSrt(srt)).toEqual([
      { start: 1, end: 2.5, text: 'First line' },
      { start: 3, end: 4, text: 'Second\nline two' },
    ]);
  });

  it('parseCaptions reads either format', () => {
    expect(parseCaptions(srt)).toHaveLength(2);
    expect(parseCaptions('WEBVTT\n\n00:01.000 --> 00:02.000\nhi\n')).toEqual([{ start: 1, end: 2, text: 'hi' }]);
  });
});

describe('srtToVtt', () => {
  it('adds the header, rewrites timings and drops counters', () => {
    const out = srtToVtt('1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:01:03,040 --> 00:01:04,000\n<i>World</i>\n');
    expect(out).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:01:03.040 --> 00:01:04.000\n<i>World</i>\n'
    );
    expect(isVtt(out)).toBe(true);
  });

  it('round-trips through the parser', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nA\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nB\r\n';
    expect(parseVtt(srtToVtt(srt))).toEqual(parseSrt(srt));
  });

  it('neutralises arrows in text, ASS tags and blank blocks', () => {
    const out = srtToVtt('﻿1\n00:00:01,000 --> 00:00:02,000\n{\\an8}a --> b\n\n\n2\nbroken\n');
    expect(out).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na -> b\n');
  });

  it('passes WebVTT through', () => {
    expect(srtToVtt('WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nx')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx\n'
    );
  });
});

describe('cleanCueText', () => {
  it('decodes entities and collapses whitespace', () => {
    expect(cleanCueText('a&nbsp;&nbsp;b &lt;c&gt; &#39;d&#x27;&lrm;')).toBe("a b <c> 'd'");
    expect(cleanCueText('  one \n\n two  ')).toBe('one\ntwo');
  });
});

describe('transcriptCues', () => {
  it('drops the rolled-over line of YouTube auto captions and bridge cues', () => {
    const cues = parseVtt(
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:02.000',
        'hello there',
        '',
        '00:00:02.000 --> 00:00:02.010',
        'hello there',
        '',
        '00:00:02.010 --> 00:00:04.000',
        'hello there',
        'general kenobi',
        '',
        '00:00:04.000 --> 00:00:06.000',
        'general kenobi',
        'you are a bold one',
      ].join('\n')
    );
    expect(transcriptCues(cues)).toEqual([
      { start: 0, end: 2.01, text: 'hello there' },
      { start: 2.01, end: 4, text: 'general kenobi' },
      { start: 4, end: 6, text: 'you are a bold one' },
    ]);
  });

  it('joins multi-line cues into one line', () => {
    expect(transcriptCues([{ start: 0, end: 1, text: 'a\nb' }])).toEqual([{ start: 0, end: 1, text: 'a b' }]);
  });
});

describe('activeCueIndex', () => {
  const cues = [
    { start: 1, end: 2, text: 'a' },
    { start: 3, end: 4, text: 'b' },
    { start: 5, end: 6, text: 'c' },
  ];
  it('finds the last started cue', () => {
    expect(activeCueIndex(cues, 0)).toBe(-1);
    expect(activeCueIndex(cues, 1)).toBe(0);
    expect(activeCueIndex(cues, 2.5)).toBe(0);
    expect(activeCueIndex(cues, 3.2)).toBe(1);
    expect(activeCueIndex(cues, 99)).toBe(2);
    expect(activeCueIndex([], 5)).toBe(-1);
  });
});

describe('findMatches', () => {
  it('is case-insensitive and non-overlapping', () => {
    expect(findMatches('Revenue, revenue, REVENUE', 'revenue')).toEqual([
      { start: 0, end: 7 },
      { start: 9, end: 16 },
      { start: 18, end: 25 },
    ]);
    expect(findMatches('aaaa', 'aa')).toHaveLength(2);
    expect(findMatches('abc', '   ')).toEqual([]);
  });
});

describe('formatCueTime', () => {
  it('formats like YouTube', () => {
    expect(formatCueTime(5.9)).toBe('0:05');
    expect(formatCueTime(754)).toBe('12:34');
    expect(formatCueTime(3723)).toBe('1:02:03');
  });
});
