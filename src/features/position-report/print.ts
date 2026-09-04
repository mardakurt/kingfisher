/**
 * Printing a position report.
 *
 * A printed report is the version somebody takes to a board, so the rules are
 * different from the panel's. Everything is expanded — no scroll, no
 * truncation, no "and 4 more" — and every provenance line survives, because a
 * page that keeps the evidence and drops the attributions is a page whose
 * claims cannot be checked away from the machine.
 *
 * Rendered as a standalone document in a hidden iframe rather than by styling
 * the application away with `@media print`. Three reasons, and the third is the
 * one that decided it: the panel is a narrow scrolling column and would print
 * as one, the report is often open inside a dialog whose stacking context
 * fights `page-break`, and printing the live DOM would print whatever the
 * engine happened to have written into it a moment earlier — which is exactly
 * the "transient data as evergreen truth" this feature is supposed to refuse.
 *
 * The board is drawn as inline SVG from the FEN, with no external stylesheet
 * and no font file, so what comes out of the printer does not depend on
 * anything having loaded.
 */

import { parseFen } from '@/chess/fen';
import { isOk } from '@/chess/result';
import type { Fen } from '@/chess/types';

import type { PositionReport } from './report';

const escape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Unicode chess figurines, which need no font file to be present. */
const GLYPHS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

const LETTER: Record<string, string> = {
  k: 'K',
  q: 'Q',
  r: 'R',
  b: 'B',
  n: 'N',
  p: 'P',
};

/**
 * The position, as an SVG a printer can render on its own.
 *
 * Deliberately not the application's board component: that one depends on a
 * piece-set fetch, a theme and a measured container, none of which a print
 * document should have to wait for. Figurines are Unicode, and the squares are
 * two greys — a printed board wants contrast, not the screen's colours.
 */
export function boardSvg(fen: Fen | string, orientation: 'w' | 'b' = 'w'): string {
  const parsed = parseFen(String(fen));
  if (!isOk(parsed)) return '';
  const board = parsed.value.board;
  const size = 36;
  const cells: string[] = [];

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      // Row 0 is the top of the printed page: rank 8 for White, rank 1 for Black.
      const rank = orientation === 'w' ? 7 - row : row;
      const file = orientation === 'w' ? column : 7 - column;
      const index = rank * 8 + file;
      const light = (rank + file) % 2 === 1;
      const x = column * size;
      const y = row * size;
      cells.push(
        `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${light ? '#f0ece4' : '#b8ab97'}"/>`,
      );
      const piece = board[index];
      if (!piece) continue;
      const letter = piece.color === 'w' ? LETTER[piece.type] : (piece.type as string);
      const glyph = GLYPHS[letter ?? ''] ?? '';
      cells.push(
        `<text x="${x + size / 2}" y="${y + size * 0.76}" font-size="${size * 0.82}" ` +
          `text-anchor="middle" fill="${piece.color === 'w' ? '#ffffff' : '#111111'}" ` +
          `stroke="${piece.color === 'w' ? '#111111' : 'none'}" stroke-width="0.7">${glyph}</text>`,
      );
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 8}" height="${size * 8}" ` +
    `viewBox="0 0 ${size * 8} ${size * 8}" role="img" aria-label="The position this report is about">` +
    `${cells.join('')}<rect x="0" y="0" width="${size * 8}" height="${size * 8}" fill="none" stroke="#555" stroke-width="1"/></svg>`
  );
}

export interface PrintOptions {
  /** Shown under the title: which game or chapter this position came from. */
  readonly context?: string;
  readonly orientation?: 'w' | 'b';
  /** Opening classification, when the board has one. */
  readonly opening?: { readonly eco: string; readonly label: string } | null;
}

/**
 * The whole printable document, as one HTML string.
 *
 * Self-contained by construction: inline styles, inline SVG, no fetch. A
 * report that printed differently depending on whether a stylesheet had
 * arrived would be a report nobody could rely on.
 */
