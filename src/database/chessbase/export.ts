/**
 * A ChessBase database as one download: the seven files in a ZIP, named for
 * the collection or study, and a sentence saying what could not travel.
 */

import type { GameTree } from '@/chess/tree/types';
import { zipStored } from '@/lib/zip';

import { writeChessBase, type ChessBaseWriteReport } from './write';

/** A base name ChessBase and every file system accept: ASCII letters, digits, spaces, dashes. */
export function chessBaseBaseName(title: string): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\w -]+/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
  return ascii || 'Kingfisher';
}

export interface ChessBaseArchive {
  readonly fileName: string;
  readonly zip: Uint8Array;
  readonly report: ChessBaseWriteReport;
  /** What the person is told: how many games, and anything that did not travel. */
  readonly summary: string;
}

export function chessBaseArchive(title: string, games: readonly GameTree[]): ChessBaseArchive {
  const base = chessBaseBaseName(title);
  const { files, report } = writeChessBase(games);
  const zip = zipStored(
    [...files].map(([extension, bytes]) => ({ name: `${base}.${extension}`, bytes })),
  );
  const notes: string[] = [];
  if (report.refused.length) notes.push(`${report.refused.length} game(s) could not be written`);
  if (report.blueShapes)
    notes.push(
      `${report.blueShapes} blue square(s) or arrow(s) left out — ChessBase draws in green, yellow and red`,
    );
  if (report.extraSymbols)
    notes.push(
      `${report.extraSymbols} symbol(s) past ChessBase's one move, one position and one prefix symbol left out`,
    );
  if (report.truncated) notes.push(`${report.truncated} name(s) cut to their ChessBase field`);
  if (report.replacedCharacters)
    notes.push(`${report.replacedCharacters} character(s) in names written as "?"`);
  const summary = `${report.written.toLocaleString()} game${report.written === 1 ? '' : 's'} written as ${base}.cbh${notes.length ? `; ${notes.join('; ')}` : ''}.`;
  return { fileName: `${base}.zip`, zip, report, summary };
}

/** Hand the archive to the browser as a download. */
export function downloadArchive(archive: ChessBaseArchive): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([archive.zip as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = archive.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
