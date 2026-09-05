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
});
