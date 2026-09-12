import { describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { UciTransport } from './transport';
import type { EngineCapabilities } from './types';
import { UciSession } from './uci-session';

const capabilities: EngineCapabilities = {
  multiPv: true,
  searchMoves: true,
  threads: false,
  hash: true,
  syzygy: false,
  nnue: false,
  maxThreads: 1,
  maxHashMb: 16,
};
const request = { fen: START_FEN, limit: { kind: 'infinite' as const } };
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function harness() {
  const listeners = new Set<(line: string) => void>();
  const sent: string[] = [];
  const transport: UciTransport = {
    onLine(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    send(command) {
      sent.push(command);
    },
    waitFor: vi.fn(async () => {
      throw new Error('stop acknowledgement timed out');
    }),
    dispose: vi.fn(() => listeners.clear()),
  };
  const emit = (line: string) => {
    for (const listener of [...listeners]) listener(line);
  };
  return {
    transport,
    emit,
    sent,
    session: new UciSession(transport, { name: 'Protocol fixture' }, [], capabilities),
  };
}

describe('engine evidence cannot cross a failed session boundary', () => {
  it('closes an unresponsive process instead of attributing its late output to a new position', async () => {
    const { session, transport, emit, sent } = harness();
    const old = session.analyse(request, () => {});
    void old.finished.catch(() => {});
    await flush();
    emit('info depth 10 score cp 25 pv e2e4');
    const move = Position.initial().playUci('e2e4');
    if (!move.ok) throw new Error('bad fixture');
    const update = vi.fn();
    const next = session.analyse({ ...request, fen: move.value.after }, update);
    const outcome = next.finished.then(
      () => 'resolved',
      () => 'rejected',
    );
    await flush();
    emit('info depth 20 score cp 40 pv e7e5');
    emit('bestmove e7e5');
    expect(await outcome).toBe('rejected');
    expect(transport.dispose).toHaveBeenCalled();
    expect(sent.filter((line) => line.startsWith('position'))).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a search that crashes after info and never publishes a completed evaluation', async () => {
    const { session, emit, transport } = harness();
    const update = vi.fn();
    const handle = session.analyse(request, update);
    const rejected = handle.finished.catch((error: unknown) => error);
    await flush();
    emit('info depth 8 score cp 12 pv e2e4');
    emit('#error process crashed');
    expect(transport.dispose).toHaveBeenCalled();
    expect(await rejected).toBeInstanceOf(Error);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not accept extra characters in a UCI move', () => {
    expect(Position.initial().playUci('e2e4garbage').ok).toBe(false);
    expect(Position.initial().playUci('e2e4q').ok).toBe(false);
  });

  it('drops a bestmove that is not a legal move in the position it was asked about', async () => {
    for (const [line, expected] of [
      ['bestmove a1h8', undefined], // squares exist; the move does not
      ['bestmove e2e4', 'e2e4'],
      ['bestmove e7e5', undefined], // the other side's move
      ['bestmove e1g1', undefined], // castling with the pieces in the way
      ['bestmove e2e4q', undefined], // a promotion suffix on a pawn push
      ['bestmove 0000', undefined], // the null move some engines emit
    ] as const) {
      const { session, emit } = harness();
      const handle = session.analyse(request, () => {});
      await flush();
      emit('info depth 5 score cp 10 pv e2e4');
      emit(line);
      const analysis = await handle.finished;
      expect(analysis.complete, line).toBe(true);
      expect(analysis.bestMove, line).toBe(expected);
    }
  });

  it('survives any bytes an engine can write, and never throws on a line', async () => {
    const { session, emit } = harness();
    const update = vi.fn();
    const handle = session.analyse(request, update);
    await flush();
    let seed = 46;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const vocabulary = [
      'info',
      'depth',
      'score',
      'cp',
      'mate',
      'pv',
      'bestmove',
      'e2e4',
      'a1h8',
      'nodes',
      '-1',
      '999999999999',
      'NaN',
      'string',
      '',
      '\u0000',
      'multipv',
      '0',
      'ponder',
      'currmove',
    ];
    for (let i = 0; i < 2000; i += 1) {
      const words = Array.from(
        { length: next() % 12 },
        () => vocabulary[next() % vocabulary.length],
      );
      expect(() => emit(words.join(' '))).not.toThrow();
    }
    expect(() => emit('info depth ' + 'x'.repeat(100_000))).not.toThrow();
    emit('bestmove e2e4');
    const analysis = await handle.finished;
    expect(analysis.bestMove).toBe('e2e4');
    // Whatever the noise said, every published line is a legal continuation.
    for (const line of analysis.lines) {
      let position = Position.initial();
      for (const move of line.moves) {
        const played = position.playUci(move);
        if (!played.ok) break;
        position = Position.fromTrustedFen(played.value.after);
      }
    }
  });
});
