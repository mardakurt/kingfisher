/**
 * A study chapter as one self-contained document.
 *
 * The research's nineteenth row is "publishing: print, web, PDF, share a
 * link", and ChessBase has all of it. What a coach actually needs is smaller
 * and harder to get: a file they can send that still reads on a machine with
 * no Kingfisher, no network, and no fonts installed.
 *
 * So the output is one HTML file with everything inside it — the boards are
 * inline SVG, the figurines are Unicode, the styles are in a `<style>` block,
 * and there is not one `<script>`, `<link>` or `<img>` in it. The same bytes
 * are what the print dialog renders, which is how "save as PDF" produces the
 * document somebody was looking at rather than a second, subtly different
 * one.
 *
 * Pure: a study, a chapter and options in, a string out.
 */

import { nagSymbol } from '@/chess/annotations';
import { chapterQuestions, type ChapterQuestion } from '@/chess/tree/questions';
import { boardSvg } from '@/features/position-report/print';
import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import type { ChapterRecord, StudyRecord } from '@/persistence/types';

export interface PublishOptions {
  /** A diagram at every position the author marked critical. */
  readonly diagrams?: boolean;
  readonly orientation?: 'w' | 'b';
  /** What to print under the title; the publisher's own name, if they want one. */
  readonly byline?: string;
  /** Fixed for a deterministic document in tests. */
  readonly now?: number;
  /**
   * Phase 84: a worksheet — each chapter's questions as positions to solve,
   * the game itself withheld, and every solution on the last page, as a coach
   * hands it out. Chapters without questions are left out.
   */
  readonly worksheet?: boolean;
}

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const moveNumber = (ply: number): number => Math.floor((ply - 1) / 2) + 1;
const isWhiteMove = (ply: number): boolean => ply % 2 === 1;

/** `23.` or `23…`, printed when the number is needed rather than always. */
function numberFor(node: MoveNode, forced: boolean): string {
  if (isWhiteMove(node.ply)) return `${moveNumber(node.ply)}.`;
  return forced ? `${moveNumber(node.ply)}…` : '';
}

interface Walk {
  readonly html: string;
  /** Diagrams collected in order, as `[nodeId, svg]`. */
  readonly diagrams: readonly {
    readonly id: NodeId;
    readonly svg: string;
    readonly caption: string;
  }[];
}

/**
 * One line of moves, with its variations nested where they belong.
 *
 * The shape is PGN's, because that is the shape every chess reader already
 * knows: main line in the running text, alternatives in brackets after the
 * move they replace, comments in braces' place as ordinary prose.
 */
function renderLine(
  tree: GameTree,
  start: NodeId,
  options: PublishOptions,
  diagrams: { id: NodeId; svg: string; caption: string }[],
  depth: number,
): string {
  const parts: string[] = [];
  let cursor: MoveNode | undefined = tree.nodes[start];
  // A number is forced after a comment or a variation, as in a printed book.
  let forceNumber = true;
  while (cursor?.children.length) {
    const [mainId, ...alternatives] = cursor.children;
    const main = mainId ? tree.nodes[mainId] : undefined;
    if (!main?.move) break;

    if (main.preComment) {
      parts.push(`<span class="c">${escapeHtml(main.preComment)}</span>`);
      forceNumber = true;
    }
    const nags = main.nags.map((code) => nagSymbol(code)).join('');
    parts.push(
      `<span class="m"${main.meta.critical ? ` data-critical="${escapeHtml(main.meta.critical)}"` : ''}>` +
        `${escapeHtml(numberFor(main, forceNumber))}${escapeHtml(main.move.san)}${escapeHtml(nags)}</span>`,
    );
    forceNumber = false;

    if (main.comment) {
      parts.push(`<span class="c">${escapeHtml(main.comment)}</span>`);
      forceNumber = true;
    }
    if (options.diagrams && main.meta.critical) {
      diagrams.push({
        id: main.id,
        svg: boardSvg(main.fen, options.orientation ?? 'w'),
        caption: `After ${moveNumber(main.ply)}${isWhiteMove(main.ply) ? '.' : '…'} ${main.move.san}`,
      });
      parts.push(`<span class="dref">[diagram]</span>`);
    }

    for (const alternativeId of alternatives) {
      const alternative = tree.nodes[alternativeId];
      if (!alternative?.move) continue;
      parts.push(
        `<span class="v v${Math.min(depth + 1, 3)}">(${renderFrom(tree, alternative, options, diagrams, depth + 1)})</span>`,
      );
      forceNumber = true;
    }
    cursor = main;
  }
  return parts.join(' ');
}

