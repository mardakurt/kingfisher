import { parsePgn } from '@/chess/pgn';
import type { Fen } from '@/chess/types';
import { normalizeGame, indexGame } from '@/persistence/prepare-game';
import type { PreparedSqliteGame } from '@/persistence/pgn-import-protocol';
import { classifyTree } from '@/theory/classify-games';
import type { OpeningIndex } from '@/theory/openings';
import { decodeMoves, type DecodedMove } from './decode';
import type { EnCroissantGame } from './types';

/** A bounded in-memory bridge, never a user-visible intermediate PGN export. */
export function enCroissantPgn(row: EnCroissantGame): string {
  const decoded = decodeMoves(
    Uint8Array.from(atob(row.moves), (char) => char.charCodeAt(0)),
    row.fen as Fen | undefined,
  );
  if (!decoded.ok) throw new Error(`Game ${row.id}: ${decoded.reason}`);
  if (row.plyCount !== null && row.plyCount !== decoded.moves.length)
    throw new Error(`Game ${row.id}: stored ply count does not match its moves.`);
  const result = row.result ?? '*';
  if (!['1-0', '0-1', '1/2-1/2', '*'].includes(result))
    throw new Error(`Game ${row.id}: unsupported result ${result}.`);
  const tags: Record<string, string | number | null> = {
    Event: row.event,
    Site: row.site,
    Date: row.date,
    UTCTime: row.time,
    Round: row.round,
    White: row.white,
    Black: row.black,
    WhiteElo: row.whiteElo,
    BlackElo: row.blackElo,
    Result: result,
    TimeControl: row.timeControl,
    ECO: row.eco,
    ...(row.fen ? { SetUp: '1', FEN: row.fen } : {}),
  };
  const comment = (text: string) => {
    // PGN has no escape for a closing comment delimiter. Refuse rather than alter authored text.
    if (text.includes('}'))
      throw new Error(`Game ${row.id}: a comment contains an unsupported closing brace.`);
    return `{${text}}`;
  };
  const line = (moves: readonly DecodedMove[]): string =>
    moves
      .map((move) => {
        const fields = move.before.split(' ');
        const prefix = `${fields[5]}${fields[1] === 'w' ? '.' : '...'}`;
        const nags = move.nags.map((nag) => {
          const glyphs: Record<string, number> = {
            '!': 1,
            '?': 2,
            '!!': 3,
            '??': 4,
            '!?': 5,
            '?!': 6,
          };
          if (glyphs[nag]) return `$${glyphs[nag]}`;
          if (/^\$?\d+$/.test(nag)) return `$${nag.replace(/^\$/, '')}`;
          throw new Error(`Game ${row.id}: unsupported annotation ${nag}.`);
        });
        return [
          prefix,
          move.san,
          ...move.comments.map(comment),
          ...nags,
          ...move.variations.map((branch) => `(${line(branch)})`),
        ].join(' ');
      })
      .join(' ');
  return (
    Object.entries(tags)
      .filter(([, value]) => value !== null)
      .map(
        ([key, value]) =>
          `[${key} "${String(value)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/[\r\n]/g, ' ')}"]`,
      )
      .join('\n') +
    '\n\n' +
    [...decoded.comments.map(comment), line(decoded.moves), result].join(' ')
  );
}

export function prepareEnCroissantGame(
  row: EnCroissantGame,
  openings: OpeningIndex,
): PreparedSqliteGame {
  const parsed = parsePgn(enCroissantPgn(row));
  const first = parsed.games[0];
  if (!first || first.issues.some((issue) => issue.severity === 'error'))
    throw new Error(`Game ${row.id}: converted game failed PGN validation.`);
  const base = normalizeGame(first.tree);
  const record = { ...base, ...classifyTree(openings, base.tree) };
  const { tree: _tree, normalizedPgn: pgn, ...game } = record;
  void _tree;
  const positions = indexGame(record);
  return { game: { ...game, plyCount: positions.length }, pgn, positions };
}
