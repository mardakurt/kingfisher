import { afterEach, describe, expect, it, vi } from 'vitest';

import { cp } from '@/chess/evaluation';
import { positionFeatures } from '@/chess/features';
import { parseFen, START_FEN } from '@/chess/fen';
import { expect as unwrap } from '@/chess/result';
import { asSan, asUci } from '@/chess/types';
import type { EngineAnalysis } from '@/engine/types';

import { buildEvidencePacket, citedMoves, renderPacket } from './evidence';
import { AssistantError, createAssistantProvider, OpenAiCompatibleProvider } from './provider';
import { systemPrompt, userPrompt } from './prompt';

const formatScore = () => '+0.30';

const analysis = (moves: string[]): EngineAnalysis =>
  ({
    fen: START_FEN,
    depth: 26,
    lines: [{ rank: 1, score: cp(30), depth: 26, moves: moves.map(asUci), san: moves.map(asSan) }],
  }) as unknown as EngineAnalysis;

const base = () =>
  buildEvidencePacket({
    fen: START_FEN,
    sideToMove: 'w',
    engines: [{ name: 'Stockfish', analysis: analysis(['e4', 'e5']) }],
    databaseName: 'Lichess Masters',
    databaseTotal: 1000,
    databaseMoves: [
      { uci: asUci('e2e4'), san: asSan('e4'), games: 400, white: 160, draws: 160, black: 80 },
    ],
    features: positionFeatures(unwrap(parseFen(START_FEN))),
    formatScore,
  });

describe('what the packet contains', () => {
  it('records which sources actually carry data', () => {
    const packet = base();
    expect(packet.present).toContain('engine');
    expect(packet.present).toContain('database');
    expect(packet.present).toContain('position-features');
    expect(packet.present).not.toContain('tablebase');
    expect(packet.present).not.toContain('repertoire');
  });

  it('computes frequency against the position total and score for the mover', () => {
    const move = base().database?.moves[0];
    expect(move?.frequencyPercent).toBe(40);
    // White scores (160 + 160/2) / 400.
    expect(move?.scorePercent).toBe(60);
  });

  it('flips the score when Black is to move', () => {
    const packet = buildEvidencePacket({
      fen: START_FEN,
      sideToMove: 'b',
      databaseTotal: 400,
      databaseMoves: [
        { uci: asUci('e2e4'), san: asSan('e4'), games: 400, white: 160, draws: 160, black: 80 },
      ],
      formatScore,
    });
    expect(packet.database?.moves[0]?.scorePercent).toBe(40);
  });

  it('keeps engine lines in SAN, because an unreadable line cannot be checked', () => {
    expect(base().engines[0]?.lines[0]?.moves).toEqual([asSan('e4'), asSan('e5')]);
  });

  it('holds no evidence at all for an empty position', () => {
    const packet = buildEvidencePacket({ fen: START_FEN, sideToMove: 'w', formatScore });
    expect(packet.present).toEqual([]);
    expect(packet.engines).toEqual([]);
    expect(packet.database).toBeNull();
  });
});

describe('rendering the packet', () => {
  it('labels every section with its source', () => {
    const text = renderPacket(base());
    expect(text).toMatch(/ENGINE \(Stockfish, depth 26\)/);
    expect(text).toMatch(/DATABASE \(Lichess Masters, 1000 games here\)/);
    expect(text).toMatch(/POSITION FEATURES/);
  });

  it('says out loud which sources have nothing, so the model can decline', () => {
    const text = renderPacket(base());
    expect(text).toMatch(/NO EVIDENCE AVAILABLE FROM: .*repertoire/);
    expect(text).toMatch(/NO EVIDENCE AVAILABLE FROM: .*tablebase/);
  });

  it('marks tablebase results as proved rather than evaluated', () => {
    const packet = buildEvidencePacket({
      fen: START_FEN,
      sideToMove: 'w',
      tablebase: {
        fen: START_FEN,
        category: 'win',
        dtz: 9,
        dtm: 43,
        checkmate: false,
        stalemate: false,
        moves: [],
        source: 'test',
      },
      formatScore,
    });
    expect(renderPacket(packet)).toMatch(/TABLEBASE \(proved, not evaluated\)/);
  });

  it('collects every move the evidence mentions, for checking an answer', () => {
    const moves = citedMoves(base());
    expect(moves.has('e4')).toBe(true);
    expect(moves.has('Nf3')).toBe(false);
  });
});

describe('the instructions the model is given', () => {
  it('forbids numbers that are not in the evidence', () => {
    const system = systemPrompt('explain');
    expect(system).toMatch(/Never state an evaluation, a percentage, a game count/);
    expect(system).toMatch(/Never invent games, players/);
  });

  it('requires an admission when the evidence does not answer the question', () => {
    expect(systemPrompt('plan')).toMatch(/say which section is missing/);
  });

  it('keeps tablebase results out of centipawns', () => {
    expect(systemPrompt('explain')).toMatch(/proved, not evaluated; never describe them in/);
  });

  it('changes only the mode line between modes', () => {
    expect(systemPrompt('plan')).toMatch(/MODE: Plans/);
    expect(systemPrompt('calculate')).toMatch(/MODE: Calculation/);
  });

  it('puts the evidence before the question', () => {
    const prompt = userPrompt(base(), 'Why e4?');
    expect(prompt.indexOf('EVIDENCE')).toBeLessThan(prompt.indexOf('QUESTION'));
    expect(prompt).toMatch(/Why e4\?/);
  });

  it('supplies a default question rather than sending an empty one', () => {
    expect(userPrompt(base(), '   ')).toMatch(/Explain this position using the evidence/);
  });
});

describe('the provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is null until a base URL and a model are configured', () => {
    expect(createAssistantProvider({ baseUrl: '', model: '', apiKey: '' })).toBeNull();
    expect(createAssistantProvider({ baseUrl: 'http://x/v1', model: '', apiKey: '' })).toBeNull();
    expect(
      createAssistantProvider({ baseUrl: 'http://x/v1', model: 'm', apiKey: '' }),
    ).not.toBeNull();
  });

  it('sends no Authorization header when there is no key, which is the local case', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      apiKey: '',
    });
    await provider.ask({ system: 's', user: 'u' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('reports a malformed response instead of smoothing it over', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x/v1',
      model: 'm',
      apiKey: '',
    });
    await expect(provider.ask({ system: 's', user: 'u' })).rejects.toBeInstanceOf(AssistantError);
  });

  it('reports an empty answer rather than presenting it as no opinion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] }), {
          status: 200,
        }),
      ),
    );
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x/v1',
      model: 'm',
      apiKey: '',
    });
    await expect(provider.ask({ system: 's', user: 'u' })).rejects.toThrow(/empty answer/);
  });

  it('explains a rejected key rather than reporting a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x/v1',
      model: 'm',
      apiKey: 'k',
    });
    await expect(provider.ask({ system: 's', user: 'u' })).rejects.toMatchObject({
      remedy: expect.stringContaining('API key'),
    });
  });
});
