import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { LinkedAccountRecord } from '@/persistence/domain';

import { normalisePlayerName, viewerSide } from './viewer-side';

const buildTree = (white: string | undefined, black: string | undefined): GameTree =>
  createTree(START_FEN, {
    ...(white !== undefined ? { White: white } : {}),
    ...(black !== undefined ? { Black: black } : {}),
    Event: 'Test',
    Result: '*',
  });

const account = (provider: 'lichess' | 'chess.com', username: string): LinkedAccountRecord => ({
  id: `${provider}:${username.toLowerCase()}`,
  provider,
  username,
  createdAt: 0,
  importedCount: 0,
  duplicatesSkipped: 0,
});

describe('normalisePlayerName', () => {
  it('lowercases and strips whitespace and punctuation but keeps underscores', () => {
    expect(normalisePlayerName('DrDrunkenstein')).toBe('drdrunkenstein');
    expect(normalisePlayerName('  Carlsen, Magnus ')).toBe('carlsenmagnus');
    // Underscores are part of the username alphabet on Lichess and Chess.com,
    // so they survive the normalise step rather than collapsing to nothing.
    expect(normalisePlayerName('GM_Hikaru')).toBe('gm_hikaru');
    expect(normalisePlayerName('someone-else')).toBe('someone-else');
  });
});

describe('viewerSide', () => {
  it('returns null when no accounts are linked', () => {
    const tree = buildTree('DrDrunkenstein', 'SomebodyElse');
    expect(viewerSide(tree, [])).toBeNull();
  });

  it('returns white when the viewer is the White player', () => {
    const tree = buildTree('DrDrunkenstein', 'SomebodyElse');
    expect(viewerSide(tree, [account('lichess', 'DrDrunkenstein')])).toBe('w');
  });

  it('returns black when the viewer is the Black player', () => {
    const tree = buildTree('SomebodyElse', 'DrDrunkenstein');
    expect(viewerSide(tree, [account('lichess', 'DrDrunkenstein')])).toBe('b');
  });

  it('matches case-insensitively and tolerates punctuation', () => {
    const tree = buildTree('DrDrunkenstein', 'SomebodyElse');
    expect(viewerSide(tree, [account('lichess', 'DRDRUNKENSTEIN')])).toBe('w');
    expect(viewerSide(tree, [account('chess.com', 'drdrunkenstein')])).toBe('w');
  });

  it('white wins when the viewer is linked to both colours', () => {
    const tree = buildTree('DrDrunkenstein', 'DrDrunkenstein');
    expect(viewerSide(tree, [account('lichess', 'DrDrunkenstein')])).toBe('w');
  });

  it('returns null when neither side matches', () => {
    const tree = buildTree('PlayerA', 'PlayerB');
    expect(viewerSide(tree, [account('lichess', 'DrDrunkenstein')])).toBeNull();
  });

  it('returns null when one or both headers are missing', () => {
    const noWhite = buildTree(undefined, 'SomebodyElse');
    const noBlack = buildTree('SomebodyElse', undefined);
    expect(viewerSide(noWhite, [account('lichess', 'SomebodyElse')])).toBeNull();
    expect(viewerSide(noBlack, [account('lichess', 'SomebodyElse')])).toBeNull();
  });

  it('matches against any of several linked accounts', () => {
    const tree = buildTree('AccountOne', 'AccountTwo');
    const accounts = [
      account('lichess', 'SomebodyElse'),
      account('chess.com', 'AccountTwo'),
      account('lichess', 'YetAnother'),
    ];
    expect(viewerSide(tree, accounts)).toBe('b');
  });
});
