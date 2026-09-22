/**
 * Tags on the things a person files.
 *
 * One normalisation, used by the editor, the repository and every reader, so
 * that `Najdorf`, `najdorf ` and `NAJDORF` are one tag and not three shelves
 * with a third of the work on each. Nothing here infers a tag: a tag is a
 * string somebody typed, and an opening name Kingfisher recognised is not
 * one (`docs/design/organising-work.md`).
 */

/** At most this many per record; a list longer than this is a different tool. */
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;

/** Lower case, trimmed, inner whitespace collapsed to single hyphens. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[-,]+|[-,]+$/g, '')
    .slice(0, MAX_TAG_LENGTH);
}

/** Normalised, deduplicated, in the order first written, capped. */
export function normalizeTags(raw: readonly string[] | undefined): readonly string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** What a person typed into a tag field: commas or spaces, either way. */
export const parseTagInput = (text: string): readonly string[] =>
  normalizeTags(text.split(/[,\n]/));

export const formatTags = (tags: readonly string[]): string => tags.join(', ');

export interface TagCount {
  readonly tag: string;
  readonly count: number;
  /** The most recent `updatedAt` of anything carrying it. */
  readonly lastUsed: number;
}

/** Every tag in use, most recently used first, ties broken by count then name. */
export function tagCounts(
  records: readonly { readonly tags?: readonly string[]; readonly updatedAt?: number }[],
): readonly TagCount[] {
  const counts = new Map<string, { count: number; lastUsed: number }>();
  for (const record of records) {
    for (const tag of normalizeTags(record.tags)) {
      const entry = counts.get(tag) ?? { count: 0, lastUsed: 0 };
      entry.count += 1;
      entry.lastUsed = Math.max(entry.lastUsed, record.updatedAt ?? 0);
      counts.set(tag, entry);
    }
  }
  return [...counts.entries()]
    .map(([tag, entry]) => ({ tag, ...entry }))
    .sort((a, b) => b.lastUsed - a.lastUsed || b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Does this record carry every selected tag?
 *
 * "And", not "or": a filter that returns more as you add to it is not a
 * filter, and the whole point of several tags is narrowing to the study that
 * is about the Najdorf *and* for this opponent.
 */
export const matchesTags = (
  record: { readonly tags?: readonly string[] },
  selected: readonly string[],
): boolean => {
  if (selected.length === 0) return true;
  const has = new Set(normalizeTags(record.tags));
  return selected.every((tag) => has.has(tag));
};
