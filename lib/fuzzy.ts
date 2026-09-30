// Small fuzzy scorer for the command palette. No dependencies.
//
// Each query token must match at least one field of an item, either as a
// substring (strong) or as a subsequence (weaker, and only when the letters
// land on word starts or in runs, so scattered letters do not count). Field
// weights let a lesson title outrank its course or module name. All text is
// normalised once up front with `normalize`, so per-keystroke work is a few
// indexOf calls per item.

const DIACRITICS = /[̀-ͯ]/g;

export function normalize(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[\s·,/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isAlnum(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 97 && code <= 122) || // a-z (text is lowercased)
    code > 127 // treat other letters as word characters
  );
}

function isWordStart(s: string, i: number): boolean {
  return i === 0 || !isAlnum(s.charCodeAt(i - 1));
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

// True when a match ending at `end` ends a whole word. Number aware: "2" does
// not end a word inside "2.5", but does before the "x" of "2x".
function isWordEnd(s: string, end: number): boolean {
  if (end >= s.length) return true;
  const c = s.charCodeAt(end);
  if (isDigit(s.charCodeAt(end - 1))) {
    if (c === 46 && isDigit(s.charCodeAt(end + 1))) return false;
    if (c === 120 && (end + 1 >= s.length || !isAlnum(s.charCodeAt(end + 1)))) return true;
  }
  return !isAlnum(c);
}

function substringScore(t: string, s: string): number {
  const n = t.length;
  let best = 0;
  let p = s.indexOf(t);
  while (p !== -1) {
    let sc = n * 2 + (n - 1) * 3;
    if (p === 0) sc += 12;
    else if (isWordStart(s, p)) sc += 8;
    if (isWordEnd(s, p + n)) sc += 4;
    if (sc > best) best = sc;
    if (p === 0) break; // nothing later can beat a prefix
    p = s.indexOf(t, p + 1);
  }
  if (best > 0 && n === s.length) best += 10;
  return best;
}

// Greedy pass from a fixed first position. Each later letter continues the
// current run when it can, otherwise jumps to its next word-start occurrence,
// otherwise to its next occurrence anywhere.
function subsequenceFrom(t: string, s: string, first: number): number {
  let score = 5; // first letter sits on a word start
  let prev = first;
  for (let ti = 1; ti < t.length; ti++) {
    const ch = t.charCodeAt(ti);
    if (s.charCodeAt(prev + 1) === ch) {
      score += 4;
      prev += 1;
      continue;
    }
    let idx = s.indexOf(t[ti], prev + 1);
    if (idx === -1) return 0;
    let j = idx;
    while (j !== -1 && !isWordStart(s, j)) j = s.indexOf(t[ti], j + 1);
    if (j !== -1) {
      idx = j;
      score += 5;
    } else {
      score += 1 - Math.min(2, (idx - prev) * 0.1);
    }
    prev = idx;
  }
  return score;
}

// Subsequence match that must start on a word start (how people abbreviate).
// Weak, scattered matches are rejected: roughly 2.5 points per letter needed.
function subsequenceScore(t: string, s: string): number {
  const c0 = t[0];
  let best = 0;
  let tries = 0;
  let p = s.indexOf(c0);
  while (p !== -1 && tries < 3) {
    if (isWordStart(s, p)) {
      tries++;
      const sc = subsequenceFrom(t, s, p);
      if (sc === 0) break; // a later start cannot find the letters either
      if (sc > best) best = sc;
    }
    p = s.indexOf(c0, p + 1);
  }
  if (best < t.length * 2.5) return 0;
  return best * 0.7;
}

// Score one normalised token against one normalised string. 0 means no match.
export function scoreToken(token: string, text: string): number {
  if (!token || token.length > text.length) return 0;
  const sub = substringScore(token, text);
  if (sub > 0) return sub;
  // One or two letters as a scattered subsequence is noise, and costly.
  if (token.length < 3) return 0;
  return subsequenceScore(token, text);
}

export interface Field {
  text: string; // already normalised
  weight: number;
}

// Score a query (already tokenised) against an item's fields. The first field
// is the primary one (the title). Returns 0 when any token misses everywhere.
export function scoreFields(tokens: string[], fields: Field[], phrase?: string): number {
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const f of fields) {
      if (!f.text) continue;
      const sc = scoreToken(tok, f.text) * f.weight;
      if (sc > best) best = sc;
    }
    if (best === 0) return 0;
    total += best;
  }
  const primary = fields[0]?.text ?? "";
  if (phrase && tokens.length > 1 && primary.includes(phrase)) total += 10;
  // Shorter titles win ties.
  return Math.max(total * 0.5, total - primary.length * 0.02);
}

export interface Ranked<T> {
  item: T;
  score: number;
}

// Rank items and keep the best `limit`. Uses a bounded insertion list so we
// never sort the whole candidate set.
export function rank<T>(
  items: readonly T[],
  getFields: (item: T) => Field[],
  query: string,
  limit = Infinity
): Ranked<T>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(" ");
  // Longest token first: it is the likeliest to miss, which ends the item early.
  tokens.sort((a, b) => b.length - a.length);
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const score = scoreFields(tokens, getFields(item), phrase);
    if (score <= 0) continue;
    if (out.length >= limit && score <= out[out.length - 1].score) continue;
    let i = out.length;
    while (i > 0 && out[i - 1].score < score) i--;
    out.splice(i, 0, { item, score });
    if (out.length > limit) out.pop();
  }
  return out;
}