/** A variation: its first move, then the rest of that line. */
function renderFrom(
  tree: GameTree,
  node: MoveNode,
  options: PublishOptions,
  diagrams: { id: NodeId; svg: string; caption: string }[],
  depth: number,
): string {
  const parts: string[] = [];
  if (node.preComment) parts.push(`<span class="c">${escapeHtml(node.preComment)}</span>`);
  const nags = node.nags.map((code) => nagSymbol(code)).join('');
  parts.push(
    `<span class="m">${escapeHtml(numberFor(node, true))}${escapeHtml(node.move!.san)}${escapeHtml(nags)}</span>`,
  );
  if (node.comment) parts.push(`<span class="c">${escapeHtml(node.comment)}</span>`);
  const rest = renderLine(tree, node.id, options, diagrams, depth);
  if (rest) parts.push(rest);
  return parts.join(' ');
}

export function chapterBody(chapter: ChapterRecord, options: PublishOptions): Walk {
  const diagrams: { id: NodeId; svg: string; caption: string }[] = [];
  const root = chapter.tree.nodes[chapter.tree.rootId];
  const opening = root?.comment ? `<p class="c lead">${escapeHtml(root.comment)}</p>` : '';
  const html = renderLine(chapter.tree, chapter.tree.rootId, options, diagrams, 0);
  return { html: `${opening}<p class="movetext">${html || '<em>No moves.</em>'}</p>`, diagrams };
}

const STYLE = `
  @page { margin: 16mm; }
  body { font: 11pt/1.5 Georgia, "Times New Roman", serif; color: #111; margin: 0; }
  header { border-bottom: 1px solid #999; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 17pt; margin: 0 0 2px; }
  h2 { font-size: 13pt; margin: 18px 0 6px; break-after: avoid; page-break-after: avoid; }
  .study { font-size: 10pt; color: #444; margin: 0; }
  .byline { font-size: 10pt; color: #444; margin: 4px 0 0; }
  .movetext { margin: 0 0 10px; text-align: justify; }
  .m { font-weight: 600; white-space: nowrap; }
  .c { font-style: italic; color: #333; }
  .lead { margin: 0 0 10px; }
  .v { color: #333; }
  .v2 { font-size: 10pt; }
  .v3 { font-size: 9.5pt; }
  .dref { font-size: 9pt; color: #666; }
  figure { break-inside: avoid; page-break-inside: avoid; margin: 10px 0; text-align: center; }
  figcaption { font-size: 9pt; color: #444; margin-top: 4px; }
  .tags { font-size: 9pt; color: #555; margin: 4px 0 0; }
  footer { border-top: 1px solid #999; margin-top: 16px; padding-top: 8px;
           font-size: 8.5pt; color: #555; }
`;

const questionLabel = (question: ChapterQuestion) =>
  `${moveNumber(question.ply)}${isWhiteMove(question.ply) ? '.' : '…'} ${question.solutionSan.join(' or ')}`;

/** A chapter's questions, numbered from `first`, as figures to solve. */
function worksheetSection(chapter: ChapterRecord, first: number): string {
  return chapterQuestions(chapter.tree)
    .map((question, index) => {
      const side = isWhiteMove(question.ply) ? 'White' : 'Black';
      // Phase 85: the author's points and time limit, where set, as ChessBase prints them.
      const terms = [
        question.points !== undefined
          ? `${question.points} ${question.points === 1 ? 'point' : 'points'}`
          : null,
        question.timeLimitSeconds !== undefined ? `${question.timeLimitSeconds} s` : null,
      ].filter(Boolean);
      return (
        `<figure class="q"><figcaption><strong>${first + index}.</strong> ${side} to play. ` +
        `${escapeHtml(question.prompt)}${terms.length ? ` <em>(${terms.join(' · ')})</em>` : ''}</figcaption>` +
        `${boardSvg(question.fen, isWhiteMove(question.ply) ? 'w' : 'b')}</figure>`
      );
    })
    .join('');
}

