'use client';

/**
 * What they might play that you have not prepared, and that nobody would
 * have warned you about.
 *
 * Three populations, kept apart: your repertoire, this opponent's own games,
 * and one named reference source. Nothing predicts a move; every row is three
 * counts with three denominators (`docs/design/surprise-finder.md`).
 */

import { useQuery } from '@tanstack/react-query';

import { EmptyState } from '@/components/ui/Panel';
import { useDatabaseProviders } from '@/database/use-database-providers';
import type { DatabaseMove } from '@/database/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import type { OpeningTree } from '@/preparation';
import {
  describeSource,
  findSurprises,
  type SourceCount,
  type Surprise,
} from '@/preparation/surprises';
import { usePreferences } from '@/stores/preferences-store';

/** How many repertoire positions one run asks the source about. */
const POSITION_LIMIT = 60;

export function SurprisesPanel({
  repertoire,
  opponent,
  opponentName,
  onOpen,
}: {
  readonly repertoire: readonly RepertoirePositionRecord[];
  readonly opponent: OpeningTree | undefined;
  readonly opponentName: string;
  readonly onOpen: (surprise: Surprise) => void;
}) {
  const sourceId = usePreferences((state) => state.explorerSourceId);
  const providers = useDatabaseProviders();
  const provider = providers.find((entry) => entry.id === sourceId) ?? providers[0];

  /*
    One lookup per position the opponent actually reached, not per repertoire
    position: the source is asked only where there is something to compare it
    with. Bounded by the opponent's own tree, which is their games.
  */
  const counts = useQuery({
    queryKey: [
      'surprises',
      provider?.id ?? 'none',
      opponentName,
      repertoire.length,
      opponent?.nodes.size ?? 0,
    ],
    enabled: Boolean(provider && opponent && repertoire.length > 0),
    retry: false,
    queryFn: async (): Promise<ReadonlyMap<string, SourceCount | null>> => {
      const map = new Map<string, SourceCount | null>();
      const wanted = repertoire.filter((position) => opponent!.nodes.has(position.positionKey));
      for (const position of wanted.slice(0, POSITION_LIMIT)) {
        const node = opponent!.nodes.get(position.positionKey);
        try {
          const result = await provider!.explore({ fen: position.fen, filters: {} });
          const byUci = new Map<string, DatabaseMove>(result.moves.map((move) => [move.uci, move]));
          for (const edge of node?.edges ?? []) {
            const move = byUci.get(edge.uci);
            map.set(
              `${position.positionKey}|${edge.uci}`,
              result.totalGames > 0
                ? {
                    games: result.totalGames,
                    moveGames: move ? move.white + move.draws + move.black : 0,
                  }
                : null,
            );
          }
        } catch {
          /*
            A source that could not answer has said nothing about this
            position. Recorded as null so every row from it prints "has
            nothing here" rather than a share of zero, which would be a claim.
          */
          for (const edge of node?.edges ?? [])
            map.set(`${position.positionKey}|${edge.uci}`, null);
        }
      }
      return map;
    },
  });

  if (repertoire.length === 0) {
    return (
      <EmptyState
        title="No repertoire chosen."
        description="A surprise is a move your repertoire has no answer to, so this needs one. Choose a repertoire above."
      />
    );
  }
  if (!opponent) {
    return (
      <EmptyState
        title="No opponent searched."
        description="A surprise is a move this person has actually played, so this needs their games. Search for them above."
      />
    );
  }

  const rows = counts.data
    ? findSurprises({
        repertoire,
        opponent,
        sourceName: provider?.name ?? 'the reference',
        source: (positionKey, uci) => counts.data!.get(`${positionKey}|${uci}`) ?? null,
      })
    : [];

  return (
    <div className="space-y-2 p-2 text-2xs" data-testid="surprises">
      <p className="text-tertiary">
        Moves {opponentName || 'they'} have played, that your repertoire has no answer to, and that{' '}
        {provider?.name ?? 'the reference'} plays in under 5% of its games there. Three populations,
        three denominators; nothing here says what they will play.
      </p>
      {counts.isFetching ? <p role="status">Asking {provider?.name}…</p> : null}
      {!counts.isFetching && rows.length === 0 ? (
        <p className="text-secondary">
          Nothing qualifies. Either your repertoire answers everything they have played here, or
          what they play is what everybody plays — which is a gap, not a surprise, and the
          Repertoire panel lists it.
        </p>
      ) : null}
      <ul className="space-y-1">
        {rows.map((surprise) => (
          <li key={`${surprise.positionKey}|${surprise.uci}`}>
            <button
              type="button"
              className="w-full rounded-[6px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
              onClick={() => onOpen(surprise)}
            >
              <span className="block font-medium text-primary">
                {surprise.san}
                <span className="ml-1 font-normal text-tertiary">
                  at move {Math.floor(surprise.depth / 2) + 1}
                </span>
              </span>
              <span className="block text-tertiary">
                {surprise.theirGames} of their {surprise.theirTotal} games here ·{' '}
                {describeSource(surprise)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
