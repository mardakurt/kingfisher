/**
 * The board never drops an unsaved analysis without saying so and offering
 * it back. Before this, the "+" beside Save, a Library game, a search hit or
 * the Scoresheet each replaced an unsaved analysis silently, and nothing in
 * Recent or undo could bring it back. Real analysis, tab and notice stores.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import type { GameId } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { watchDisplacedWork } from './tab-actions';
import { useTabs } from './tab-store';

const pushed: string[] = [];
let stop: () => void = () => {};

const offers = () => useUi.getState().notices.filter((notice) => notice.action);

function playLine(...sans: string[]) {
  for (const san of sans) {
    const played = useAnalysis.getState().playSan(san);
    if (!played.ok) throw new Error(`could not play ${san}`);
  }
}

beforeEach(() => {
  useAnalysis.getState().newGame(START_FEN);
  useUi.setState({ notices: [] });
  useTabs.getState().setSwitching(false);
  pushed.length = 0;
  stop = watchDisplacedWork({ push: (href) => pushed.push(href) });
});

afterEach(() => {
  stop();
  useUi.setState({ notices: [] });
});

describe('displaced work', () => {
  it('offers back an unsaved analysis that "New analysis" replaced', () => {
    playLine('e4', 'e5', 'Nf3');
    useAnalysis.getState().newGame(START_FEN);

    const [offer] = offers();
    expect(offer?.message).toBe('The unsaved analysis on the board was replaced.');
    expect(offer?.action?.label).toBe('Open it in a new tab');
  });

  it('offers it back when a game from a list replaces it', () => {
    playLine('d4', 'd5');
    useAnalysis.getState().openDocument({
      tree: createTree(START_FEN, { White: 'Carlsen, Magnus', Black: 'Lazavik, Denis' }),
      document: { kind: 'database-game', title: 'Carlsen – Lazavik', gameId: 'g1' as GameId },
    });
    expect(offers()).toHaveLength(1);
  });

  it('says nothing when nothing was at risk', () => {
    // An empty board replaced.
    useAnalysis.getState().newGame(START_FEN);
    // Moves played on the same document are not a replacement.
    playLine('e4', 'c5');
    expect(offers()).toHaveLength(0);
  });

  it('says nothing for a tab switch, which writes the work to its tab first', () => {
    playLine('e4', 'e5');
    useTabs.getState().setSwitching(true);
    useAnalysis.getState().newGame(START_FEN);
    useTabs.getState().setSwitching(false);
    expect(offers()).toHaveLength(0);
  });

  it('says nothing when the replacement still holds every move', () => {
    playLine('e4', 'e5');
    const { tree, document } = useAnalysis.getState();
    useAnalysis.getState().openDocument({ tree, document });
    expect(offers()).toHaveLength(0);
  });
});
