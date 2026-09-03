import { describe, expect, it } from 'vitest';

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import { asFen, asSan, asUci } from '@/chess/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import { convergencePoints, describeRoute, routesToPosition, START_KEY } from './transpositions';

/**
 * A repertoire is built by walking real lines through the real rules, so the
 * FENs and the resulting keys are the ones the application would store. The
 * point of these tests is convergence, and a fixture with hand-written keys
 * could make two different positions look like one and pass anyway.
 */
function repertoireFrom(lines: readonly (readonly string[])[]): RepertoirePositionRecord[] {
  const byKey = new Map<string, RepertoirePositionRecord>();
  for (const line of lines) {
    let position = Position.fromTrustedFen(
      asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    );
    for (const san of line) {
      const key = positionKey(position.fen);
      const played = position.advanceSan(san);
      if (!isOk(played)) throw new Error(`${san} was refused`);
      const existing = byKey.get(key);
      const move = {
        uci: asUci(played.value.move.uci),
        san: asSan(played.value.move.san),
        role: 'main' as const,
        updatedAt: 0,
      };
      byKey.set(key, {
        id: `pos-${key}`,
        repertoireId: 'r1',
        positionKey: key,
        fen: position.fen,
        sideToMove: position.fen.split(' ')[1] === 'b' ? 'b' : 'w',
        moves: existing?.moves.some((entry) => entry.uci === move.uci)
          ? existing.moves
          : [...(existing?.moves ?? []), move],
        depth: 0,
        createdAt: 0,
        updatedAt: 0,
        revision: 0,
      });
      position = played.value.next;
    }
    // The final position exists in the graph even with nothing prepared yet.
    const finalKey = positionKey(position.fen);
    if (!byKey.has(finalKey)) {
      byKey.set(finalKey, {
        id: `pos-${finalKey}`,
        repertoireId: 'r1',
        positionKey: finalKey,
        fen: position.fen,
        sideToMove: position.fen.split(' ')[1] === 'b' ? 'b' : 'w',
        moves: [],
        depth: 0,
        createdAt: 0,
        updatedAt: 0,
        revision: 0,
      });
    }
  }
  return [...byKey.values()];
}

/** Three move orders into the same Queen's Gambit Declined structure. */
const QGD_ORDERS = [
  ['Nf3', 'd5', 'd4', 'Nf6', 'c4', 'e6'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5'],
  ['c4', 'Nf6', 'Nf3', 'e6', 'd4', 'd5'],
] as const;

function tabiyaKey(): string {
  let position = Position.fromTrustedFen(
    asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
  );
  for (const san of QGD_ORDERS[0]) {
    const played = position.advanceSan(san);
    if (!isOk(played)) throw new Error(`${san} was refused`);
    position = played.value.next;
  }
  return positionKey(position.fen);
}

describe('transposition routes', () => {
  it('finds every prepared move order that reaches one position', () => {
    const positions = repertoireFrom(QGD_ORDERS);
    const view = routesToPosition(positions, tabiyaKey());

    expect(view.routes.length).toBeGreaterThanOrEqual(3);
    const written = view.routes.map((route) => describeRoute(route));
    expect(written).toContain('1.Nf3 d5 2.d4 Nf6 3.c4 e6');
    expect(written).toContain('1.d4 Nf6 2.c4 e6 3.Nf3 d5');
    expect(written).toContain('1.c4 Nf6 2.Nf3 e6 3.d4 d5');
    // Every route arrives at the same key, which is the whole claim.
    for (const route of view.routes) {
      expect(route.moves.at(-1)!.toKey).toBe(tabiyaKey());
    }
  });

  it('reports the shortest route first', () => {
    const positions = repertoireFrom(QGD_ORDERS);
    const view = routesToPosition(positions, tabiyaKey());
    const lengths = view.routes.map((route) => route.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
  });

  it('says the list is partial rather than implying it is complete', () => {
    const positions = repertoireFrom(QGD_ORDERS);
    const capped = routesToPosition(positions, tabiyaKey(), { maxRoutes: 1 });
    expect(capped.routes).toHaveLength(1);
    expect(capped.truncated).toBe(true);

    const whole = routesToPosition(positions, tabiyaKey(), { maxRoutes: 50 });
    expect(whole.truncated).toBe(false);
  });

  it('returns nothing rather than guessing when the root is not in the repertoire', () => {
    const positions = repertoireFrom(QGD_ORDERS);
    const view = routesToPosition(positions, tabiyaKey(), { rootKey: 'not-a-position' });
    expect(view.routes).toEqual([]);
    expect(view.truncated).toBe(false);
  });

  it('does not report a route to the root itself', () => {
    const positions = repertoireFrom(QGD_ORDERS);
    expect(routesToPosition(positions, START_KEY).routes).toEqual([]);
  });

  it('names the positions several routes converge on', () => {
    const positions = repertoireFrom(QGD_ORDERS);
    const points = convergencePoints(positions);
    const tabiya = points.find((point) => point.positionKey === tabiyaKey());

    expect(tabiya).toBeDefined();
    /*
      Two, not three, and that is the correct answer. The metric counts the
      distinct positions that lead here, not the number of paths: the second
      and third move orders reach the tabiya from the *same* predecessor —
      d4/c4/Nf3 against Nf6/e6 is one position however the three white moves
      are ordered — so there are three routes but only two ways in. Counting
      paths would report the same edge twice and overstate the position's
      importance in exactly the way this list exists to avoid.
    */
    expect(tabiya!.routes).toBe(2);
    // Most-converged first: that is where a repertoire's maintenance lives.
    expect(points[0]!.routes).toBeGreaterThanOrEqual(points.at(-1)!.routes);
  });

  it('writes a route the way a player writes a line down', () => {
    const positions = repertoireFrom([['e4', 'c5', 'Nf3']]);
    let position = Position.fromTrustedFen(
      asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    );
    for (const san of ['e4', 'c5', 'Nf3']) {
      const played = position.advanceSan(san);
      if (!isOk(played)) throw new Error('refused');
      position = played.value.next;
    }
    const view = routesToPosition(positions, positionKey(position.fen));
    expect(describeRoute(view.routes[0]!)).toBe('1.e4 c5 2.Nf3');
  });
});
