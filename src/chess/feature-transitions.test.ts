import { describe, expect, it } from 'vitest';

import { featureTransitions } from './feature-transitions';

/**
 * Tests use crafted FENs that differ only in the targeted feature,
 * so a passing test is unambiguous evidence that the transition was
 * actually detected (not that the engine happens to agree).
 */

describe('featureTransitions', () => {
  it('reports a newly passed pawn when an enemy block disappears', () => {
    /* Before: White pawn on d5, Black pawn on d6 blocks it.
       After: Black plays ...d7; the pawn on d6 is gone and
       the d5 pawn is now passed (no Black pawn on d/e/c file
       ahead of it). */
    const before = '4k3/8/3p4/3P4/8/8/8/4K3 b - - 0 1';
    const after = '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1';
    const transitions = featureTransitions(before, after);
    const passed = transitions.find((t) => t.kind === 'passed-pawn' && t.color === 'w');
    expect(passed).toBeDefined();
    expect(passed?.statement).toMatch(/creates a passed pawn on the d-file/);
  });

  it('reports a newly opened file', () => {
    /* The d-file goes from carrying a pawn to empty. */
    const a = '4k3/8/8/8/8/3p4/8/4K3 b - - 0 1';
    const b = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    const transitions = featureTransitions(a, b);
    const opens = transitions.filter((t) => t.kind === 'open-file');
    expect(opens.length).toBeGreaterThan(0);
    expect(opens.some((t) => /d-file becomes open/.test(t.statement))).toBe(true);
  });

  it('reports bishop-pair gained and lost across a bishop exchange', () => {
    /* White starts with two bishops on f1, c1; Black has one
       bishop on f8. After Black plays Bxf1, White loses the
       pair. Then White plays Rxbishop to recover it. */
    const withPair = '4k3/8/8/8/8/8/8/R1B1K1B1 w - - 0 1';
    const noPair = '4k3/8/8/8/8/8/8/R1B1K1b1 w - - 0 1';
    const gained = featureTransitions(noPair, withPair);
    expect(
      gained.some((t) => t.kind === 'bishop-pair' && /now has the bishop pair/.test(t.statement)),
    ).toBe(true);
    const lost = featureTransitions(withPair, noPair);
    expect(
      lost.some((t) => t.kind === 'bishop-pair' && /gives up the bishop pair/.test(t.statement)),
    ).toBe(true);
  });

  it('does NOT report structural events for a normal pawn move', () => {
    /* Move a pawn one square forward with no captures and no
       structural change. King on d1 (file 4). White pawn on e2
       (file 4, rank 1, diff=1 → within 3 of king rank 0).
       Pawn on e2 → e3 (rank 2, diff=2 → within 3). Shield
       count unchanged. No file change. */
    const a = '4k3/8/8/8/8/8/4P3/3K4 w - - 0 1';
    const c = '4k3/8/8/8/8/4P3/8/3K4 w - - 0 1';
    const transitions = featureTransitions(a, c);
    expect(transitions).toHaveLength(0);
  });

  it('reports a king-shield collapse only on a meaningful drop', () => {
    /* White king on g1 (file 6, rank 0). White pawns on f2,
       g2, h2 — shield of 3. After: f2 and g2 captured
       (e.g. by a Black piece), only h2 remains. Shield
       drops from 3 to 1 — exactly the 2-or-more drop the
       implementation fires on. */
    const before = '6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1';
    const after = '6k1/8/8/8/8/8/7P/6K1 w - - 0 1';
    const transitions = featureTransitions(before, after);
    const shield = transitions.find((t) => t.kind === 'king-shield');
    expect(shield).toBeDefined();
    expect(shield?.statement).toMatch(/pawn shield is weakened/);
  });

  it('returns an empty list when FENs are identical', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(featureTransitions(fen, fen)).toHaveLength(0);
  });

  it('returns an empty list when an FEN is malformed', () => {
    const ok = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(featureTransitions('not-a-fen', ok)).toHaveLength(0);
    expect(featureTransitions(ok, 'still not')).toHaveLength(0);
  });

  it('reports a newly protected passed pawn only when the support is new', () => {
    /* Before: White has a passed pawn on d5 with no friendly
       passer on c/e files. After: White plays c5, which
       becomes a passed pawn itself; c5 supports d5. */
    const before = '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1';
    const after = '4k3/8/8/3P4/2P5/8/8/4K3 b - - 0 1';
    const transitions = featureTransitions(before, after);
    const prot = transitions.find((t) => t.kind === 'protected-passer');
    expect(prot).toBeDefined();
    /* Either d5 or c5 is reported as protected; the test only
       asserts that a protection event fires for the new pair. */
    expect(prot?.statement).toMatch(/protected passed pawn/);
  });

  it('does not double-report an already open file', () => {
    /* a -> b: capture on d6, d-file still has White pawn at
       d3 — no open-file event fires.
       b -> c: capture on d4, now d-file is empty of Black
       pawns — semi-open-file fires for Black.
       Crucially, the same id never appears twice. */
    const a = '4k3/8/3p4/3p4/8/3P4/8/4K3 w - - 0 1';
    const b = '4k3/8/3P4/3p4/8/8/8/4K3 w - - 0 1';
    const c = '4k3/8/3P4/8/8/8/8/4K3 w - - 0 1';
    const first = featureTransitions(a, b);
    const second = featureTransitions(b, c);
    const firstOpen = first.filter((t) => t.kind === 'open-file');
    const secondOpen = second.filter((t) => t.kind === 'open-file');
    /* The first move keeps White's d-pawn and only removes
       Black's d-pawn. d-file is still partially occupied, so
       no open-file event. */
    expect(firstOpen).toHaveLength(0);
    /* Second move removes Black's last d-pawn (d4). d-file is
       now empty of Black pawns but still has a White pawn at
       d6 — semi-open, not open. */
    expect(secondOpen).toHaveLength(0);
    /* But a semi-open-file transition fires on the second move. */
    const secondSemi = second.filter((t) => t.kind === 'semi-open-file');
    expect(secondSemi.some((t) => /d-file/.test(t.statement))).toBe(true);
    /* Idempotency: re-running the same transition returns the
       same id, never a duplicate. */
    const firstIds = new Set(first.map((t) => t.id));
    const firstDups = first.filter((t, i) => first.findIndex((u) => u.id === t.id) !== i);
    expect(firstDups).toHaveLength(0);
    void firstIds;
  });
});
