import { describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';

import { movePlayers, type MovePlayersReader } from './move-players';
import type { PackGame } from './pack';

const after = (fen: string, san: string): string => {
  const position = Position.fromFen(fen);
  if (!position.ok) throw new Error('fen');
  const next = position.value.advanceSan(san);
  if (!next.ok) throw new Error('san');
  return positionKey(next.value.next.fen);
};

const game = (id: string, white: string, whiteElo: number, black: string): PackGame => ({
  id,
  white,
  black,
  result: '1-0',
  year: 2025,
  date: '2025.01.01',
  event: '',
  eco: '',
  opening: '',
  whiteElo,
  blackElo: 2700,
  url: '',
  moves: '1. e4 c5',
});

describe('movePlayers', () => {
  const GAMES = [
    game('a', 'Carlsen, Magnus', 2830, 'X'),
    game('b', 'Caruana, Fabiano', 2800, 'Y'),
    game('c', 'Carlsen, Magnus', 2860, 'Z'),
    game('d', 'Firouzja, Alireza', 2780, 'W'),
  ];
  const reader: MovePlayersReader = {
    position: async (key) =>
      key === after(START_FEN, 'e4')
        ? { key, moves: [], games: ['a', 'b', 'c', 'd'] }
        : key === after(START_FEN, 'd4')
          ? { key, moves: [], games: [] }
          : null,
    games: async (ids) => GAMES.filter((g) => ids.includes(g.id)),
  };

  it('names the side to move in the strongest games after each move, once, highest rated first', async () => {
    const found = await movePlayers(reader, START_FEN, ['e4', 'd4', 'Nf3'], 3);
    expect(found.get('e4')).toEqual([
      { name: 'Carlsen, Magnus', rating: 2860 },
      { name: 'Caruana, Fabiano', rating: 2800 },
      { name: 'Firouzja, Alireza', rating: 2780 },
    ]);
    // Held, but with no games kept; not held at all.
    expect(found.get('d4')).toEqual([]);
    expect(found.get('Nf3')).toEqual([]);
  });

  it('reads Black’s name when Black is to move, and skips a move the rules refuse', async () => {
    const black: MovePlayersReader = {
      position: async () => ({ key: '', moves: [], games: ['a'] }),
      games: async () => [game('a', 'W', 2800, 'Nepomniachtchi, Ian')],
    };
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const found = await movePlayers(black, fen, ['c5', 'Ke2']);
    expect(found.get('c5')).toEqual([{ name: 'Nepomniachtchi, Ian', rating: 2700 }]);
    expect(found.has('Ke2')).toBe(false);
  });
  it('does not credit a player who reached only the resulting position by another move', async () => {
    const start = Position.fromFen(START_FEN);
    if (!start.ok) throw new Error('start');
    let position = start.value;
    for (const san of ['Nf3', 'Nf6', 'd4', 'd5']) {
      const played = position.advanceSan(san);
      if (!played.ok) throw new Error('move');
      position = played.value.next;
    }
    const reader: MovePlayersReader = {
      position: async () => ({ key: '', moves: [], games: ['right', 'wrong', 'missing'] }),
      games: async () => [
        { ...game('right', 'Played c4', 2500, 'B'), moves: '1. Nf3 Nf6 2. d4 d5 3. c4' },
        { ...game('wrong', 'Played Nf3', 2800, 'B'), moves: '1. d4 d5 2. c4 Nf6 3. Nf3' },
        { ...game('missing', 'No moves', 2900, 'B'), moves: '' },
      ],
    };
    const result = await movePlayers(reader, position.fen, ['c4']);
    expect(result.get('c4')).toEqual([{ name: 'Played c4', rating: 2500 }]);
  });
});
