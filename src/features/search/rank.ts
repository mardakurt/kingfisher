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
 *   score =  1000  exact
 *          +  450  wholeWords     (every query word is a whole word of the text;
 *                                  470 when they also begin a name)
 *          +  400  prefix
 *          +  200  token          (every query word appears somewhere)
 *          +   20  … per query word that is a whole word
 *          +  100  alias
 *          +  ≤90  fuzzy          (every query word within a typo of a word; 25 per edit)
 *          -   15  per qualifier  ("anti", "reversed") in the text but not the query
 *          +  ≤40  recencyBonus
 *          +  ±40  weight
 *
 * The bands are disjoint by construction: fuzzy never exceeds 90, so a
 * misspelling can never outrank a name that matches, however long the
 * query. (It could, once: fuzzy was 50 per matched character, and
 * "queen's gambit accepted" scored 1,650 on a London System line.)
 *
 * `recencyBonus` is the only non-pure factor. It is bounded, transparent
 * (lastOpenedAt - epochSeconds), and is never the dominant term — the
 * "exact" band outranks it by two orders of magnitude.
 *
 * `weight` is a bounded prominence an index may attach to an item — for an
 * opening, how many named sub-lines the dataset records beneath it, less a
 * little for every clause in its name — so that ties between equal-quality
 * matches ("Berlin" in the Ruy Lopez and in one Nimzo-Indian line) resolve
 * towards the entry a player almost certainly meant, and resolve the same
 * way tomorrow. It is never larger than the gap between two bands, so it
 * only ever orders within one.
 */

export interface Rankable {
  /** What gets matched against the query. */
  readonly text: string;
  /** Lower-cased, comma-joined alternative spellings: Polgar, Polgár, Pólgar. */
  readonly aliases?: readonly string[];
  /** Most recently the user opened this record, in epoch seconds. */
  readonly lastOpenedAt?: number;
  /** A bounded prominence bonus, -40..40; see the formula above. */
  readonly weight?: number;
  /**
   * Words of this item that reverse its meaning when the query does not
   * say them: the Anti-Sveshnikov is not what "Sveshnikov" asks for.
   */
  readonly qualifiers?: readonly string[];
}

export interface RankedHit<T> {
  readonly item: T;
  readonly score: number;
  /** Human-readable description of why this scored what it did. */
  readonly why: string;
}

const EMPTY = '';

/** What a query compares against, derived once per item rather than once per keystroke. */
interface Prepared {
  readonly haystack: string;
  readonly aliases: readonly string[];
  readonly words: ReadonlySet<string>;
  readonly qualifiers: readonly string[];
}

/*
  An index hands the same item objects to every query — the opening catalogue
  is several thousand of them — and normalising each one's text afresh on every
  keystroke was most of a search's cost. Keyed weakly, so an item nobody holds
  any more takes its preparation with it.
*/
const PREPARED = new WeakMap<Rankable, Prepared>();

function prepare(item: Rankable): Prepared {
  const known = PREPARED.get(item);
  if (known) return known;
  const haystack = normalize(item.text);
  const aliases = (item.aliases ?? []).map(normalize).filter((a) => a !== EMPTY);
  const words = new Set(wordsOf(haystack));
  for (const alias of aliases) for (const word of wordsOf(alias)) words.add(word);
  const qualifiers = (item.qualifiers ?? []).map(normalize);
  const prepared = { haystack, aliases, words, qualifiers };
  PREPARED.set(item, prepared);
  return prepared;
}

