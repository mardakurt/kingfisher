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