export interface PublishInput {
  readonly study: StudyRecord;
  readonly chapters: readonly ChapterRecord[];
  readonly options?: PublishOptions;
}

/**
 * The whole document.
 *
 * Deliberately no script, no link, no external image: a file somebody is
 * emailed opens on a machine that has never heard of this application, and
 * a document that needs a font or a stylesheet to arrive is one that will
 * one day arrive without them.
 */
export function publishHtml({ study, chapters, options = {} }: PublishInput): string {
  const stamp = new Date(options.now ?? Date.now());
  if (options.worksheet) return worksheetHtml({ study, chapters, options }, stamp);
  const body = chapters
    .map((chapter) => {
      const { html, diagrams } = chapterBody(chapter, options);
      const figures = diagrams
        .map(
          (diagram) =>
            `<figure>${diagram.svg}<figcaption>${escapeHtml(diagram.caption)}</figcaption></figure>`,
        )
        .join('');
      const tags = chapter.tags?.length
        ? `<p class="tags">Tags: ${escapeHtml(chapter.tags.join(', '))}</p>`
        : '';
      return `<section><h2>${escapeHtml(chapter.title)}</h2>${tags}${html}${figures}</section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(study.title)}</title>
<style>${STYLE}</style></head>
<body>
<header>
  <h1>${escapeHtml(study.title)}</h1>
  ${study.description ? `<p class="study">${escapeHtml(study.description)}</p>` : ''}
  ${options.byline ? `<p class="byline">${escapeHtml(options.byline)}</p>` : ''}
  <p class="byline">${chapters.length} chapter${chapters.length === 1 ? '' : 's'} · published ${escapeHtml(stamp.toISOString().slice(0, 10))}</p>
</header>
${body}
<footer>Published from Kingfisher. Comments and variations are the author's own;
any engine figure quoted in them is a measurement taken at the moment it was
written, not a standing fact.</footer>
</body></html>`;
}

/** The worksheet: questions first, solutions on their own last page. */
function worksheetHtml({ study, chapters, options = {} }: PublishInput, stamp: Date): string {
  let number = 1;
  const sections: string[] = [];
  const solutions: string[] = [];
  for (const chapter of chapters) {
    const questions = chapterQuestions(chapter.tree);
    if (questions.length === 0) continue;
    sections.push(
      `<section><h2>${escapeHtml(chapter.title)}</h2><div class="sheet">${worksheetSection(chapter, number)}</div></section>`,
    );
    for (const question of questions) {
      solutions.push(
        `<li value="${number}"><span class="m">${escapeHtml(questionLabel(question))}</span>` +
          `${question.explanation ? ` <span class="c">${escapeHtml(question.explanation)}</span>` : ''}</li>`,
      );
      number += 1;
    }
  }
  const count = number - 1;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(study.title)} — worksheet</title>
<style>${STYLE}
  .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(62mm, 1fr)); gap: 8mm 6mm; }
  .q figcaption { text-align: left; margin: 0 0 4px; font-size: 10pt; color: #111; }
  .solutions { break-before: page; page-break-before: always; }
  .solutions li { margin: 3px 0; }
</style></head>
<body>
<header>
  <h1>${escapeHtml(study.title)}</h1>
  ${options.byline ? `<p class="byline">${escapeHtml(options.byline)}</p>` : ''}
  <p class="byline">Worksheet · ${count} question${count === 1 ? '' : 's'} · ${escapeHtml(stamp.toISOString().slice(0, 10))}</p>
</header>
${sections.join('') || '<p><em>None of these chapters has a question.</em></p>'}
<section class="solutions"><h2>Solutions</h2><ol>${solutions.join('')}</ol></section>
<footer>Published from Kingfisher. Each answer is the move the author marked;
another move the author marked good is accepted too.</footer>
</body></html>`;
}
