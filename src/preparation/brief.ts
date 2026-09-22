/**
 * The round brief: one page to read before the game.
 *
 * Everything in it is already on screen somewhere — the dossier, the
 * surprises, the repertoire comparison, the sheet the player curated, and
 * what they told themselves after the last round. The brief's whole
 * contribution is that it is *one page*, in an order somebody reads under
 * time pressure, and that it can be printed and carried to a venue where
 * there is no laptop.
 *
 * It therefore adds no facts. Every section states the population it came
 * from, and a section with nothing to say says which of its inputs was
 * missing rather than disappearing — a brief that silently omits "their
 * openings" reads as "they have none".
 *
 * Pure: records in, a structure out. The rendering is `brief-html.ts`.
 */

import type { Fen, San } from '@/chess/types';
import type { JournalEntryRecord, PreparationSessionRecord } from '@/persistence/domain';

import type { OpponentDossier, DossierChoice } from './dossier';
import type { PreparationEdge } from './index';
import type { Surprise } from './surprises';

export interface BriefSection {
  readonly title: string;
  readonly lines: readonly string[];
  /** Where these lines came from. Printed under the heading. */
  readonly provenance: string;
  /** Present when the section is empty, saying which input was missing. */
  readonly missing?: string;
}

export interface BriefCard {
  readonly line: string;
  readonly fen: Fen;
  readonly why?: string;
  readonly intend?: San;
}

export interface RoundBrief {
  readonly heading: string;
  readonly playing: 'White' | 'Black';
  readonly date?: string;
  readonly sections: readonly BriefSection[];
  /** The curated sheet, which is the part with the boards. */
  readonly cards: readonly BriefCard[];
  readonly generatedAt: number;
}

export interface BriefInput {
  readonly session: PreparationSessionRecord;
  readonly dossier?: OpponentDossier;
  readonly surprises?: readonly Surprise[];
  readonly gaps?: readonly PreparationEdge[];
  /** The player's own recent learning points, newest first. */
  readonly journal?: readonly JournalEntryRecord[];
  readonly sourceName?: string;
  readonly now?: number;
}

const choice = (entry: DossierChoice): string =>
  `${entry.label} — ${entry.games} games (${(entry.frequency * 100).toFixed(0)}%)` +
  (entry.recentGames > 0 ? `, ${entry.recentGames} recently` : '');

const LIMIT = 6;

export function buildRoundBrief(input: BriefInput): RoundBrief {
  const { session } = input;
  const playing = session.myColor === 'w' ? 'White' : 'Black';
  const theirColor = session.myColor === 'w' ? 'black' : 'white';
  const sections: BriefSection[] = [];

  const side = input.dossier?.[theirColor];
  sections.push({
    title: `What they play with ${theirColor === 'white' ? 'White' : 'Black'}`,
    provenance: input.dossier
      ? `${input.dossier.games} of their games on this machine; "recently" means ${input.dossier.recentFromYear} onwards`
      : 'their games on this machine',
    lines: side
      ? [
          ...side.firstMoves.slice(0, LIMIT).map(choice),
          ...side.openings.slice(0, LIMIT).map(choice),
        ]
      : [],
    ...(side
      ? {}
      : { missing: 'No games of theirs are on this machine, so there is nothing to describe.' }),
  });

  sections.push({
    title: 'Surprises to expect',
    provenance: input.sourceName
      ? `their games against ${input.sourceName}, where your repertoire has no answer`
      : 'their games, where your repertoire has no answer',
    lines: (input.surprises ?? [])
      .slice(0, LIMIT)
      .map(
        (surprise) =>
          `${surprise.san} — ${surprise.theirGames} of their ${surprise.theirTotal} games here; ` +
          (surprise.sourceShare === null
            ? `${surprise.sourceName} has nothing at this position`
            : surprise.sourceShare === 0
              ? `none of ${surprise.sourceGames?.toLocaleString()} in ${surprise.sourceName}`
              : `${(surprise.sourceShare * 100).toFixed(1)}% of ${surprise.sourceGames?.toLocaleString()} in ${surprise.sourceName}`),
      ),
    ...((input.surprises ?? []).length === 0
      ? {
          missing:
            'Nothing qualified: either your repertoire answers what they play, or what they play is what everybody plays.',
        }
      : {}),
  });

  sections.push({
    title: 'Where your repertoire stops',
    provenance: 'their observed continuations, against the repertoire you chose',
    lines: (input.gaps ?? [])
      .slice(0, LIMIT)
      .map((gap) => `${gap.san} — ${gap.games} of their games, no prepared reply`),
    ...((input.gaps ?? []).length === 0
      ? { missing: 'No observed continuation is unanswered — or no repertoire was chosen.' }
      : {}),
  });

  sections.push({
    title: 'From your own last rounds',
    provenance: 'your round journal, newest first',
    lines: (input.journal ?? [])
      .slice(0, 3)
      .map(
        (entry) => `${entry.title}${entry.date ? ` (${entry.date})` : ''}: ${entry.learningPoint}`,
      ),
    ...((input.journal ?? []).length === 0
      ? { missing: 'Nothing filed yet. After the round writes one line per game here.' }
      : {}),
  });

  return {
    heading: [
      session.title,
      session.opponent ? `vs ${session.opponent}` : '',
      session.event,
      session.round ? `Round ${session.round}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    playing,
    ...(session.gameDate ? { date: session.gameDate } : {}),
    sections,
    cards: session.sheet.map((card) => ({
      line: card.line.length ? card.line.join(' ') : 'Position',
      fen: card.fen,
      ...(card.why ? { why: card.why } : {}),
      ...(card.intendedSan ? { intend: card.intendedSan } : {}),
    })),
    generatedAt: input.now ?? Date.now(),
  };
}
