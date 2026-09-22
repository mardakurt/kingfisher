/**
 * The round brief as one self-contained page.
 *
 * Same contract as publishing a study (`publish/chapter-html.ts`): inline
 * SVG boards, Unicode figurines, one `<style>` block, no script, no link, no
 * image, no absolute URL. A brief is read in a playing hall, on whatever is
 * to hand, and a document that needs a font to arrive is one that will arrive
 * without it.
 */

import { boardSvg } from '@/features/position-report/print';
import { escapeHtml } from '@/publish/chapter-html';

import type { RoundBrief } from './brief';

const STYLE = `
  @page { margin: 14mm; }
  body { font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #111; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 2px; }
  h2 { font-size: 11pt; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .04em; }
  header { border-bottom: 1px solid #999; padding-bottom: 10px; margin-bottom: 12px; }
  .meta { font-size: 10pt; color: #333; margin: 0; }
  section { break-inside: avoid; page-break-inside: avoid; margin: 0 0 12px; }
  .prov { font-size: 8.5pt; color: #555; font-style: italic; margin: 0 0 4px; }
  ul { margin: 0; padding-left: 16px; }
  li { margin: 0 0 2px; }
  .missing { font-size: 9.5pt; color: #555; margin: 0; }
  .cards { display: flex; flex-wrap: wrap; gap: 12px; }
  figure { break-inside: avoid; page-break-inside: avoid; margin: 0; width: 210px; }
  figcaption { font-size: 8.5pt; color: #333; margin-top: 3px; }
  footer { border-top: 1px solid #999; margin-top: 12px; padding-top: 6px;
           font-size: 8.5pt; color: #555; }
`;

export function briefToHtml(brief: RoundBrief, orientation: 'w' | 'b' = 'w'): string {
  const sections = brief.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2>` +
        `<p class="prov">From ${escapeHtml(section.provenance)}.</p>` +
        (section.lines.length
          ? `<ul>${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
          : `<p class="missing">${escapeHtml(section.missing ?? 'Nothing to report.')}</p>`) +
        '</section>',
    )
    .join('');
  const cards = brief.cards.length
    ? `<section><h2>Your sheet</h2><p class="prov">From the positions you put on it.</p>` +
      `<div class="cards">${brief.cards
        .map(
          (card) =>
            `<figure>${boardSvg(card.fen, orientation)}<figcaption>${escapeHtml(card.line)}` +
            (card.intend ? ` — intend ${escapeHtml(card.intend)}` : '') +
            (card.why ? `<br>${escapeHtml(card.why)}` : '') +
            '</figcaption></figure>',
        )
        .join('')}</div></section>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(brief.heading || 'Round brief')}</title>
<style>${STYLE}</style></head>
<body>
<header>
  <h1>${escapeHtml(brief.heading || 'Round brief')}</h1>
  <p class="meta">Playing ${brief.playing}${brief.date ? ` · ${escapeHtml(brief.date)}` : ''} · prepared ${escapeHtml(new Date(brief.generatedAt).toISOString().slice(0, 10))}</p>
</header>
${sections}${cards}
<footer>Every section above names the population it came from. Nothing here
predicts a move, and no figure from one population has been added to another.</footer>
</body></html>`;
}
