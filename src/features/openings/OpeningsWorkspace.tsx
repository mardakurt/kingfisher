'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { positionKey } from '@/chess/fen';
import { moveIntent } from '@/chess/moves';
import type { Shape } from '@/chess/annotations';
import type { MoveIntent } from '@/chess/types';
import { Opening, Plus, Search, Settings } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { BoardControls } from '@/features/analysis/BoardControls';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { Chessboard } from '@/features/board/Chessboard';
import { useExplorer } from '@/features/explorer/useExplorer';
import {
  useGameSummaries,
  useModelGamesForPosition,
  useProfile,
  useRepertoires,
  useRepertoiresAtPosition,
} from '@/features/persistence/queries';
import { moveScore } from '@/database/types';
import type { RepertoireRole } from '@/persistence/domain';
import { formatPgnDate, gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { NavButton } from '@/features/shell/NavButton';

const ROLE_LABEL: Record<RepertoireRole, string> = {
  main: 'Main',
  alternative: 'Alternative',
  candidate: 'Candidate',
  avoid: 'Avoid',
};

export function OpeningsWorkspace() {
  const router = useRouter();
  const { node, position, destinations, checkSquare, currentId } = useAnalysisPosition();
  const orientation = useAnalysis((state) => state.orientation);
  const play = useAnalysis((state) => state.play);
  const newGame = useAnalysis((state) => state.newGame);
  const toggleShape = useAnalysis((state) => state.toggleShape);
  const clearShapes = useAnalysis((state) => state.clearShapes);
  const openDocument = useAnalysis((state) => state.openDocument);
  const preferences = usePreferences();
  const notify = useUi((state) => state.notify);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const toggleCommandPalette = useUi((state) => state.toggleCommandPalette);

  const key = positionKey(node.fen);
  const explorer = useExplorer('local-collection', node.fen, {});
  const profile = useProfile();
  const personal = useExplorer('local-collection', node.fen, {
    ...(profile.data?.aliases[0] ? { player: profile.data.aliases[0] } : {}),
  });
  const repertoire = useRepertoiresAtPosition(key);
  const allRepertoires = useRepertoires();
  const repertoireById = useMemo(
    () => new Map((allRepertoires.data ?? []).map((entry) => [entry.id, entry])),
    [allRepertoires.data],
  );
  const modelGames = useModelGamesForPosition(key);
  // A link is a reference, so the names have to be fetched to be shown. Summaries
  // only: naming a game must never pull its moves into this panel.
  const linkedGameIds = useMemo(
    () => (modelGames.data ?? []).map((link) => link.gameId),
    [modelGames.data],
  );
  const linkedGames = useGameSummaries(linkedGameIds);
  const linkedById = useMemo(
    () => new Map((linkedGames.data ?? []).map((game) => [game.id, game])),
    [linkedGames.data],
  );

  const onMove = useCallback(
    (intent: MoveIntent) => {
      const result = play(intent);
      if (!result.ok) notify({ tone: 'error', message: result.error.message });
    },
    [notify, play],
  );
  const onShapeToggle = useCallback(
    (shape: Shape) => toggleShape(currentId, shape),
    [currentId, toggleShape],
  );

  const openGame = async (gameId: string) => {
    try {
      const game = await (await getRepositories()).games.get(gameId);
      if (!game) throw new Error('That game is no longer in the database.');
      openDocument({
        tree: game.tree,
        document: { kind: 'database-game', title: gameTitle(game), gameId: game.id },
      });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The game could not be opened.',
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <Opening className="h-4 w-4 text-accent" />
        <h1 className="text-xs font-semibold text-primary">Openings</h1>
        <Button icon={<Plus />} onClick={() => newGame()}>
          New line
        </Button>
        <span className="hidden min-w-0 flex-1 truncate text-2xs text-tertiary md:block">
          {explorer.data?.opening?.name ?? 'Local opening workspace'}
          {explorer.data?.opening?.variation ? ` · ${explorer.data.opening.variation}` : ''}
        </span>
        <button
          type="button"
          onClick={toggleCommandPalette}
          className="ml-auto flex h-7 items-center gap-2 rounded-[4px] border border-line bg-surface-2 px-2 text-2xs text-tertiary hover:text-secondary"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Search commands</span>
        </button>
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </IconButton>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto wide:grid-cols-[minmax(430px,1fr)_430px] wide:overflow-hidden">
        <section className="flex min-h-[520px] min-w-0 flex-col px-3 py-3 sm:px-5 sm:py-4 wide:min-h-0">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="aspect-square w-full max-w-[min(720px,calc(100dvh-150px))]">
              <Chessboard
                fen={node.fen}
                orientation={orientation}
                lastMove={node.move}
                checkSquare={checkSquare}
                destinations={destinations}
                onMove={onMove}
                isPromotion={(from, to) => position.requiresPromotion(from, to)}
                promotionColor={position.turn}
                shapes={node.shapes}
                onShapeToggle={onShapeToggle}
                onShapesClear={() => clearShapes(currentId)}
                theme={preferences.boardTheme}
                pieceSet={preferences.pieceSet}
                coordinates={preferences.coordinateStyle}
                animationMs={resolveAnimationMs(preferences.animationSpeed)}
              />
            </div>
          </div>
          <div className="mx-auto mt-3 flex w-full max-w-[720px] items-center border-t border-line-subtle pt-2">
            <BoardControls />
            <span className="ml-auto text-2xs text-tertiary">
              {position.turn === 'w' ? 'White' : 'Black'} to move
            </span>
          </div>
        </section>

        <aside className="min-h-[480px] border-t border-line-subtle bg-surface-1 wide:min-h-0 wide:border-t-0 wide:border-l">
          <Panel className="h-full">
            <PanelHeader>Evidence at this position</PanelHeader>
            <PanelBody>
              <section className="border-b border-line-subtle">
                <EvidenceHeading
                  title="Database evidence"
                  value={`${explorer.data?.totalGames ?? 0} local games`}
                />
                {explorer.isPending ? (
                  <p className="px-3 py-4 text-2xs text-tertiary">Reading local games…</p>
                ) : (explorer.data?.moves.length ?? 0) === 0 ? (
                  <p className="px-3 py-4 text-2xs text-tertiary">
                    No local games reach this position.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[280px] border-collapse text-[10.5px]">
                      <thead>
                        <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                          <th className="px-3 py-1.5 font-medium">Move</th>
                          <th className="px-2 py-1.5 text-right font-medium">Games</th>
                          <th className="px-2 py-1.5 text-right font-medium">Freq</th>
                          <th className="px-3 py-1.5 text-right font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {explorer.data?.moves.map((move) => (
                          <tr key={move.uci}>
                            <td className="px-3 py-1.5">
                              <button
                                className="font-medium text-primary hover:text-accent"
                                type="button"
                                onClick={() => {
                                  const next = position.playUci(move.uci);
                                  if (next.ok) onMove(moveIntent(next.value));
                                }}
                              >
                                {move.san}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-right text-secondary tabular">
                              {move.games}
                            </td>
                            <td className="px-2 py-1.5 text-right text-secondary tabular">
                              {explorer.data!.totalGames
                                ? Math.round((move.games / explorer.data!.totalGames) * 100)
                                : 0}
                              %
                            </td>
                            <td className="px-3 py-1.5 text-right text-secondary tabular">
                              {Math.round(moveScore(move, position.turn) * 100)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="border-b border-line-subtle">
                <EvidenceHeading
                  title="Repertoire decision"
                  value={`${repertoire.data?.length ?? 0} repertoire${repertoire.data?.length === 1 ? '' : 's'}`}
                />
                {(repertoire.data?.length ?? 0) === 0 ? (
                  <p className="px-3 pb-3 text-2xs text-tertiary">
                    No repertoire decision is stored here.
                  </p>
                ) : (
                  repertoire.data?.map((entry) => {
                    const owner = repertoireById.get(entry.repertoireId);
                    /*
                      Your own decisions and the replies you expect from an
                      opponent are different knowledge, and printing both as
                      "· main" was exactly the collapse this workspace exists to
                      avoid. They are separated, and the repertoire is named.
                    */
                    const decisions = entry.moves.filter((move) => !move.expected);
                    const replies = entry.moves.filter((move) => move.expected);
                    return (
                      <div key={entry.id} className="px-3 pb-3 text-[11.5px] text-secondary">
                        <p className="text-2xs text-tertiary">
                          {owner
                            ? `${owner.title} · ${owner.color === 'w' ? 'White' : 'Black'}`
                            : 'Repertoire'}
                        </p>
                        {decisions.length ? (
                          <p className="mt-0.5">
                            Plays{' '}
                            {decisions
                              .map((move) => `${move.san} (${ROLE_LABEL[move.role]})`)
                              .join(', ')}
                          </p>
                        ) : null}
                        {replies.length ? (
                          <p className="mt-0.5 text-tertiary">
                            Expects {replies.map((move) => move.san).join(', ')}
                          </p>
                        ) : null}
                        {entry.note ? (
                          <p className="mt-1 text-2xs text-tertiary">{entry.note}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </section>

              <section className="border-b border-line-subtle">
                <EvidenceHeading
                  title="Personal results"
                  value={
                    profile.data?.aliases.length
                      ? `${personal.data?.totalGames ?? 0} games`
                      : 'aliases not configured'
                  }
                />
                <p className="px-3 pb-3 text-2xs text-tertiary">
                  {profile.data?.aliases.length
                    ? `Using explicit alias ${profile.data.aliases[0]}. White ${personal.data?.white ?? 0}, draws ${personal.data?.draws ?? 0}, Black ${personal.data?.black ?? 0}.`
                    : 'Add your exact player names in Settings → Profile.'}
                </p>
              </section>

              <section className="border-b border-line-subtle">
                <EvidenceHeading
                  title="Saved engine evidence"
                  value={node.evaluation ? `depth ${node.evaluation.depth}` : 'none'}
                />
                <p className="px-3 pb-3 text-2xs text-tertiary">
                  {node.evaluation
                    ? `Stored from ${node.evaluation.engine}. This is a saved snapshot, separate from database results.`
                    : 'Save an engine evaluation in Analysis to attach one to this node.'}
                </p>
              </section>

              <section>
                <EvidenceHeading
                  title="Model games"
                  value={`${modelGames.data?.length ?? 0} linked`}
                />
                {(modelGames.data?.length ?? 0) === 0 ? (
                  <p className="px-3 pb-3 text-2xs text-tertiary">
                    No model game is linked to this canonical position.
                  </p>
                ) : (
                  modelGames.data?.map((link) => {
                    const game = linkedById.get(link.gameId);
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => void openGame(link.gameId)}
                        className="block w-full border-t border-line-subtle px-3 py-2 text-left hover:bg-surface-2"
                      >
                        <span className="block truncate text-[11.5px] text-primary">
                          {game ? gameTitle(game) : 'Linked game'}
                        </span>
                        <span className="mt-0.5 block text-2xs text-tertiary">
                          {[
                            link.kinds.join(' · '),
                            game?.eco,
                            game?.opening,
                            formatPgnDate(game?.date),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {link.note ? (
                          <span className="mt-0.5 block text-2xs text-secondary">{link.note}</span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </section>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function EvidenceHeading({ title, value }: { readonly title: string; readonly value: string }) {
  return (
    <div className="flex h-8 items-center px-3">
      <h2 className="text-[10px] uppercase tracking-wide text-tertiary">{title}</h2>
      <span className="ml-auto text-[10px] text-tertiary tabular">{value}</span>
    </div>
  );
}
