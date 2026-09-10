/**
 * Deterministic ranking for the universal search.
 *
 * The brief is explicit: no opaque AI score, no surprise ordering. A search
 * for "Najdorf" must return the Najdorf ahead of a recent study whose
 * title happens to contain the letter N, and the same query tomorrow must
 * produce the same result today. This module is where the formula lives,
 * and the formula is documented in one place so a contributor does not
 * invent a new ranking by accident.
 *
 *   score =  1000 * exact
 *          +  400 * prefix
 *          +  200 * token
 *          +  100 * alias
 *          +   50 * subsequence  (per matched character, no penalty for gaps)
 *          -    5 * editDistance
 *          +   10 * recencyBonus (capped at 40)
 *
 * `recencyBonus` is the only non-pure factor. It is bounded, transparent
 * (lastOpenedAt - epochSeconds), and is never the dominant term — the
 * "exact" band outranks it by two orders of magnitude.
 */

export interface Rankable {
  /** What gets matched against the query. */
  readonly text: string;
  /** Lower-cased, comma-joined alternative spellings: Polgar, Polgár, Pólgar. */
  readonly aliases?: readonly string[];
  /** Most recently the user opened this record, in epoch seconds. */
  readonly lastOpenedAt?: number;
}

export interface RankedHit<T> {
  readonly item: T;
  readonly score: number;
  /** Human-readable description of why this scored what it did. */
  readonly why: string;
}

const EMPTY = '';

export function rank<T extends Rankable>(
  items: readonly T[],
  rawQuery: string,
): readonly RankedHit<T>[] {
  const needle = normalize(rawQuery);
  if (needle === EMPTY) return [];

  const nowSeconds = Date.now() / 1000;
  const scored: RankedHit<T>[] = [];

  for (const item of items) {
    const haystack = normalize(item.text);
    if (haystack === EMPTY) continue;

    const aliases = (item.aliases ?? []).map(normalize).filter((a) => a !== EMPTY);
    const score = scoreText(haystack, aliases, needle, item.lastOpenedAt, nowSeconds);
    if (score <= 0) continue;
    scored.push({ item, score, why: explain(haystack, aliases, needle) });
  }

  scored.sort((a, b) => b.score - a.score || stableTiebreak(a, b));
  return scored;
}

function stableTiebreak<T extends Rankable>(a: RankedHit<T>, b: RankedHit<T>): number {
  return a.item.text.localeCompare(b.item.text);
}

function scoreText(
  text: string,
  aliases: readonly string[],
  needle: string,
  lastOpenedAt: number | undefined,
  nowSeconds: number,
): number {
  let score = 0;
  let why: string | null = null;
  for (const candidate of [text, ...aliases]) {
    if (candidate === needle) {
      return 1000 + recencyBonus(lastOpenedAt, nowSeconds);
    }
  }
  for (const candidate of [text, ...aliases]) {
    if (candidate.startsWith(needle)) {
      score = Math.max(score, 400 + recencyBonus(lastOpenedAt, nowSeconds));
      why ??= 'prefix';
    }
  }
  const tokens = needle.split(/\s+/);
  const allTokens = tokens.every(
    (token) => text.includes(token) || aliases.some((a) => a.includes(token)),
  );
  if (allTokens && tokens.length > 0) {
    score = Math.max(score, 200 + recencyBonus(lastOpenedAt, nowSeconds));
    why ??= 'token';
  }
  for (const alias of aliases) {
    if (alias === text) continue;
    if (text.includes(needle)) {
      score = Math.max(score, 100 + recencyBonus(lastOpenedAt, nowSeconds));
      why ??= 'alias';
    }
  }
  // Fuzzy: a small per-character reward plus a small edit-distance penalty.
  const subs = subsequenceScore(text, needle);
  if (subs > 0) {
    const dist = levenshtein(text, needle, 6);
    const fuzzy = 50 * subs - 5 * dist + recencyBonus(lastOpenedAt, nowSeconds);
    if (fuzzy > score) {
      score = fuzzy;
      why = 'fuzzy';
    }
  }
  void why;
  return score;
}

function recencyBonus(lastOpenedAt: number | undefined, nowSeconds: number): number {
  if (!lastOpenedAt) return 0;
  const ageDays = (nowSeconds - lastOpenedAt) / 86_400;
  if (ageDays < 0) return 0;
  if (ageDays < 1) return 40;
  if (ageDays < 7) return 25;
  if (ageDays < 30) return 10;
  return 0;
}

function explain(text: string, aliases: readonly string[], needle: string): string {
  if (text === needle || aliases.includes(needle)) return 'exact';
  if (text.startsWith(needle) || aliases.some((candidate) => candidate.startsWith(needle)))
    return 'prefix';
  const tokens = needle.split(/\s+/);
  if (tokens.every((t) => text.includes(t) || aliases.some((candidate) => candidate.includes(t))))
    return 'token';
  if (aliases.some(() => text.includes(needle))) return 'alias';
  return 'fuzzy';
}

/** Normalise diacritics, lower-case, collapse whitespace. */
function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, EMPTY)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function subsequenceScore(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let cursor = 0;
  let score = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return 0;
    score += found === cursor ? 1.5 : 1;
    cursor = found + 1;
  }
  return score;
}

/** Bounded Levenshtein — caps at `limit` to refuse comparison of very different strings. */
function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const dp = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) dp[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min((dp[j] ?? 0) + 1, (dp[j - 1] ?? 0) + 1, prev + cost);
      prev = tmp;
      if (dp[j]! < rowMin) rowMin = dp[j]!;
    }
    if (rowMin > limit) return limit + 1;
  }
  return dp[b.length] ?? 0;
}
