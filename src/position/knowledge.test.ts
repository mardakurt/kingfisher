import { describe, expect, it } from 'vitest';
import { START_FEN, positionKey } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import { mainlinePath } from '@/chess/tree/tree';
import { positionGameFacts, positionIdentity, positionPageUrl } from './knowledge';

const read = (pgn: string) => {
  const tree = parsePgn(pgn).games[0]?.tree;
  if (!tree) throw new Error('The fixture did not parse.');
  return tree;
};

describe('a position has one address', () => {
  it('accepts validated keys and collapses counters', () => {
    expect(positionIdentity(positionKey(START_FEN))?.fen).toBe(START_FEN);
    expect(positionPageUrl(START_FEN.replace('0 1', '47 92'))).toBe(positionPageUrl(START_FEN));
    expect(positionPageUrl(START_FEN)).toBe(`/position?fen=${encodeURIComponent(START_FEN)}`);
  });
  it('joins transpositions rather than move sequences', () => {
    const first = read('1. Nf3 d5 2. d4 *');
    const second = read('1. d4 d5 2. Nf3 *');
    const a = first.nodes[mainlinePath(first).at(-1)!]!.fen;
    const b = second.nodes[mainlinePath(second).at(-1)!]!.fen;
    expect(positionIdentity(a)?.key).toBe(positionIdentity(b)?.key);
    expect(positionPageUrl(a)).toBe(positionPageUrl(b));
  });
  it('rejects malformed and illegal four-field keys as well as FENs', () => {
    for (const invalid of ['', 'not a position', '8/8/8/8/8/8/8/8 w - -', 'nonsense w - -']) {
      expect(positionIdentity(invalid)).toBeNull();
      expect(positionPageUrl(invalid)).toBeNull();
    }
    expect(positionIdentity('4k3/8/8/8/8/8/8/4K3 w K -')).toBeNull();
  });
});

describe('game facts at a position', () => {
  const tree = read(
    '[White "Ana Smith"]\n[Black "Guest"]\n[Result "1-0"]\n\n1. e4 {[%emt 0:00:07] [%clk 0:04:53]} e5 2. Nf3 1-0',
  );
  it('opens before the outgoing move and preserves zero versus missing clock facts', () => {
    const fact = positionGameFacts(tree, positionKey(START_FEN), [' ANA   SMITH ']);
    expect(fact).toMatchObject({
      nodeId: tree.rootId,
      ply: 0,
      ownColor: 'w',
      result: '1-0',
      nextMove: 'e4',
      elapsedSeconds: 7,
      remainingAfter: 293,
    });
    const afterE4 = tree.nodes[mainlinePath(tree)[1]!]!.fen;
    expect(positionGameFacts(tree, positionKey(afterE4), ['Ana Smith'])).toMatchObject({
      ply: 1,
      nextMove: 'e5',
      elapsedSeconds: null,
      remainingAfter: null,
    });
    const zero = read('1. e4 {[%emt 0:00:00] [%clk 0:00:00]} *');
    expect(positionGameFacts(zero, positionKey(START_FEN), [])).toMatchObject({
      elapsedSeconds: 0,
      remainingAfter: 0,
    });
  });
  it('never guesses a personal alias and rejects ambiguous self play', () => {
    expect(positionGameFacts(tree, positionKey(START_FEN), ['Smith, Ana'])?.ownColor).toBeNull();
    expect(
      positionGameFacts(tree, positionKey(START_FEN), ['Ana Smith', 'Guest'])?.ownColor,
    ).toBeNull();
    expect(positionGameFacts(tree, positionKey(START_FEN), ['Guest'])?.ownColor).toBe('b');
  });
  it('does not invent a continuation after the end, or a match in another position', () => {
    const last = tree.nodes[mainlinePath(tree).at(-1)!]!;
    expect(positionGameFacts(tree, positionKey(last.fen), [])).toMatchObject({
      nextMove: null,
      elapsedSeconds: null,
      remainingAfter: null,
    });
    const other = read('1. d4 *');
    const otherLast = other.nodes[mainlinePath(other).at(-1)!]!;
    expect(positionGameFacts(tree, positionKey(otherLast.fen), [])).toBeNull();
  });
});