export function rank<T extends Rankable>(
  items: readonly T[],
  rawQuery: string,
): readonly RankedHit<T>[] {
  const needle = normalize(rawQuery);
  if (needle === EMPTY) return [];

  const nowSeconds = Date.now() / 1000;
  const scored: RankedHit<T>[] = [];

  const tokens = needle.split(/\s+/).filter((token) => token.length > 0);
  const queryWords = new Set(tokens.flatMap(wordsOf));

  for (const item of items) {
    const { haystack, aliases, words, qualifiers } = prepare(item);
    if (haystack === EMPTY) continue;

    const score = scoreText(
      haystack,
      aliases,
      words,
      needle,
      tokens,
      queryWords,
      item.lastOpenedAt,
      nowSeconds,
      item.weight,
      qualifiers,
    );
    if (score <= 0) continue;
    scored.push({ item, score, why: explain(haystack, aliases, words, needle, tokens) });
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
  words: ReadonlySet<string>,
  needle: string,
  tokens: readonly string[],
  queryWords: ReadonlySet<string>,
  lastOpenedAt: number | undefined,
  nowSeconds: number,
  weight = 0,
  qualifiers: readonly string[] = [],
): number {
  const penalty = qualifiers.filter((q) => !queryWords.has(q)).length * 15;
  const bonus =
    recencyBonus(lastOpenedAt, nowSeconds) + Math.max(-40, Math.min(40, weight)) - penalty;

  for (const candidate of [text, ...aliases]) {
    if (candidate === needle) return 1000 + bonus;
  }

  let score = 0;
  const whole = tokens.filter((token) => words.has(token)).length;
  const starts = [text, ...aliases].some((candidate) => candidate.startsWith(needle));
  // Whole words that also begin a name: "Slav" is the Slav before the Semi-Slav.
  if (tokens.length > 0 && whole === tokens.length) score = starts ? 470 : 450;
  else if (starts) score = 400;
  const allTokens = tokens.every(
    (token) => text.includes(token) || aliases.some((a) => a.includes(token)),
  );
  if (allTokens && tokens.length > 0) score = Math.max(score, 200 + 20 * whole);
  if (aliases.some((alias) => alias !== text) && text.includes(needle)) {
    score = Math.max(score, 100);
  }
  /*
    Fuzzy: a typo, not a resemblance. Every query word must be within a small
    edit distance of some word of the text — "najdrof" of "najdorf" — and the
    score falls with the edits. The previous measure, characters of the query
    found in order anywhere in the text, matched "dvoret" to "Winawer
    Variation, Retreat Variation", which is not a misspelling of anything.
  */
  if (score === 0 && tokens.length > 0) {
    let edits = 0;
    for (const token of tokens) {
      const allowed = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
      let best = allowed + 1;
      for (const word of words) {
        if (Math.abs(word.length - token.length) > allowed) continue;
        best = Math.min(best, levenshtein(word, token, allowed));
        if (best === 0) break;
      }
      if (best > allowed) {
        edits = -1;
        break;
      }
      edits += best;
    }
    if (edits >= 0) score = 90 - 25 * edits;
  }
  return score > 0 ? score + bonus : 0;
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

function explain(
  text: string,
  aliases: readonly string[],
  words: ReadonlySet<string>,
  needle: string,
  tokens: readonly string[],
): string {
  if (text === needle || aliases.includes(needle)) return 'exact';
  if (tokens.length > 0 && tokens.every((t) => words.has(t))) return 'whole words';
  if (text.startsWith(needle) || aliases.some((candidate) => candidate.startsWith(needle)))
    return 'prefix';
  if (tokens.every((t) => text.includes(t) || aliases.some((candidate) => candidate.includes(t))))
    return 'token';
  if (aliases.some(() => text.includes(needle))) return 'alias';
  return 'fuzzy';
}

/**
 * Normalise diacritics, lower-case, drop apostrophes, collapse whitespace.
 *
 * Apostrophes go because "Kings Indian" and "King's Indian" are the same
 * query typed by two people, and a typographic ’ is the same again.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, EMPTY)
    .replace(/['’]/g, EMPTY)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The whole words of a normalised string. Hyphenated compounds stay whole —
 * "anti-sveshnikov" is one word, and it is not the word "sveshnikov" — but
 * also contribute their last part, so "indian" is a word of "nimzo-indian".
 */
function wordsOf(value: string): readonly string[] {
  const words: string[] = [];
  for (const word of value.split(/[^a-z0-9-]+/)) {
    if (!word) continue;
    const trimmed = word.replace(/^-+|-+$/g, '');
    if (!trimmed) continue;
    words.push(trimmed);
    const dash = trimmed.lastIndexOf('-');
    if (dash !== -1) words.push(trimmed.slice(dash + 1));
  }
  return words;
}

/**
 * Bounded edit distance with adjacent transpositions counting one — "najdrof"
 * is one slip from "najdorf", not two. Caps at `limit` to refuse comparison
 * of very different strings.
 */
function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const width = b.length + 1;
  // Three rolling rows (two back, for a transposition), reused across calls:
  // a query is compared with every word of every entry that did not match.
  if (ROWS.length < width * 3) ROWS = new Int32Array(width * 3 * 2);
  let before = 0; // row i - 2
  let previous = width; // row i - 1
  let current = width * 2; // row i
  for (let j = 0; j < width; j += 1) ROWS[previous + j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    ROWS[current] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let value = Math.min(
        ROWS[previous + j]! + 1,
        ROWS[current + j - 1]! + 1,
        ROWS[previous + j - 1]! + cost,
      );
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        value = Math.min(value, ROWS[before + j - 2]! + 1);
      }
      ROWS[current + j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    const spare = before;
    before = previous;
    previous = current;
    current = spare;
  }
  return ROWS[previous + b.length]!;
}

let ROWS = new Int32Array(96);
