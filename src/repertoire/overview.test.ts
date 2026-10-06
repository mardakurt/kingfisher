import { describe, expect, it } from 'vitest';
import { positionKey, START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import { asSan, asUci } from '@/chess/types';
import type { RepertoirePositionRecord, RepertoireWithPositions } from '@/persistence/domain';
import { repertoireOverview } from './overview';

const after = Position.fromTrustedFen(START_FEN).playUci('e2e4');
if (!after.ok) throw new Error('Fixture move failed');
const position: RepertoirePositionRecord = {
  id: 'start',
  repertoireId: 'white',
  positionKey: positionKey(START_FEN),
  fen: START_FEN,
  sideToMove: 'w',
  depth: 0,
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  moves: [{ uci: asUci('e2e4'), san: asSan('e4'), role: 'main', updatedAt: 1 }],
};
const record: RepertoireWithPositions = {
  repertoire: { id: 'white', title: 'White', color: 'w', createdAt: 1, updatedAt: 1 },
  positions: [position],
};
describe('repertoire opening overview', () => {
  it('counts only own main and alternative decisions, excluding candidates, avoided moves and replies', () => {
    const positions: RepertoirePositionRecord[] = [
      {
        ...position,
        moves: [
          ...position.moves,
          { uci: asUci('d2d4'), san: asSan('d4'), role: 'alternative', updatedAt: 1 },
          { uci: asUci('g1f3'), san: asSan('Nf3'), role: 'candidate', updatedAt: 1 },
          { uci: asUci('a2a4'), san: asSan('a4'), role: 'avoid', updatedAt: 1 },
          { uci: asUci('c2c4'), san: asSan('c4'), role: 'main', expected: true, updatedAt: 1 },
        ],
      },
      {
        ...position,
        id: 'reply',
        fen: after.value.after,
        positionKey: positionKey(after.value.after),
        sideToMove: 'b',
      },
    ];
    expect(repertoireOverview({ ...record, positions }, () => 'Named opening')).toEqual([
      { name: 'Named opening', positions: 1, moves: 2, positionId: 'start' },
    ]);
  });
  it('deduplicates canonical positions rather than move orders or FEN move counters', () => {
    const duplicate = {
      ...position,
      id: 'other-order',
      fen: START_FEN.replace('0 1', '4 3') as typeof START_FEN,
    };
    expect(repertoireOverview({ ...record, positions: [position, duplicate] }, () => null)).toEqual(
      [{ name: 'Unclassified positions', positions: 1, moves: 1, positionId: 'start' }],
    );
  });
  it('does not turn a candidate-only repertoire into prepared openings', () => {
    expect(
      repertoireOverview(
        {
          ...record,
          positions: [{ ...position, moves: [{ ...position.moves[0]!, role: 'candidate' }] }],
        },
        () => 'Sicilian',
      ),
    ).toEqual([]);
  });
});
