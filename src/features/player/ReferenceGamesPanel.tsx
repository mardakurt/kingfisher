'use client';

/**
 * A player's games in the installed reference sources.
 *
 * Distinct from "Recent games", which reads the user's own collection. Keeping
 * them apart is the same rule the explorer follows: two populations shown side
 * by side, each named, never added together. A game in the starter reference
 * and a game you imported are different evidence about the same person, and
 * which one a claim rests on matters.
 */

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { openReferenceGame } from '@/features/games/open-reference-game';
import { useReferencePlayerGames, type ReferenceGame } from '@/reference/player-games';
import { useUi } from '@/stores/ui-store';

export function ReferenceGamesPanel({
  playerKey,
  name,
}: {
  readonly playerKey: string;
  readonly name: string;
}) {
  const games = useReferencePlayerGames(playerKey);
  const notify = useUi((state) => state.notify);
  const router = useRouter();

  const open = async (game: ReferenceGame) => {
    try {
      await openReferenceGame(
        game.sourceId,
        game.sourceName,
        game.id,
        `${game.white} – ${game.black}`,
      );
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  if (games.isPending) {
    return <p className="py-6 text-sm text-tertiary">Reading the installed reference sources…</p>;
  }

  const list = games.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title="No games in your reference sources"
        description={`None of the installed reference packs holds a game under “${name}”. Kingfisher’s bundled reference is built from an open archive that begins in 2020, so players who stopped competing before then are in the catalog without games behind them.`}
      />
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-primary">
        {list.length.toLocaleString()} {list.length === 1 ? 'game' : 'games'} in your reference
        sources
      </h2>
      <p className="mt-0.5 text-xs text-tertiary">
        From {[...new Set(list.map((game) => game.sourceName))].join(', ')}. Opening one puts it on
        the board as read-only source material.
      </p>
      <ul className="mt-3 divide-y divide-line-subtle" data-reference-games>
        {list.map((game) => (
          <li key={game.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm text-primary">
                {game.white}
                {game.whiteElo > 0 ? ` (${game.whiteElo})` : ''} – {game.black}
                {game.blackElo > 0 ? ` (${game.blackElo})` : ''}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-tertiary">
                {[
                  game.result,
                  game.date || (game.year > 0 ? String(game.year) : ''),
                  game.event,
                  game.eco && game.eco !== '?' ? game.eco : '',
                  game.opening && game.opening !== '?' ? game.opening : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <Button variant="subtle" onClick={() => void open(game)}>
              Open
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
