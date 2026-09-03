/**
 * Getting the sheet off the screen.
 *
 * A preparation sheet is read in a playing hall, often on paper, often with no
 * network and sometimes with the laptop already packed. So the exports are
 * deliberately boring formats that survive that: printable HTML, Markdown, and
 * PGN for the lines themselves.
 *
 * There is no PDF. Producing one in the browser means shipping a rendering
 * library, and a fragile subsystem whose only job is to reproduce what the
 * print dialog already does correctly is not worth the bytes or the bugs. The
 * printable page is styled for paper and the browser turns it into a PDF.
 */

import type { PreparationSessionRecord, PreparationSheetCard } from '@/persistence/domain';

/** `1.d4 Nf6 2.c4 e6`, the way a line is written on paper. */
export function writeLine(line: readonly string[], startPly = 0): string {
  return line
    .map((san, index) => {
      const ply = startPly + index;
      return ply % 2 === 0 ? `${Math.floor(ply / 2) + 1}.${san}` : san;
    })
    .join(' ');
}

export function sheetHeading(session: PreparationSessionRecord): string {
  const parts = [session.title];
  if (session.opponent) parts.push(`vs ${session.opponent}`);
  if (session.event) parts.push(session.event);
  if (session.round) parts.push(`Round ${session.round}`);
  return parts.join(' · ');
}

/**
 * Markdown, for pasting into whatever the player already keeps notes in.
 *
 * Includes the FEN for every card. It is noise on screen and essential on
 * paper: a line without its position cannot be set up again if the reader
 * loses their place.
 */
export function sheetToMarkdown(session: PreparationSessionRecord): string {
  const lines: string[] = [`# ${sheetHeading(session)}`, ''];
  lines.push(`Playing ${session.myColor === 'w' ? 'White' : 'Black'}.`);
  if (session.gameDate) lines.push(`Game date: ${session.gameDate}.`);
  lines.push('');

  if (session.notes?.trim()) {
    lines.push('## Notes', '', session.notes.trim(), '');
  }

  if (session.sheet.length === 0) {
    lines.push('_No positions on the sheet._');
    return lines.join('\n');
  }

  lines.push('## Positions', '');
  session.sheet.forEach((card, index) => {
    lines.push(`### ${index + 1}. ${card.line.length ? writeLine(card.line) : 'Position'}`);
    lines.push('');
    if (card.why) lines.push(`**Why:** ${card.why}`);
    if (card.intendedSan) lines.push(`**Intend to play:** ${card.intendedSan}`);
    if (card.note) lines.push(card.note);
    lines.push('', `\`${card.fen}\``, '');
  });
  return lines.join('\n');
}

/**
 * PGN, one game per card, so the lines open in anything.
 *
 * A card whose line starts from the standard position is written as an
 * ordinary game; one that does not gets a `FEN`/`SetUp` header pair, which is
 * what every other reader expects and what Kingfisher's own importer needs to
 * restore the position rather than the moves.
 */
export function sheetToPgn(session: PreparationSessionRecord): string {
  return session.sheet
    .map((card, index) => {
      const headers = [
        `[Event "${escapeTag(sheetHeading(session))}"]`,
        `[Site "Kingfisher preparation"]`,
        `[Round "${escapeTag(String(index + 1))}"]`,
        `[White "${escapeTag(session.myColor === 'w' ? 'Me' : (session.opponent ?? 'Opponent'))}"]`,
        `[Black "${escapeTag(session.myColor === 'b' ? 'Me' : (session.opponent ?? 'Opponent'))}"]`,
        `[Result "*"]`,
      ];
      const body: string[] = [];
      if (card.line.length === 0) {
        headers.push('[SetUp "1"]', `[FEN "${card.fen}"]`);
      }
      if (card.why) body.push(`{${sanitizeComment(card.why)}}`);
      const movetext = card.line.length ? writeLine(card.line) : '';
      const trailing = card.intendedSan ? `{Intend: ${sanitizeComment(card.intendedSan)}}` : '';
      return [
        headers.join('\n'),
        '',
        [body.join(' '), movetext, trailing, '*'].filter(Boolean).join(' '),
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * A self-contained printable page.
 *
 * Inline styles and no external references, because this document is opened in
 * a new window and printed immediately — a stylesheet that has not loaded when
 * the print dialog appears produces an unusable sheet at exactly the wrong
 * moment. Sized for A4 and Letter alike by using no fixed widths at all.
 */
export function sheetToPrintableHtml(session: PreparationSessionRecord): string {
  const cards = session.sheet
    .map(
      (card, index) => `
    <li>
      <h3>${index + 1}. ${escapeHtml(card.line.length ? writeLine(card.line) : 'Position')}</h3>
      ${card.why ? `<p class="why">${escapeHtml(card.why)}</p>` : ''}
      ${card.intendedSan ? `<p class="intend">Intend to play <strong>${escapeHtml(card.intendedSan)}</strong></p>` : ''}
      ${card.note ? `<p class="note">${escapeHtml(card.note)}</p>` : ''}
      <p class="fen">${escapeHtml(card.fen)}</p>
    </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(sheetHeading(session))}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 11pt/1.5 ui-serif, Georgia, "Times New Roman", serif;
    color: #111;
    background: #fff;
  }
  header { border-bottom: 1.5pt solid #111; padding-bottom: 6pt; margin-bottom: 12pt; }
  h1 { font-size: 15pt; margin: 0 0 3pt; }
  .meta { font-size: 9.5pt; color: #444; margin: 0; }
  h2 { font-size: 11pt; margin: 14pt 0 6pt; text-transform: uppercase; letter-spacing: .06em; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { break-inside: avoid; padding: 7pt 0; border-bottom: .5pt solid #bbb; }
  h3 { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11pt; margin: 0 0 3pt; }
  p { margin: 2pt 0; }
  .why { font-size: 10.5pt; }
  .intend { font-size: 10pt; }
  .note { font-size: 10pt; color: #333; }
  .fen { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 7.5pt; color: #666; word-break: break-all; }
  .notes { font-size: 10.5pt; white-space: pre-wrap; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(sheetHeading(session))}</h1>
  <p class="meta">Playing ${session.myColor === 'w' ? 'White' : 'Black'}${
    session.gameDate ? ` · ${escapeHtml(session.gameDate)}` : ''
  } · ${session.sheet.length} position${session.sheet.length === 1 ? '' : 's'}</p>
</header>
${session.notes?.trim() ? `<h2>Notes</h2><p class="notes">${escapeHtml(session.notes.trim())}</p>` : ''}
<h2>Positions</h2>
<ol>${cards || '<li><p>No positions on the sheet.</p></li>'}</ol>
</body>
</html>`;
}

/** Cards grouped by the source that produced them, for the sheet's summary. */
export function cardsBySource(cards: readonly PreparationSheetCard[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = card.source ?? 'analysis';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** PGN tag values cannot contain a raw quote or backslash. */
const escapeTag = (value: string): string => value.replace(/[\\"]/g, ' ').trim();

/** PGN comments are brace-delimited, so a brace inside one would end it. */
const sanitizeComment = (value: string): string => value.replace(/[{}]/g, '').trim();
