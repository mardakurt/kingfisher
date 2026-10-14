/**
 * Which replacements of the board lose unsaved work. Before the guard, the
 * "+" beside Save, a Library game, a search hit or the Scoresheet each
 * replaced an unsaved analysis silently, and nothing in Recent or undo could
 * bring it back. Real analysis and tab stores; what is kept, and where, is
 * `e2e/displaced-work.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { createTree } from '@/chess/tree/tree';
import type { GameId } from '@/persistence/types';
import { useAnalysis, type OpenDocumentInput } from '@/stores/analysis-store';

import { displacedWork } from './tab-actions';
import { useTabs } from './tab-store';

let kept: OpenDocumentInput[] = [];
let stop: () => void = () => {};

const offers = () => kept;

function playLine(...sans: string[]) {
  for (const san of sans) {
    const played = useAnalysis.getState().playSan(san);
    if (!played.ok) throw new Error(`could not play ${san}`);
  }
}

beforeEach(() => {
  useAnalysis.getState().newGame(START_FEN);
  useTabs.getState().setSwitching(false);
  kept = [];
  stop = useAnalysis.subscribe((next, previous) => {
    const work = displacedWork(previous, next);
    if (work) kept.push(work);
  });
});

afterEach(() => {
  stop();
});

describe('displaced work', () => {
  it('keeps an unsaved analysis that "New analysis" replaced', () => {
    playLine('e4', 'e5', 'Nf3');
    const before = useAnalysis.getState();
    useAnalysis.getState().newGame(START_FEN);

    const [work] = offers();
    // The work itself, where it was left, and still unsaved.
    expect(work?.tree).toBe(before.tree);
    expect(work?.currentId).toBe(before.currentId);
    expect(work?.document.kind).toBe('untitled');
    expect(work?.clean).toBe(false);
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
