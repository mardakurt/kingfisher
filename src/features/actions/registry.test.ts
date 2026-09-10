import { describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';
import type { Fen } from '@/chess/types';

import { OPEN_IN_ACTIONS, availableOpenInActions, openInAction } from './registry';

const SOME_FEN = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' as Fen;

describe('OPEN_IN_ACTIONS', () => {
  it('does not include any action that requires a FEN when the FEN is the start position', () => {
    const actions = availableOpenInActions({ fen: START_FEN });
    expect(actions).toEqual([]);
  });

  it('includes every FEN-requiring action when the FEN is a real position', () => {
    const actions = availableOpenInActions({ fen: SOME_FEN });
    expect(actions.map((a) => a.id)).toEqual([
      'open.analysis',
      'open.explorer',
      'open.databases',
      'open.study',
      'open.repertoire',
      'open.training',
    ]);
  });

  it('routes each action to the right URL', () => {
    const navigate = vi.fn();
    for (const action of OPEN_IN_ACTIONS) {
      action.run({ fen: SOME_FEN }, navigate);
    }
    const urls = navigate.mock.calls.map((call) => call[0] as string);
    expect(urls[0]).toContain('/analysis?fen=');
    expect(urls[1]).toContain('/openings?fen=');
    expect(urls[2]).toContain('/games?q=');
    expect(urls[3]).toContain('/studies/new?fen=');
    expect(urls[4]).toContain('/repertoire?add=');
    expect(urls[5]).toContain('/training?newFrom=');
  });

  it('looks actions up by id', () => {
    expect(openInAction('open.analysis')?.label).toBe('Open in Analysis');
    expect(openInAction('not.a.real.id')).toBeUndefined();
  });

  it('uses the position anchor when one is provided, not the FEN', () => {
    const navigate = vi.fn();
    const otherFen = 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3' as Fen;
    openInAction('open.analysis')?.run({ fen: SOME_FEN, positionAnchor: otherFen }, navigate);
    expect(navigate).toHaveBeenCalledWith(`/analysis?fen=${encodeURIComponent(otherFen)}`);
  });
});
