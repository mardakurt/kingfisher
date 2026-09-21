'use client';

/**
 * After the round — the one page a tournament player runs on the evening of
 * a game, from the game on the board:
 *
 *   1. who they were, from the profile's aliases (or their say-so for now);
 *   2. where the game left their repertoire, and who left it;
 *   3. what the clock says — the longest thinks, and where time ran short;
 *   4. what the engine has to say — the background queue's evidence, turned
 *      into review items by the same suggester Review uses;
 *   5. one learning point, in their own words, filed in the round journal.
 *
 * Every number on the page is a fact from the game, the repertoire or a
 * stored engine line; the page never says a move was good or bad. What it
 * adds over the tools it is built from is the order, and the box at the end.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { mainlinePath } from '@/chess/tree/tree';
import type { NodeId } from '@/chess/tree/types';
import type { Color } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useAnalysisQueue } from '@/features/analysis-queue/queue-store';
import {
  invalidateGames,
  invalidateReview,
  useProfile,
  useRepertoire,
  useRepertoires,
} from '@/features/persistence/queries';
import { useReviewItems } from '@/features/review/queries';
import { suggestForGame } from '@/features/review/suggest-for-game';
import { indexGame, normalizeGame } from '@/persistence/prepare-game';
import { getRepositories } from '@/persistence/repositories';
import { findDeviation, indexPositions } from '@/repertoire';
import { clockSummary, formatThink } from '@/round/clock';
import { gameIdentity, ownColor } from '@/round/identity';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { invalidateJournal, useJournalEntry } from './queries';

const colorName = (color: Color) => (color === 'w' ? 'White' : 'Black');

export function AfterRoundPanel() {
  const tree = useAnalysis((state) => state.tree);
  const document = useAnalysis((state) => state.document);
  const goTo = useAnalysis((state) => state.goTo);
  const openDocument = useAnalysis((state) => state.openDocument);
  const notify = useUi((state) => state.notify);
  const openAnalysisQueue = useUi((state) => state.openAnalysisQueue);
  const router = useRouter();
  const client = useQueryClient();

  const profile = useProfile();
  const aliases = profile.data?.aliases ?? [];
  const detected = ownColor(tree.headers, aliases);
  const [chosen, setChosen] = useState<Color | null>(null);
  const color = detected ?? chosen;

  const gameId = document.kind === 'database-game' ? document.gameId : null;
  const summary = useQuery({
    queryKey: ['games', 'summary', gameId ?? 'none'],
    queryFn: async () => (gameId ? (await getRepositories()).games.summary(gameId) : null),
    staleTime: 0,
  });
  const fingerprint = summary.data?.fingerprint ?? null;

  const repertoires = useRepertoires().data ?? [];
  const matching = color ? repertoires.filter((entry) => entry.color === color) : [];
  const repertoire = useRepertoire(matching[0]?.id ?? null);

  const path = useMemo(() => mainlinePath(tree), [tree]);
  const nodeAtPly = (ply: number): NodeId | undefined => path[ply];
  const hasMoves = path.length > 1;

  const deviation = useMemo(() => {
    if (!color || !repertoire.data) return null;
    const last = path[path.length - 1];
    if (!last) return null;
    return findDeviation(tree, last, color, indexPositions(repertoire.data.positions));
  }, [color, repertoire.data, tree, path]);

  const clock = useMemo(() => clockSummary(tree), [tree]);

  const jobs = useAnalysisQueue((state) => state.jobs);
  const job = gameId ? jobs.filter((entry) => entry.gameId === gameId).at(-1) : undefined;
  const evidence = useQuery({
    queryKey: ['analysis-queue', 'evidence', gameId ?? 'none', job?.status ?? 'none'],
    queryFn: async () =>
      gameId ? (await getRepositories()).analysisQueue.evidenceForGame(gameId) : [],
    staleTime: 0,
  });
  const items = useReviewItems().data ?? [];
  const suggestedForGame = gameId ? items.filter((item) => item.gameId === gameId) : [];

  const entry = useJournalEntry(fingerprint);
  const [note, setNote] = useState('');
  /* The box follows the game: a saved entry seeds it, a new game clears it. */
  const [seeded, setSeeded] = useState<string | null>(null);
  const seedKey = `${fingerprint ?? ''}:${entry.data?.id ?? ''}`;
  const seedText = entry.data?.learningPoint ?? '';
  if (seeded !== seedKey) {
    // Derived state, adjusted during render: React re-runs this component
    // immediately with the new values and commits once.
    setSeeded(seedKey);
    setNote(seedText);
  }
  const [busy, setBusy] = useState(false);

  const identity = gameIdentity(tree.headers, color);

  const saveToGames = async () => {
    setBusy(true);
    try {
      const repositories = await getRepositories();
      const game = normalizeGame(tree);
      const saved = await repositories.games.persist(game, indexGame(game));
      invalidateGames(client);
      openDocument({
        tree: saved.game.tree,
        document: { kind: 'database-game', title: identity.title, gameId: saved.game.id },
      });
      notify({ tone: 'success', message: 'Saved to Games.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The game could not be saved.',
      });
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    if (!gameId) return;
    setBusy(true);
    try {
      const result = await suggestForGame({ tree, gameId, gameLabel: identity.title });
      invalidateReview(client);
      notify({
        tone: result.suggested > 0 ? 'success' : 'info',
        message:
          result.suggested > 0
            ? `${result.suggested} position${result.suggested === 1 ? '' : 's'} sent to the review queue.`
            : 'Nothing in this game meets the threshold.',
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The suggestions could not be built.',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!fingerprint) return;
    setBusy(true);
    try {
      const repositories = await getRepositories();
      await repositories.journal.write(
        {
          fingerprint,
          ...(gameId ? { gameId } : {}),
          ...identity,
          ...(color ? { color } : {}),
          learningPoint: note,
        },
        entry.data?.revision ?? null,
      );
      invalidateJournal(client);
      notify({ tone: 'success', message: 'Filed in the round journal.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The entry could not be saved.',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!hasMoves) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-after-round>
        <PanelHeader>After the round</PanelHeader>
        <PanelBody>
          <EmptyState
            title="Open the game you played."
            description="From Games, a PGN import, or a linked account. This page reads the game on the board."
          />
        </PanelBody>
      </div>
    );
  }

  const own = color ? clock[color] : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-after-round>
      <PanelHeader>After the round</PanelHeader>
      <PanelBody>
        <section className="border-b border-line-subtle px-3 py-3">
          <p className="text-xs font-medium text-primary">{identity.title}</p>
          <p className="mt-1 text-2xs text-tertiary">
            {[identity.event, identity.round ? `Round ${identity.round}` : null, identity.date]
              .filter(Boolean)
              .join(' · ') || 'No event tagged'}
            {identity.result ? ` · ${identity.result}` : ''}
          </p>
          <div className="mt-2 flex items-center gap-2 text-2xs">
            <span className="text-tertiary">You played</span>
            {detected ? (
              <span className="text-secondary" data-after-round-color={detected}>
                {colorName(detected)} (from your profile)
              </span>
            ) : (
              <select
                aria-label="Which side you played"
                value={chosen ?? ''}
                onChange={(event) => setChosen((event.target.value || null) as Color | null)}
                className="h-6 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-secondary"
              >
                <option value="">Choose…</option>
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            )}
          </div>
          {!detected && aliases.length === 0 ? (
            <p className="mt-1 text-2xs text-tertiary">
              Add your name under Settings → Profile and Kingfisher will know next time.
            </p>
          ) : null}
        </section>

        <Section title="Repertoire">
          {!color ? (
            <Muted>Say which side you played first.</Muted>
          ) : matching.length === 0 ? (
            <Muted>
              No {colorName(color)} repertoire yet.{' '}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => router.push('/repertoire')}
              >
                Start one
              </button>
              .
            </Muted>
          ) : !deviation ? (
            <Muted>Reading the repertoire…</Muted>
          ) : (
            <div
              className="text-[11.5px] leading-relaxed text-secondary"
              data-after-round-repertoire
            >
              <p>
                In repertoire for {Math.floor(deviation.inBookPlies / 2)} move
                {Math.floor(deviation.inBookPlies / 2) === 1 ? '' : 's'}
                {matching[0] ? ` (${matching[0].title})` : ''}.
              </p>
              {deviation.own ? (
                <Jump onClick={() => goTo(deviation.own!.nodeId)}>
                  You left it: {moveLabel(deviation.own.ply, deviation.own.playedSan)}; the
                  repertoire has {deviation.own.expected.map((move) => move.san).join(', ')}.
                </Jump>
              ) : null}
              {deviation.opponent ? (
                <Jump onClick={() => goTo(deviation.opponent!.nodeId)}>
                  Your opponent left it:{' '}
                  {moveLabel(deviation.opponent.ply, deviation.opponent.playedSan)}
                  {deviation.opponent.expected.length > 0
                    ? `; you had prepared for ${deviation.opponent.expected.map((move) => move.san).join(', ')}`
                    : ''}
                  .
                </Jump>
              ) : null}
              {!deviation.own && !deviation.opponent ? (
                <p className="mt-1 text-tertiary">
                  {deviation.inBookPlies === 0
                    ? 'The repertoire has nothing for this opening.'
                    : 'Nobody contradicted a prepared move; the repertoire simply ran out.'}
                </p>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="Clock">
          {!clock.available ? (
            <Muted>No clock times in this game.</Muted>
          ) : !own ? (
            <Muted>Say which side you played to read your clock.</Muted>
          ) : (
            <div className="text-[11.5px] leading-relaxed text-secondary" data-after-round-clock>
              <p>
                {own.moves} timed move{own.moves === 1 ? '' : 's'}
                {own.moves > 0 ? `, ${formatThink(own.totalThinkSeconds)} thinking` : ''}
                {own.finalRemaining !== null
                  ? `, ${formatThink(own.finalRemaining)} left at the end`
                  : ''}
                {clock.control
                  ? ` (${formatThink(clock.control.initialSeconds)}${clock.control.incrementSeconds ? ` + ${clock.control.incrementSeconds}s` : ''}${clock.control.periodMoves ? ` for ${clock.control.periodMoves}` : ''})`
                  : ''}
                .
              </p>
              {own.timeTroubleFrom ? (
                <Jump
                  onClick={() =>
                    jumpToPly(own.timeTroubleFrom!.moveNumber * 2 - (color === 'w' ? 1 : 0))
                  }
                >
                  Under a third of the clock from move {own.timeTroubleFrom.moveNumber} (
                  {formatThink(own.timeTroubleFrom.remaining)} left).
                </Jump>
              ) : null}
              {own.longest.length > 0 ? (
                <ul className="mt-1">
                  {own.longest.map((think) => (
                    <li key={think.ply}>
                      <Jump onClick={() => jumpToPly(think.ply)}>
                        {formatThink(think.seconds)} on {moveLabel(think.ply, think.san)}
                      </Jump>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="Engine">
          {!gameId ? (
            <div>
              <Muted>Save the game to Games to analyse it in the background.</Muted>
              <Button size="sm" className="mt-2" onClick={() => void saveToGames()} disabled={busy}>
                Save to Games
              </Button>
            </div>
          ) : (
            <div className="text-[11.5px] leading-relaxed text-secondary" data-after-round-engine>
              {job &&
              (job.status === 'queued' || job.status === 'running' || job.status === 'paused') ? (
                <p>Background analysis {job.status === 'running' ? 'is running' : job.status}…</p>
              ) : (evidence.data?.length ?? 0) === 0 ? (
                <div>
                  <p>No engine evidence for this game yet.</p>
                  <Button
                    size="sm"
                    variant="accent"
                    className="mt-2"
                    onClick={() => openAnalysisQueue([gameId])}
                  >
                    Queue this game
                  </Button>
                </div>
              ) : (
                <div>
                  <p>
                    {evidence.data?.length} position{evidence.data?.length === 1 ? '' : 's'}{' '}
                    evaluated
                    {suggestedForGame.length > 0
                      ? `; ${suggestedForGame.length} in the review queue`
                      : ''}
                    .
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => void suggest()}
                      disabled={busy}
                    >
                      {suggestedForGame.length > 0
                        ? 'Refresh review positions'
                        : 'Send positions to review'}
                    </Button>
                    {suggestedForGame.length > 0 ? (
                      <Button size="sm" onClick={() => router.push('/review')}>
                        Open Review
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="One thing for tomorrow">
          {!fingerprint ? (
            <Muted>Save the game to Games to keep a journal entry for it.</Muted>
          ) : (
            <div>
              <textarea
                rows={3}
                aria-label="Learning point"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
                placeholder="The one thing this game taught. “I spent 20 minutes on move 14 and 30 seconds on move 32.”"
                className="w-full rounded-[3px] border border-line bg-surface-inset px-2 py-1.5 text-[11.5px] text-primary outline-none focus:border-accent/60"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() => void saveNote()}
                  disabled={busy || !note.trim() || note.trim() === entry.data?.learningPoint}
                >
                  {entry.data ? 'Update entry' : 'File in the journal'}
                </Button>
                {entry.data ? (
                  <button
                    type="button"
                    className="text-2xs text-accent hover:underline"
                    onClick={() => router.push('/review')}
                  >
                    In Review → Rounds
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </Section>
      </PanelBody>
    </div>
  );

  function jumpToPly(ply: number) {
    const id = nodeAtPly(ply);
    if (id) goTo(id);
  }
}

const moveLabel = (ply: number, san: string) =>
  `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '…'}${san}`;

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line-subtle px-3 py-3 last:border-b-0">
      <h3 className="text-[10px] uppercase tracking-wide text-tertiary">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Muted({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-2xs text-tertiary">{children}</p>;
}

function Jump({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="mt-1 block text-left text-accent hover:underline"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
