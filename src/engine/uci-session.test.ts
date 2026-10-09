/**
 * What a session does with an answer it did not ask for.
 *
 * `searchmoves` is the part of a search request an engine may quietly ignore,
 * and three of the five engines Kingfisher can install on macOS do ignore it.
 * These tests pin the two halves of the response: the restriction is only
 * offered when the engine was measured to support it, and the result is
 * checked against what was asked rather than assumed to match it.
 */

import { describe, expect, it } from 'vitest';

import { asFen, asUci } from '@/chess/types';

import { capabilitiesFrom } from './companion/provider';
import type { UciTransport } from './transport';
import { UciSession } from './uci-session';
import type { EngineCapabilities } from './types';

const START = asFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

const CAPABILITIES: EngineCapabilities = {
  multiPv: true,
  searchMoves: true,
  threads: true,
  hash: true,
  syzygy: false,
  nnue: false,
  maxThreads: 1,
  maxHashMb: 16,
};

/** A transport that answers `go` with whatever bestmove the test names. */
function scripted(bestMove: string) {
  const listeners = new Set<(line: string) => void>();
  const sent: string[] = [];
  const emit = (line: string) => {
    for (const listener of [...listeners]) listener(line);
  };
  const transport: UciTransport = {
    onLine(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(command) {
      sent.push(command);
      if (command === 'isready') queueMicrotask(() => emit('readyok'));
      if (command.startsWith('go')) {
        queueMicrotask(() => {
          emit(`info depth 8 multipv 1 score cp 20 pv ${bestMove}`);
          emit(`bestmove ${bestMove}`);
        });
      }
    },
    async waitFor() {
      return '';
    },
    dispose() {
      listeners.clear();
    },
  };
  return { transport, sent };
}

describe('a restricted search', () => {
  it('reports the restriction honoured when the answer is one of the moves asked about', async () => {
    const { transport } = scripted('a2a3');
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const handle = session.analyse(
      { fen: START, limit: { kind: 'depth', depth: 8 }, searchMoves: [asUci('a2a3')] },
      () => {},
    );
    const analysis = await handle.finished;
    expect(analysis.restrictionHonoured).toBe(true);
  });

  it('reports the restriction ignored when the engine answers with another move', async () => {
    const { transport } = scripted('e2e4');
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const handle = session.analyse(
      { fen: START, limit: { kind: 'depth', depth: 8 }, searchMoves: [asUci('a2a3')] },
      () => {},
    );
    const analysis = await handle.finished;
    // The numbers are real; what they are evidence *about* is not what was
    // asked, and the session says so rather than letting a panel imply it.
    expect(analysis.restrictionHonoured).toBe(false);
  });

  it('says nothing about a restriction that was never requested', async () => {
    const { transport } = scripted('e2e4');
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const handle = session.analyse({ fen: START, limit: { kind: 'depth', depth: 8 } }, () => {});
    expect((await handle.finished).restrictionHonoured).toBeUndefined();
  });
});

describe('capabilities of a native engine', () => {
  it('does not claim searchmoves for an engine nobody has asked', () => {
    expect(capabilitiesFrom([]).searchMoves).toBe(false);
  });

  it('claims searchmoves only when the companion measured it', () => {
    const measured = {
      multipv: true,
      searchmoves: true,
      wdl: false,
      syzygy: false,
      threads: true,
      hash: true,
    };
    expect(capabilitiesFrom([], measured).searchMoves).toBe(true);
    expect(capabilitiesFrom([], { ...measured, searchmoves: false }).searchMoves).toBe(false);
  });
});

const AFTER_E4 = asFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');

/** A transport whose `waitFor` really waits, so a test can choose what arrives when. */
function controllable() {
  const listeners = new Set<(line: string) => void>();
  const sent: string[] = [];
  const transport: UciTransport = {
    onLine(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(command) {
      sent.push(command);
    },
    waitFor(match, timeoutMs = 1000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out')), timeoutMs);
        const stop = transport.onLine((line) => {
          if (!match(line)) return;
          clearTimeout(timer);
          stop();
          resolve(line);
        });
      });
    },
    dispose() {
      listeners.clear();
    },
  };
  const emit = (line: string) => {
    for (const listener of [...listeners]) listener(line);
  };
  return { transport, sent, emit };
}

