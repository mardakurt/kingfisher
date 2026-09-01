import { describe, expect, it } from 'vitest';

import {
  formatGoCommand,
  formatPositionCommand,
  parseInfo,
  parseOption,
  parseUciLine,
} from './uci';

describe('parseUciLine', () => {
  it('reads identity and handshake messages', () => {
    expect(parseUciLine('id name Stockfish 17.1')).toEqual({
      kind: 'id',
      name: 'Stockfish 17.1',
    });
    expect(parseUciLine('id author the Stockfish developers')).toEqual({
      kind: 'id',
      author: 'the Stockfish developers',
    });
    expect(parseUciLine('uciok')).toEqual({ kind: 'uciok' });
    expect(parseUciLine('readyok')).toEqual({ kind: 'readyok' });
  });

  it('reads bestmove with and without a ponder move', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      kind: 'bestmove',
      best: 'e2e4',
      ponder: 'e7e5',
    });
    expect(parseUciLine('bestmove d7d8q')).toEqual({ kind: 'bestmove', best: 'd7d8q' });
    expect(parseUciLine('bestmove (none)')).toEqual({ kind: 'bestmove', best: null });
  });

  it('leaves unknown chatter alone', () => {
    expect(parseUciLine('Stockfish 17.1 by the Stockfish developers')).toEqual({
      kind: 'other',
      text: 'Stockfish 17.1 by the Stockfish developers',
    });
  });
});

describe('parseInfo', () => {
  it('reads a full search line', () => {
    const message = parseUciLine(
      'info depth 24 seldepth 33 multipv 1 score cp 34 nodes 12345678 nps 1234567 hashfull 450 tbhits 0 time 10000 pv e2e4 e7e5 g1f3',
    );
    expect(message.kind).toBe('info');
    if (message.kind !== 'info') return;

    expect(message.info).toEqual({
      depth: 24,
      seldepth: 33,
      multipv: 1,
      score: { kind: 'cp', cp: 34 },
      nodes: 12345678,
      nps: 1234567,
      hashFull: 450,
      tbHits: 0,
      timeMs: 10000,
      pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });

  it('reads mate scores in both directions', () => {
    expect(parseInfo('depth 12 score mate 5 pv h5f7').score).toEqual({ kind: 'mate', moves: 5 });
    expect(parseInfo('depth 12 score mate -3 pv a1a2').score).toEqual({ kind: 'mate', moves: -3 });
  });

  it('records bounds without losing the score', () => {
    const info = parseInfo('depth 20 score cp 128 lowerbound nodes 5 pv e2e4');
    expect(info.score).toEqual({ kind: 'cp', cp: 128 });
    expect(info.bound).toBe('lower');
    expect(info.pv).toEqual(['e2e4']);
  });

  it('stops the principal variation at the end of the line', () => {
    const info = parseInfo('depth 3 pv e2e4 e7e5');
    expect(info.pv).toEqual(['e2e4', 'e7e5']);
  });

  it('captures currmove progress reports', () => {
    const info = parseInfo('depth 18 currmove g1f3 currmovenumber 2');
    expect(info.currMove).toBe('g1f3');
    expect(info.currMoveNumber).toBe(2);
  });

  it('captures info strings verbatim', () => {
    expect(parseInfo('string NNUE evaluation using nn-1234.nnue').text).toBe(
      'NNUE evaluation using nn-1234.nnue',
    );
  });

  it('survives a truncated line', () => {
    expect(() => parseInfo('depth')).not.toThrow();
    expect(parseInfo('depth').depth).toBeUndefined();
  });
});

describe('parseOption', () => {
  it('reads a spin option with bounds', () => {
    expect(parseOption('option name MultiPV type spin default 1 min 1 max 500')).toEqual({
      name: 'MultiPV',
      type: 'spin',
      defaultValue: '1',
      min: 1,
      max: 500,
    });
  });

  it('reads a combo option with choices', () => {
    expect(parseOption('option name Style type combo default Normal var Solid var Normal')).toEqual(
      { name: 'Style', type: 'combo', defaultValue: 'Normal', choices: ['Solid', 'Normal'] },
    );
  });

  it('reads a button and a name containing spaces', () => {
    expect(parseOption('option name Clear Hash type button')).toEqual({
      name: 'Clear Hash',
      type: 'button',
    });
  });
});

describe('command formatting', () => {
  it('builds position commands', () => {
    expect(formatPositionCommand('startpos-fen')).toBe('position fen startpos-fen');
    expect(formatPositionCommand('fen', ['e2e4', 'e7e5'])).toBe('position fen fen moves e2e4 e7e5');
  });

  it('builds go commands for every limit', () => {
    expect(formatGoCommand({ kind: 'infinite' })).toBe('go infinite');
    expect(formatGoCommand({ kind: 'depth', depth: 30 })).toBe('go depth 30');
    expect(formatGoCommand({ kind: 'nodes', nodes: 500000 })).toBe('go nodes 500000');
    expect(formatGoCommand({ kind: 'movetime', ms: 2500 })).toBe('go movetime 2500');
    expect(formatGoCommand({ kind: 'infinite' }, ['e2e4', 'd2d4'])).toBe(
      'go infinite searchmoves e2e4 d2d4',
    );
  });
});
