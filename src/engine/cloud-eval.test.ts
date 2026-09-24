import { describe, expect, it } from 'vitest';

import type { Fen } from '@/chess/types';

import { fetchCloudEval, parseCloudEval } from './cloud-eval';

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' as Fen;

/** The response Lichess returned for this position on 2026-09-24, trimmed to two lines. */
const RECORDED = {
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  knodes: 119133,
  depth: 60,
  pvs: [
    { moves: 'e7e5 g1f3 b8c6 f1b5 g8f6 e1h1 f6e4 f1e1 e4d6 f3e5', cp: 22 },
    { moves: 'c7c6 d2d4 d7d5 e4e5 c6c5 g1f3 c5d4 f3d4 b8c6 d4c6', cp: 27 },
  ],
};

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const requests: string[] = [];
  const fetchImpl = (async (url: string) => {
    requests.push(url);
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe('parseCloudEval', () => {
  it('reads a recorded response, keeping the White-relative score as it is', () => {
    const parsed = parseCloudEval(FEN, RECORDED);
    expect(parsed).toMatchObject({ kind: 'found', depth: 60, knodes: 119133 });
    if (parsed.kind !== 'found') return;
    expect(parsed.lines[0]!.moves.slice(0, 2)).toEqual(['e7e5', 'g1f3']);
    // Black to move and +0.22: White is better, as Lichess means it.
    expect(parsed.lines[0]!.score).toEqual({ kind: 'cp', cp: 22 });
  });

  it('reads a mate score', () => {
    const parsed = parseCloudEval(FEN, { depth: 30, pvs: [{ moves: 'd8h4', mate: -1 }] });
    expect(parsed.kind === 'found' && parsed.lines[0]!.score).toEqual({ kind: 'mate', moves: -1 });
  });

  it('refuses a body without an evaluation instead of inventing one', () => {
    expect(parseCloudEval(FEN, { depth: 12, pvs: [] }).kind).toBe('unavailable');
    expect(parseCloudEval(FEN, { pvs: [{ moves: 'e7e5', cp: 1 }] }).kind).toBe('unavailable');
    expect(parseCloudEval(FEN, 'nonsense').kind).toBe('unavailable');
  });
});

describe('fetchCloudEval', () => {
  it('asks for the position and the number of lines, capped at five', async () => {
    const { fetchImpl, requests } = respond(200, RECORDED);
    const result = await fetchCloudEval(FEN, 9, undefined, fetchImpl);
    expect(result.kind).toBe('found');
    const url = new URL(requests[0]!);
    expect(url.origin + url.pathname).toBe('https://lichess.org/api/cloud-eval');
    expect(url.searchParams.get('fen')).toBe(FEN);
    expect(url.searchParams.get('multiPv')).toBe('5');
  });

  it('says a position has no stored evaluation when Lichess answers 404', async () => {
    const { fetchImpl } = respond(404, {
      error: 'No cloud evaluation available for that position',
    });
    expect(await fetchCloudEval(FEN, 1, undefined, fetchImpl)).toEqual({ kind: 'none', fen: FEN });
  });

  it('passes a rate limit on with the wait Lichess asked for', async () => {
    const { fetchImpl } = respond(429, undefined, { 'Retry-After': '60' });
    expect(await fetchCloudEval(FEN, 1, undefined, fetchImpl)).toEqual({
      kind: 'rate-limited',
      fen: FEN,
      retryAfterMs: 60_000,
    });
  });

  it('turns a dropped connection into a sentence, not an exception', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await fetchCloudEval(FEN, 1, undefined, failing)).toMatchObject({
      kind: 'unavailable',
      message: 'Lichess could not be reached.',
    });
  });
});