describe('a score that is only a bound', () => {
  it('does not replace an exact line with a bound at the same rank', async () => {
    const { transport, emit } = controllable();
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const handle = session.analyse({ fen: START, limit: { kind: 'depth', depth: 12 } }, () => {});
    await flush();
    emit('info depth 10 score cp 20 pv e2e4');
    emit('info depth 18 score cp 800 lowerbound pv e2e4');
    emit('bestmove e2e4');
    const analysis = await handle.finished;
    expect(analysis.lines[0]?.moves).toEqual(['e2e4']);
    expect(analysis.lines[0]?.score).toEqual({ kind: 'cp', cp: 20 });
    expect(analysis.lines[0]?.bound).toBeUndefined();
    expect(analysis.bestMove).toBe('e2e4');
  });

  it('keeps the bound flag when that rank has no exact score yet', async () => {
    const { transport, emit } = controllable();
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const handle = session.analyse({ fen: START, limit: { kind: 'depth', depth: 12 } }, () => {});
    await flush();
    emit('info depth 8 score cp 800 lowerbound pv e2e4');
    emit('bestmove e2e4');
    const analysis = await handle.finished;
    expect(analysis.lines[0]?.bound).toBe('lower');
    expect(analysis.lines[0]?.score).toEqual({ kind: 'cp', cp: 800 });
    expect(analysis.bestMove).toBe('e2e4');
  });

  it('does not let a bound line become the move when bestmove disagrees', async () => {
    const { transport, emit } = controllable();
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const handle = session.analyse({ fen: START, limit: { kind: 'depth', depth: 12 } }, () => {});
    await flush();
    emit('info depth 12 score cp 900 lowerbound pv d2d4');
    emit('bestmove e2e4');
    const analysis = await handle.finished;
    expect(analysis.bestMove).toBe('e2e4');
    expect(analysis.lines.some((line) => line.moves[0] === 'd2d4')).toBe(false);
  });
});

describe('the gap after stop', () => {
  it('ignores lines until readyok, then searches the new position', async () => {
    const { transport, sent, emit } = controllable();
    const session = new UciSession(transport, { name: 'Test' }, [], CAPABILITIES);
    const first = session.analyse({ fen: START, limit: { kind: 'infinite' } }, () => {});
    void first.finished.catch(() => {});
    await flush();
    const updates: string[] = [];
    const second = session.analyse({ fen: AFTER_E4, limit: { kind: 'infinite' } }, (snapshot) => {
      updates.push(snapshot.bestMove ?? snapshot.lines[0]?.moves[0] ?? '');
    });
    await flush();
    emit('bestmove e2e4');
    await flush();
    expect(sent).toContain('isready');
    expect(sent.filter((line) => line.startsWith('go'))).toEqual(['go infinite']);

    emit('info depth 20 score cp 400 pv e7e5');
    emit('bestmove e7e5');
    await flush();
    let settled = false;
    void second.finished.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flush();
    expect(settled).toBe(false);
    expect(updates).toEqual([]);

    emit('readyok');
    await flush();
    expect(sent.filter((line) => line.startsWith('go'))).toHaveLength(2);
    expect(sent.indexOf('isready')).toBeLessThan(sent.findIndex((line) => line.includes(AFTER_E4)));
    emit('info depth 8 score cp 10 pv d7d5');
    emit('bestmove d7d5');
    const analysis = await second.finished;
    expect(analysis.fen).toBe(AFTER_E4);
    expect(analysis.bestMove).toBe('d7d5');
    expect(analysis.lines.some((line) => line.moves[0] === 'e7e5')).toBe(false);
  });
});

describe('configuration', () => {
  it('sends only the options the engine declared', async () => {
    // Lc0 declares MultiPV but no Hash. A `setoption name Hash` sent to an
    // engine without one is a command it never asked for.
    const { transport, sent } = scripted('e2e4');
    const session = new UciSession(transport, { name: 'Test' }, [], {
      ...CAPABILITIES,
      hash: false,
      threads: false,
    });
    await session.configure({ multiPv: 2, threads: 4, hashMb: 256 });
    expect(sent).toContain('setoption name MultiPV value 2');
    expect(sent.some((line) => line.startsWith('setoption name Hash'))).toBe(false);
    expect(sent.some((line) => line.startsWith('setoption name Threads'))).toBe(false);
  });
});
