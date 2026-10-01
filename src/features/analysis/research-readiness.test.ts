import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/chess/fen';
import type { Fen } from '@/chess/types';
import type { EngineSlot } from '@/stores/engine-store';
import { researchEngineStatus } from './research-readiness';

const slot: EngineSlot = {
  engineId: 'lc0',
  status: 'ready',
  identity: { name: 'Lc0', version: 'v0.32.1' },
  capabilities: null,
  problem: null,
  running: false,
  analysedFen: START_FEN,
  history: [],
  analysis: {
    fen: START_FEN,
    depth: 8,
    seldepth: 8,
    nodes: 100,
    nps: 100,
    timeMs: 1,
    complete: true,
    lines: [{ rank: 1, score: { kind: 'cp', cp: 12 }, depth: 8, moves: [] }],
  },
};

describe('research engine evidence', () => {
  it('does not turn a successful handshake into a verified search', () => {
    expect(researchEngineStatus({ ...slot, analysis: null }, START_FEN)).toBe(
      'Connected · search not checked here',
    );
  });
  it('requires a current-position result, even while the slot already points to the new position', () => {
    const next = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' as Fen;
    expect(researchEngineStatus({ ...slot, analysedFen: next }, next)).not.toMatch(
      /Search (completed|responding)/,
    );
  });
  it('requires a reported identity and a nonempty candidate set', () => {
    expect(researchEngineStatus({ ...slot, identity: null }, START_FEN)).not.toBe(
      'Search completed',
    );
    expect(
      researchEngineStatus({ ...slot, analysis: { ...slot.analysis!, lines: [] } }, START_FEN),
    ).not.toBe('Search completed');
  });
  it('distinguishes a responding search from one that completed', () => {
    expect(
      researchEngineStatus(
        { ...slot, running: true, analysis: { ...slot.analysis!, complete: false } },
        START_FEN,
      ),
    ).toBe('Search responding');
    expect(researchEngineStatus(slot, START_FEN)).toBe('Search completed');
  });
  it('never lets a retained snapshot conceal a failure or an unavailable engine', () => {
    expect(researchEngineStatus({ ...slot, status: 'error' }, START_FEN)).toBe('Search failed');
    expect(researchEngineStatus({ ...slot, status: 'unavailable' }, START_FEN)).toBe('Unavailable');
  });
});
