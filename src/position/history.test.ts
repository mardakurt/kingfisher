import { describe, expect, it } from 'vitest';

import { positionHistory, type HistoryGame } from './history';

const g = (
  id: string,
  white: string,
  black: string,
  result: HistoryGame['result'],
  date?: string,
): HistoryGame => ({
  id,
  white,
  black,
  result,
  ...(date ? { date } : {}),
});

describe('a position’s history', () => {
  it('finds the first and the latest dated game, by full date where there is one', () => {
    const history = positionHistory([
      g('a', 'Fischer, R', 'Spassky, B', '1-0', '1972.07.23'),
      g('b', 'Tal, M', 'Botvinnik, M', '1/2-1/2', '1960.03.15'),
      g('c', 'Tal, M', 'Smyslov, V', '0-1', '1960.03.02'),
      g('d', 'Carlsen, M', '?', '1-0', '2024.??.??'),
      g('e', 'Unknown', 'Unknown', '*'),
    ]);
    expect(history.first?.id).toBe('c');
    expect(history.latest?.id).toBe('d');
    expect(history.games).toBe(5);
    expect(history.undated).toBe(1);
  });

  it('counts every year from first to last, the empty ones too, with White’s score', () => {
    const history = positionHistory([
      g('a', 'A', 'B', '1-0', '2020.01.01'),
      g('b', 'A', 'B', '1/2-1/2', '2020.06.01'),
      g('c', 'A', 'B', '*', '2022.01.01'),
    ]);
    expect(history.byYear).toEqual([
      { year: 2020, games: 2, whitePoints: 1.5, decided: 2 },
      { year: 2021, games: 0, whitePoints: 0, decided: 0 },
      { year: 2022, games: 1, whitePoints: 0, decided: 0 },
    ]);
  });

  it('names the players who reach it most, by spelling-insensitive name, and never "?"', () => {
    const history = positionHistory([
      g('a', 'Tal, M', 'X', '1-0', '1960'),
      g('b', 'tal,  m', 'Y', '1-0', '1961'),
      g('c', 'Z', 'Tal, M', '1-0', '1962'),
      g('d', '?', 'X', '1-0', '1963'),
    ]);
    expect(history.players[0]).toEqual({ name: 'Tal, M', games: 3, asWhite: 2, asBlack: 1 });
    expect(history.players.map((player) => player.name)).not.toContain('?');
  });

  it('has nothing to say about a position no game reached', () => {
    expect(positionHistory([])).toEqual({
      games: 0,
      undated: 0,
      byYear: [],
      first: null,
      latest: null,
      players: [],
    });
  });
});
