/**
 * Ranking for the command palette. Pure, so it is unit tested without a DOM.
 */

import type { Command } from './useCommands';

/**
 * Rank, then gather by section.
 *
 * Two things changed here in Phase 53, both from using the palette rather
 * than reading it.
 *
 * The first is what counts as a match. The old scorer accepted any
 * subsequence, so "opencarlsen" matched "Run two engines on this position"
 * (o…p…e…n…c…a…r…l…s…e…n, letters scattered across the whole line) and a
 * typo produced a confident wrong answer instead of "no match". `wordScore`
 * wants each word of the query either contiguous in the text — the common
 * case, scored highest, with a bonus at a word start — or a subsequence
 * with a small budget of skipped letters, which is what keeps "anlysis"
 * finding "New analysis" without letting anything find everything.
 *
 * The second is order. A globally ranked list interleaved sections — Player,
 * Game, Player, Game, Opening — and the section divider above each row
 * became a label on every row. Results are still ranked by score, but then
 * gathered: sections appear in the order of their best hit, and each section
 * lists its own hits in rank order. One divider per section, the way every
 * palette a person has used works.
 */
export function rank(commands: readonly Command[], query: string): Command[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...commands];

  const words = needle.split(/\s+/).filter((word) => word.length > 0);
  const scored: { command: Command; score: number }[] = [];

  for (const command of commands) {
    const title = command.title.toLowerCase();
    const haystack = `${title} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      // A hit in the title is worth more than the same hit in a keyword.
      const inTitle = wordScore(title, word);
      const anywhere = inTitle > 0 ? inTitle * 2 : wordScore(haystack, word);
      if (anywhere === 0) {
        score = 0;
        break;
      }
      score += anywhere;
    }
    if (score > 0) scored.push({ command, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const sections = new Map<string, Command[]>();
  for (const { command } of scored) {
    const section = sections.get(command.group);
    if (section) section.push(command);
    else sections.set(command.group, [command]);
  }
  return [...sections.values()].flat();
}

/**
 * How well one query word matches a text. 0 is "not at all".
 *
 * Contiguous first: `needle.length` letters in a row score ten each, plus a
 * bonus at the start of the text or of a word. Failing that, a subsequence
 * whose skipped letters fit inside a budget of one per two typed — enough
 * for a dropped or transposed letter, not enough for a different word.
 */
export function wordScore(haystack: string, needle: string): number {
  const at = haystack.indexOf(needle);
  if (at !== -1) {
    return needle.length * 10 + (at === 0 ? 14 : haystack[at - 1] === ' ' ? 8 : 0);
  }

  let score = 0;
  let cursor = 0;
  let skipped = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return 0;
    if (cursor > 0) skipped += found - cursor;
    // Matching at a word boundary is a much stronger signal than mid-word.
    score += found === cursor ? 3 : haystack[found - 1] === ' ' ? 2 : 1;
    cursor = found + 1;
  }
  return skipped <= Math.max(1, Math.floor(needle.length / 2)) ? score : 0;
}
