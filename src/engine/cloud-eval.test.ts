import { describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';

import { CLOUD_EVAL_ENDPOINT, fetchCloudEvaluation } from './cloud-eval';

const respond = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? '' : JSON.stringify(body), { status }));

describe('Lichess cloud evaluation', () => {
  it('asks for the position and reads the stored lines, replayed through the rules', async () => {
    const request = respond(200, {
      fen: START_FEN,
      depth: 55,
      knodes: 3102803,
      pvs: [
        { moves: 'e2e4 e7e5 g1f3', cp: 25 },
        { moves: 'd2d4 g8f6', cp: 20 },
        { moves: 'c2c4', mate: -12 },
      ],
    });
    const answer = await fetchCloudEvaluation(START_FEN, { fetch: request as never });
    const url = String(request.mock.calls[0]?.[0 as never]);
    expect(url.startsWith(`${CLOUD_EVAL_ENDPOINT}?fen=`)).toBe(true);
    expect(url).toContain('multiPv=3');
    expect(answer).toEqual({
      status: 'found',
      evaluation: {
        source: 'lichess-cloud',
        fen: START_FEN,
        depth: 55,
        knodes: 3102803,
        lines: [
          {
            score: { kind: 'cp', cp: 25 },
            san: ['e4', 'e5', 'Nf3'],
            uci: ['e2e4', 'e7e5', 'g1f3'],
          },
          { score: { kind: 'cp', cp: 20 }, san: ['d4', 'Nf6'], uci: ['d2d4', 'g8f6'] },
          { score: { kind: 'mate', moves: -12 }, san: ['c4'], uci: ['c2c4'] },
        ],
      },
    });
  });

  it('stops a stored line at the first move the rules refuse', async () => {
    const answer = await fetchCloudEvaluation(START_FEN, {
      fetch: respond(200, {
        depth: 30,
        knodes: 10,
        pvs: [{ moves: 'e2e4 e7e5 e1e3', cp: 10 }],
      }) as never,
    });
    expect(answer.status === 'found' && answer.evaluation.lines[0]!.san).toEqual(['e4', 'e5']);
  });

  it('tells "no stored analysis" apart from "slow down" and from a failure', async () => {
    expect(await fetchCloudEvaluation(START_FEN, { fetch: respond(404) as never })).toEqual({
      status: 'absent',
    });
    expect(await fetchCloudEvaluation(START_FEN, { fetch: respond(429) as never })).toEqual({
      status: 'rate-limited',
    });
    expect((await fetchCloudEvaluation(START_FEN, { fetch: respond(500) as never })).status).toBe(
      'failed',
    );
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchCloudEvaluation(START_FEN, { fetch: offline as never })).toEqual({
      status: 'failed',
      message: 'lichess.org could not be reached.',
    });
  });

  it('reads castling written as the king taking its rook, and only when that is not a move', async () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const answer = await fetchCloudEvaluation(fen as never, {
      fetch: respond(200, { depth: 40, knodes: 5, pvs: [{ moves: 'e1h1 g8f6', cp: 30 }] }) as never,
    });
    expect(answer.status === 'found' && answer.evaluation.lines[0]!.san).toEqual(['O-O', 'Nf6']);
  });
});
