import { describe, expect, it } from 'vitest';

import type { Fen, San, Uci } from '@/chess/types';
import type { JournalEntryRecord, PreparationSessionRecord } from '@/persistence/domain';

import { buildRoundBrief, type BriefInput } from './brief';
import { briefToHtml } from './brief-html';
import type { OpponentDossier } from './dossier';
import type { PreparationEdge } from './index';
import type { Surprise } from './surprises';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen;

const session = (overrides: Partial<PreparationSessionRecord> = {}): PreparationSessionRecord =>
  ({
    id: 's1',
    title: 'Round 3',
    opponent: 'Rival, R',
    myColor: 'w',
    event: 'Club Open',
    round: '3',
    gameDate: '2026-09-23',
    repertoireIds: [],
    studyIds: [],
    openingFileIds: [],
    sheet: [],
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    ...overrides,
  }) as PreparationSessionRecord;

const dossier = (): OpponentDossier => ({
  name: 'Rival, R',
  games: 40,
  recentFromYear: 2024,
  white: { color: 'w', games: 20, score: 0.5, firstMoves: [], openings: [] },
  black: {
    color: 'b',
    games: 20,
    score: 0.45,
    firstMoves: [
      {
        label: '1...c5',
        games: 14,
        frequency: 0.7,
        recentGames: 6,
        recentFrequency: 0.6,
        score: 0.5,
      },
    ],
    openings: [
      {
        label: 'Sicilian',
        games: 14,
        frequency: 0.7,
        recentGames: 6,
        recentFrequency: 0.6,
        score: 0.5,
      },
    ],
  },
});

const surprise = (): Surprise => ({
  positionKey: 'k1',
  fen: START,
  san: 'Nh6' as San,
  uci: 'g8h6' as Uci,
  depth: 3,
  theirGames: 2,
  theirTotal: 2,
  sourceGames: 35_220,
  sourceShare: 0,
  sourceName: 'Kingfisher Starter Reference',
});

const gap = (): PreparationEdge => ({
  uci: 'g7g6' as Uci,
  san: 'g6' as San,
  games: 5,
  frequency: 0.2,
  recentGames: 1,
  recentFrequency: 0.1,
  playerScore: 0.5,
  resultingKey: 'k2',
  resultingFen: START,
});

const journalEntry = (): JournalEntryRecord => ({
  id: 'j1',
  fingerprint: 'fp',
  title: 'Kurt, Metin – Other, O',
  date: '2026.09.20',
  learningPoint: 'Four minutes on move two is the whole game.',
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
});

const input = (overrides: Partial<BriefInput> = {}): BriefInput => ({
  session: session(),
  now: Date.UTC(2026, 8, 22),
  ...overrides,
});

describe('buildRoundBrief', () => {
  it('heads the brief with the round, the colour and the date', () => {
    const brief = buildRoundBrief(input());
    expect(brief.heading).toBe('Round 3 · vs Rival, R · Club Open · Round 3');
    expect(brief.playing).toBe('White');
    expect(brief.date).toBe('2026-09-23');
  });

  it('reports what they play with the colour they will have, not the other one', () => {
    const brief = buildRoundBrief(input({ dossier: dossier() }));
    const section = brief.sections[0]!;
    expect(section.title).toBe('What they play with Black');
    expect(section.lines.some((line) => line.includes('1...c5'))).toBe(true);
    expect(section.provenance).toContain('40 of their games');
    expect(section.provenance).toContain('2024 onwards');
  });

  it('says which input was missing rather than dropping the section', () => {
    const brief = buildRoundBrief(input());
    for (const section of brief.sections) {
      expect(section.lines).toEqual([]);
      expect(section.missing, section.title).toBeTruthy();
    }
    expect(brief.sections[1]!.missing).toContain('what everybody plays');
    expect(brief.sections[3]!.missing).toContain('After the round');
  });

  it('carries each surprise with all three denominators', () => {
    const brief = buildRoundBrief(input({ surprises: [surprise()] }));
    expect(brief.sections[1]!.lines[0]).toBe(
      'Nh6 — 2 of their 2 games here; none of 35,220 in Kingfisher Starter Reference',
    );
  });

  it('carries gaps and the last rounds’ own lessons', () => {
    const brief = buildRoundBrief(input({ gaps: [gap()], journal: [journalEntry()] }));
    expect(brief.sections[2]!.lines[0]).toContain('g6 — 5 of their games, no prepared reply');
    expect(brief.sections[3]!.lines[0]).toContain('Four minutes on move two');
  });

  it('carries the curated sheet as cards', () => {
    const brief = buildRoundBrief(
      input({
        session: session({
          sheet: [
            {
              id: 'c1',
              positionKey: 'k',
              fen: START,
              line: ['e4' as San, 'c5' as San],
              why: 'They always go here.',
              intendedSan: 'Nf3' as San,
              createdAt: 1,
            },
          ],
        }),
      }),
    );
    expect(brief.cards).toEqual([
      { line: 'e4 c5', fen: START, why: 'They always go here.', intend: 'Nf3' },
    ]);
  });
});

describe('briefToHtml', () => {
  it('is one file with the boards inside it', () => {
    const brief = buildRoundBrief(
      input({
        dossier: dossier(),
        surprises: [surprise()],
        session: session({
          sheet: [{ id: 'c1', positionKey: 'k', fen: START, line: ['e4' as San], createdAt: 1 }],
        }),
      }),
    );
    const html = briefToHtml(brief);
    expect(html).not.toMatch(/<script|<link|<img/i);
    /*
      Nothing the browser would fetch. An SVG's `xmlns` is an XML namespace
      name that happens to be spelled as a URL and is never resolved, so the
      check is on `src`/`href`, which are.
    */
    expect(html).not.toMatch(/(?:src|href)\s*=\s*"[^"]*:\/\//i);
    expect(html).toContain('<svg');
    expect(html).toContain('What they play with Black');
    expect(html).toContain('none of 35,220');
    expect(html).toContain('Playing White');
    expect(html).toContain('prepared 2026-09-22');
    expect(html).toContain('names the population it came from');
  });

  it('prints the missing sentence where a section has nothing', () => {
    const html = briefToHtml(buildRoundBrief(input()));
    expect(html).toContain('there is nothing to describe');
  });
});
