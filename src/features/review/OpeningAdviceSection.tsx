'use client';

/**
 * "Openings to reconsider", in Review → Improvement.
 *
 * Reads the player's own games (the names in their profile), finds the
 * positions where the move they usually play keeps losing, and shows what a
 * local reference source played there that scored better
 * (`src/preparation/opening-advice.ts`). Every number carries its count and
 * its population; the section says in words that these are moves that
 * scored better in a source, not moves to play.
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { createTree } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { databaseProviderById } from '@/database/registry';
import { BUNDLED_PACK_ID } from '@/reference/catalog';
import { initialiseReferences } from '@/reference/manager';
import { plural } from '@/lib/plural';
import { getRepositories } from '@/persistence/repositories';
import type { GameRecord } from '@/persistence/types';
import { buildOpeningTree } from '@/preparation';
import { openingAdvice, type AdviceMove, type OpeningAdvice } from '@/preparation/opening-advice';
import { UNTITLED_DOCUMENT, useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';

const GAME_LIMIT = 2_000;

const pct = (score: number) => `${Math.round(score * 100)}%`;
const numbered = (line: readonly string[]) =>
  line.length === 0
    ? 'the start'
    : line.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}.${san}` : san)).join(' ');
const moveLabel = (row: OpeningAdvice, move: AdviceMove) => {
  const ply = row.line.length + 1;
  return ply % 2 === 1 ? `${(ply + 1) / 2}.${move.san}` : `${ply / 2}...${move.san}`;
};

async function loadAdvice(aliases: readonly string[], sourceId: string) {
  const repositories = await getRepositories();
  const ids = new Set<string>();
  for (const alias of aliases) {
    const found = await repositories.games.search({ player: alias, limit: GAME_LIMIT });
    for (const game of found.games) ids.add(game.id);
  }
  const games: readonly GameRecord[] = ids.size ? await repositories.games.getMany([...ids]) : [];
  /*
    A source on this machine: the advice asks it about up to fifteen
    positions, which a remote service should not be asked for on every
    visit to a page.
  */
  // Reference packs register as sources once read from storage; this page may
  // be the first to need one, before any explorer has asked.
  await initialiseReferences();
  const chosen = databaseProviderById(sourceId);
  const provider =
    chosen && chosen.capabilities.offline ? chosen : databaseProviderById(BUNDLED_PACK_ID);
  if (!provider || games.length === 0) return { games: games.length, advice: [] };
  const advice = await openingAdvice({
    trees: {
      w: buildOpeningTree(games, aliases, { playerColor: 'w' }),
      b: buildOpeningTree(games, aliases, { playerColor: 'b' }),
    },
    explore: (fen) => provider.explore({ fen, limit: 20 }),
  });
  return { games: games.length, advice };
}

export function OpeningAdviceSection({ aliases }: { readonly aliases: readonly string[] }) {
  const router = useRouter();
  const openDocument = useAnalysis((state) => state.openDocument);
  const sourceId = usePreferences((state) => state.explorerSourceId);
  const query = useQuery({
    queryKey: ['review', 'opening-advice', aliases, sourceId],
    queryFn: () => loadAdvice(aliases, sourceId),
    enabled: aliases.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const open = (fen: Fen) => {
    openDocument({ tree: createTree(fen), document: UNTITLED_DOCUMENT });
    router.push('/analysis');
  };

  return (
    <section
      aria-label="Openings to reconsider"
      className="border-t border-line-subtle pt-3"
      data-opening-advice
    >
      <h3 className="text-[10px] font-semibold text-tertiary">Openings to reconsider</h3>
      <p className="mt-1 text-[10.5px] leading-snug text-tertiary">
        Where the move you usually play has lost most of at least five of your games, and what a
        reference source played there that scored better. Better in that source&apos;s games — not a
        verdict on the move.
      </p>
      {aliases.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-secondary">
          Add your playing names in Settings → Profile so Kingfisher knows which games are yours.
        </p>
      ) : query.isPending ? (
        <p className="mt-1.5 text-[11px] text-tertiary" role="status">
          Reading your games…
        </p>
      ) : query.isError ? (
        <p className="mt-1.5 text-[11px] text-negative" role="alert">
          Your games could not be read for this.
        </p>
      ) : query.data.advice.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-secondary" data-opening-advice-empty>
          Nothing to reconsider in {plural(query.data.games, 'game')}: no move you play often has
          lost most of five games where a source scored better.
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-line-subtle" data-opening-advice-list>
          {query.data.advice.map((row) => (
            <li
              key={`${row.color}-${row.fen}`}
              className="py-2 text-[11px] leading-snug text-secondary"
            >
              <p>
                As {row.color === 'w' ? 'White' : 'Black'}, after {numbered(row.line)}: you played{' '}
                <strong className="text-primary">{moveLabel(row, row.yours)}</strong> in{' '}
                {plural(row.yours.games, 'game')} and scored {pct(row.yours.score)}.
              </p>
              <p className="mt-1" data-opening-advice-source>
                In {row.source.name}:{' '}
                {row.alternatives
                  .map(
                    (alt) =>
                      `${moveLabel(row, alt)} scored ${pct(alt.score)} (${alt.games.toLocaleString()} games)`,
                  )
                  .join(', ')}
                {row.yoursInSource
                  ? `; ${moveLabel(row, row.yours)} scored ${pct(row.yoursInSource.score)} (${row.yoursInSource.games.toLocaleString()} games).`
                  : `; ${moveLabel(row, row.yours)} is not in it.`}
              </p>
              <Button size="sm" variant="subtle" className="mt-1.5" onClick={() => open(row.fen)}>
                Open the position
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
