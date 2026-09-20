/**
 * One game, no errors, through Kingfisher's own parser and rules.
 *
 * The check a team handover must pass before it is stored or received.
 * Warnings are tolerated — a stray tag or an unknown NAG is a fact about the
 * file, not a reason to refuse the analysis — and errors are not, because an
 * illegal move in a hand-in is exactly the thing a coach must not be shown as
 * if it were played. Lives in persistence rather than `@/team` so the
 * repository that writes handovers can apply it without reaching upwards.
 */

import { parsePgn } from '@/chess/pgn';
import type { GameTree } from '@/chess/tree/types';

export type ParsedHandoverPgn =
  { readonly ok: true; readonly tree: GameTree } | { readonly ok: false; readonly reason: string };

export function parseHandoverPgn(pgn: string): ParsedHandoverPgn {
  const parsed = parsePgn(pgn);
  const errors = [...parsed.issues, ...parsed.games.flatMap((game) => game.issues)].filter(
    (issue) => issue.severity === 'error',
  );
  if (errors.length > 0) return { ok: false, reason: errors[0]!.message };
  const game = parsed.games[0];
  if (!game) return { ok: false, reason: 'No game in the PGN.' };
  if (parsed.games.length > 1) return { ok: false, reason: 'A handover carries one game.' };
  return { ok: true, tree: game.tree };
}
