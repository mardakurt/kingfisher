'use client';

/**
 * Opening a stored game on the board, from anywhere.
 *
 * There is one right way to do this and it is not obvious: load the summary's
 * moves, fold in whatever engine evidence the analysis queue recorded, hand the
 * tree to the analysis store as a `database-game` document, and only then
 * navigate. Getting any step wrong produces a board showing the previous game,
 * or a document the autosave believes is the user's own work.
 *
 * The game list had this inline. When the player profile and cross-database
 * search grew their own "open this game" buttons they each needed the same six
 * steps, and a second copy of a sequence like this is a second thing that can
 * drift — so it lives here, once.
 */

import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import { setEvaluation } from '@/chess/tree/tree';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { GameId } from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';

import { ownColor } from '@/round/identity';

import { viewerSide } from './viewer-side';

export interface OpenStoredGameOptions {
  /**
   * Put the cursor on the position after this ply.
   *
   * How a player profile's "open this opening" arrives at the position the
   * opening was recognised at rather than at move one. Out-of-range plies land
   * on the nearest node rather than failing, because a ply recorded under an
   * older classification is a stale number, not a broken link.
   */
  readonly ply?: number;
}

export class GameNotFoundError extends Error {
  override readonly name = 'GameNotFoundError';
  constructor() {
    super('That game is no longer in the database.');
  }
}

/**
 * Load a stored game into the analysis workspace.
 *
 * Does not navigate: the caller decides where the board should be shown, since
 * the same game opens into Analysis, Review and Preparation.
 */
export async function openStoredGame(
  id: GameId,
  options: OpenStoredGameOptions = {},
): Promise<void> {
  const repositories = await getRepositories();
  const full = await repositories.games.get(id);
  if (!full) throw new GameNotFoundError();

  const evidence = await repositories.analysisQueue.evidenceForGame(id);
  const tree = evidence.reduce(
    (current, entry) =>
      current.nodes[entry.nodeId]
        ? setEvaluation(current, entry.nodeId, {
            score: entry.score,
            depth: entry.depth,
            nodes: entry.nodes,
            timeMs: entry.timeMs,
            engine: entry.engineName,
            bestMove: entry.pv[0],
            recordedAt: entry.analysedAt,
          })
        : current,
    full.tree,
  );

  /*
    Phase 63: if the game was synced from one of the viewer's linked
    accounts and the viewer played it, flip the board to their side. The
    document kind stays `database-game` (the game *is* stored), but the
    workspace now opens with the right orientation, so a Lichess blitz
    does not have to be flipped by hand after every click.

    Phase 76: and the same for a club player, who has no linked account and
    whose name is in their profile. The profile's aliases are matched the way
    the games index matches them — case and whitespace only, never a guess
    about which "M. Carlsen" is which — so the board flips for an
    over-the-board game whose scoresheet spells the name as the profile does,
    and does not flip when it does not. An account match is preferred when
    both could answer: it is a handle, which is exact by construction.
  */
  let orientation: 'w' | 'b' | undefined;
  try {
    const accounts = await repositories.linkedAccounts.list();
    const side = viewerSide(full.tree, accounts);
    if (side) orientation = side;
    else {
      const profile = await repositories.profile.get();
      orientation = ownColor(full.tree.headers, profile.aliases) ?? undefined;
    }
  } catch {
    orientation = undefined;
  }

  const store = useAnalysis.getState();
  store.openDocument({
    tree,
    ...(orientation ? { orientation } : {}),
    /*
      A database game opens as source material, not as the user's own document.
      Editing it will not write back over the imported record: autosave treats
      anything that is not a study chapter as a draft, and "Save to study" is
      how an analysis of a game becomes the user's.
    */
    document: {
      kind: 'database-game',
      title: gameTitle(full),
      gameId: full.id,
      ...(orientation ? { viewerSide: orientation } : {}),
    },
  });

  if (options.ply && options.ply > 0) {
    const target = nodeAtPly(tree, options.ply);
    if (target) useAnalysis.getState().goTo(target);
  }
}

/** The main-line node at a ply, or the deepest one before it. */
function nodeAtPly(tree: GameTree, ply: number): string | null {
  let best: string | null = null;
  for (const id of mainlinePath(tree)) {
    const node = tree.nodes[id];
    if (!node || node.ply < 1) continue;
    if (node.ply > ply) break;
    best = id;
  }
  return best;
}
