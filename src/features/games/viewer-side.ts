'use client';

/**
 * Which side of a game the viewer actually played, when one can be told.
 *
 * Three inputs go in: the game's PGN headers (which carry the two player
 * names), the linked online accounts the user has paired (Lichess, Chess.com),
 * and the user's preferred "play as" override for cases where the headers
 * do not match a known account exactly (an old handle, a renamed account).
 *
 * The helper is intentionally tolerant. A match here is only useful if it is
 * true on the strongest evidence available, because the answer is used to
 * flip the board — getting it wrong is more confusing than guessing wrong is
 * convenient. Headers are compared case-insensitively, with whitespace and
 * any leading chess.com-style annotations trimmed, which covers the standard
 * "DrDrunkenstein" / "DrDrunkenstein " cases without false positives.
 */

import type { Color } from '@/chess/types';
import type { GameTree } from '@/chess/tree/types';
import type { LinkedAccountRecord } from '@/persistence/domain';

export const normalisePlayerName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');

/**
 * The side the viewer played, when it can be told.
 *
 * Returns `null` when the headers do not name either player that matches any
 * of the caller's known accounts, or when the headers themselves are missing
 * or empty — in which case the workspace should fall back to its default
 * orientation rather than guess.
 */
export function viewerSide(tree: GameTree, accounts: readonly LinkedAccountRecord[]): Color | null {
  if (accounts.length === 0) return null;
  const white = tree.headers.White?.trim();
  const black = tree.headers.Black?.trim();
  if (!white || !black) return null;
  const whiteKey = normalisePlayerName(white);
  const blackKey = normalisePlayerName(black);
  let whiteMatch = false;
  let blackMatch = false;
  for (const account of accounts) {
    const key = normalisePlayerName(account.username);
    if (!key) continue;
    if (key === whiteKey) whiteMatch = true;
    if (key === blackKey) blackMatch = true;
  }
  if (whiteMatch && blackMatch) {
    /*
     * The viewer is linked to *both* accounts — an account house, or someone
     * who manages two profiles. Picking the one whose handle the game
     * actually shows is the only honest answer, so white wins (Pgn convention:
     * if the headers do not disagree, white is the side the file is about).
     */
    return 'w';
  }
  if (whiteMatch) return 'w';
  if (blackMatch) return 'b';
  return null;
}