export function reportToPrintableHtml(report: PositionReport, options: PrintOptions = {}): string {
  const generated = new Date(report.generatedAt);
  const sections = report.sections
    .map((section) => {
      const provenance = section.provenance
        ? `<p class="prov">Source: ${escape(section.provenance)}</p>`
        : '';
      const body =
        section.entries.length === 0
          ? `<p class="empty">${escape(section.emptyReason ?? 'No evidence.')}</p>`
          : `<ul>${section.entries
              .map(
                (entry) =>
                  `<li><span class="primary">${escape(entry.primary)}</span>` +
                  (entry.secondary ? `<span class="sec"> ${escape(entry.secondary)}</span>` : '') +
                  (entry.criterion ? `<div class="crit">${escape(entry.criterion)}</div>` : '') +
                  '</li>',
              )
              .join('')}</ul>`;
      return `<section><h2>${escape(section.title)}</h2>${provenance}${body}</section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Position report</title>
<style>
  @page { margin: 16mm; }
  body { font: 11pt/1.45 Georgia, "Times New Roman", serif; color: #111; margin: 0; }
  header { display: flex; gap: 18px; align-items: flex-start;
           border-bottom: 1px solid #999; padding-bottom: 12px; margin-bottom: 14px; }
  header .meta { flex: 1; min-width: 0; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 11pt; margin: 0 0 2px; letter-spacing: .04em; text-transform: uppercase; }
  .fen { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 8.5pt;
         word-break: break-all; color: #333; }
  .context { font-size: 10pt; color: #333; margin: 0 0 4px; }
  .opening { font-size: 10pt; margin: 0 0 4px; }
  .stamp { font-size: 8.5pt; color: #555; margin-top: 6px; }
  /* A section never straddles a page break: a heading orphaned from its
     evidence is how a printed report starts being misread. */
  section { break-inside: avoid; page-break-inside: avoid; margin: 0 0 12px; }
  ul { margin: 4px 0 0; padding-left: 16px; }
  li { margin: 0 0 3px; }
  .primary { font-weight: 600; }
  .sec { color: #333; }
  .crit, .prov, .empty { font-size: 9pt; color: #555; }
  .prov { margin: 0 0 4px; font-style: italic; }
  .crit { margin-top: 1px; }
  footer { border-top: 1px solid #999; margin-top: 14px; padding-top: 8px;
           font-size: 8.5pt; color: #555; }
</style></head>
<body>
<header>
  <div class="board">${boardSvg(report.fen as Fen, options.orientation ?? 'w')}</div>
  <div class="meta">
    <h1>Position report</h1>
    ${options.context ? `<p class="context">${escape(options.context)}</p>` : ''}
    ${
      options.opening
        ? `<p class="opening"><strong>${escape(options.opening.eco)}</strong> ${escape(options.opening.label)}</p>`
        : ''
    }
    <p class="fen">${escape(report.fen)}</p>
    <p class="stamp">Generated ${escape(generated.toLocaleString())} by Kingfisher.
      Every section names the source it came from. Engine and reference figures
      are measurements taken at that moment, not standing facts.</p>
  </div>
</header>
${sections}
<footer>Sources are named per section above. Nothing in this report is a
recommendation; no move is labelled best.</footer>
</body></html>`;
}

/**
 * Send a report to the printer.
 *
 * A hidden same-origin iframe rather than `window.open`: a popup is blocked by
 * default in most browsers, and a blocked print is indistinguishable from a
 * broken one. The frame is removed once the dialog closes — or after a
 * generous delay, because `afterprint` does not fire everywhere.
 */
export function printReport(report: PositionReport, options: PrintOptions = {}): void {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const remove = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      remove();
      return;
    }
    view.addEventListener('afterprint', remove, { once: true });
    view.focus();
    view.print();
    // Belt and braces: some browsers never fire `afterprint`, and an iframe
    // left in the document would accumulate one per print.
    setTimeout(remove, 60_000);
  };

  const document_ = frame.contentDocument;
  if (!document_) {
    remove();
    return;
  }
  document_.open();
  document_.write(reportToPrintableHtml(report, options));
  document_.close();
}
