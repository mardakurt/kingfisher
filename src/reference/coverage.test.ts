import { describe, expect, it } from 'vitest';

import { describeCoverage, moveNumberOfPly, plyOfFen } from './coverage';
import type { ReferenceSource } from './types';

const pack = (overrides: Partial<ReferenceSource> = {}): ReferenceSource => ({
  id: 'kingfisher-starter',
  name: 'Kingfisher Starter Reference',
  description: '',
  kind: 'bundled',
  state: 'ready',
  installed: true,
  enabled: true,
  updateAvailable: false,
  offline: true,
  capabilities: ['explorer'],
  gameCount: 206_451,
  openableCount: 38_749,
  maxPositionPly: 40,
  freshness: '2022-09 – 2026-08',
  provenance: {
    source: 'Lichess broadcast archive',
    url: '',
    retrieved: '2026-09-14',
    transformation: '',
    upstream: [],
  },
  ...overrides,
});

describe('plyOfFen', () => {
  it('reads the ply of a position from its move number and side', () => {
    expect(plyOfFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(0);
    expect(plyOfFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(1);
    expect(plyOfFen('8/8/8/8/8/8/8/8 w - - 0 21')).toBe(40);
    expect(plyOfFen('8/8/8/8/8/8/8/8 b - - 0 21')).toBe(41);
    expect(plyOfFen('not a fen')).toBe(0);
  });

  it('names the move a ply belongs to', () => {
    expect(moveNumberOfPly(0)).toBe(1);
    expect(moveNumberOfPly(40)).toBe(21);
    expect(moveNumberOfPly(41)).toBe(21);
  });
});

describe('describeCoverage', () => {
  it('states what a pack holds, from the pack', () => {
    const coverage = describeCoverage(pack(), 10);
    expect(coverage.holds).toEqual([
      '206,451 games aggregated',
      '38,749 of them openable in full',
      '2022-09 – 2026-08',
      'built from Lichess broadcast archive',
      'positions up to move 21 (40 plies)',
    ]);
    expect(coverage.lacks[0]).toContain('167,702 games');
    expect(coverage.lacks[1]).toContain('after move 21');
  });

  it('inside its depth, an empty answer is an answer', () => {
    const coverage = describeCoverage(pack(), 40);
    expect(coverage.depth).toBe('inside');
    expect(coverage.emptyMeaning).toBeNull();
  });

  it('past its depth, an empty answer means the build stopped, not that nobody played it', () => {
    const coverage = describeCoverage(pack(), 41);
    expect(coverage.depth).toBe('beyond-depth');
    expect(coverage.emptyMeaning).toContain('only to move 21');
    expect(coverage.emptyMeaning).toContain('this is move 21');
    expect(coverage.emptyMeaning).toContain('only if a game reached it sooner');
  });

  it('a source that states no depth is never accused of having one', () => {
    const coverage = describeCoverage(pack({ maxPositionPly: undefined }), 120);
    expect(coverage.depth).toBe('unstated');
    expect(coverage.emptyMeaning).toBeNull();
    expect(coverage.holds.some((clause) => clause.includes('positions up to'))).toBe(false);
    expect(coverage.lacks.some((clause) => clause.includes('the build stopped'))).toBe(false);
  });

  it('says a network source needs one', () => {
    const online = describeCoverage(pack({ offline: false, maxPositionPly: undefined }), 5);
    expect(online.lacks).toContain('anything at all without a network');
    expect(describeCoverage(pack(), 5).lacks).not.toContain('anything at all without a network');
  });
});
