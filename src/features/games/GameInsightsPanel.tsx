'use client';

import { useState } from 'react';

import { positionKey } from '@/chess/fen';
import { lastNodeOfLine, mainlinePath, mustGetNode } from '@/chess/tree/tree';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useProfile, useRepertoire, useRepertoires } from '@/features/persistence/queries';
import { findDeviation, indexPositions } from '@/repertoire';
import { playerKey } from '@/persistence/schema/migrations';
import { useAnalysis } from '@/stores/analysis-store';

export function GameInsightsPanel() {
  const tree = useAnalysis((state) => state.tree);
  const document = useAnalysis((state) => state.document);
  const goTo = useAnalysis((state) => state.goTo);
  const profile = useProfile();
  const repertoires = useRepertoires().data ?? [];
  const white = tree.headers.White ?? '';
  const black = tree.headers.Black ?? '';
  const aliasKeys = new Set((profile.data?.aliases ?? []).map(playerKey));
  const ownColor = aliasKeys.has(playerKey(white))
    ? 'w'
    : aliasKeys.has(playerKey(black))
      ? 'b'
      : null;
  const matching = ownColor ? repertoires.filter((entry) => entry.color === ownColor) : [];
  const [selectedId, setSelectedId] = useState('');
  const effectiveId = selectedId || matching[0]?.id || null;
  const repertoire = useRepertoire(effectiveId);

  const insights = (() => {
    const path = mainlinePath(tree);
    const seen = new Map<string, number>();
    for (const id of path) {
      const key = positionKey(mustGetNode(tree, id).fen);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const repeated = [...seen.values()].filter((count) => count > 1).length;
    const critical = Object.values(tree.nodes).filter((node) => node.meta.critical).length;
    const lastId = lastNodeOfLine(tree, tree.rootId);
    const deviation =
      ownColor && repertoire.data
        ? findDeviation(tree, lastId, ownColor, indexPositions(repertoire.data.positions))
        : null;
    return { repeated, critical, lastId, deviation };
  })();

  if (document.kind !== 'database-game') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeader>Game integration</PanelHeader>
        <PanelBody>
          <EmptyState
            title="Open a database game."
            description="Personal-game and repertoire-deviation evidence is shown for imported source games."
          />
        </PanelBody>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>Personal game</PanelHeader>
      <PanelBody>
        <section className="border-b border-line-subtle px-3 py-3">
          <p className="text-xs font-medium text-primary">
            {white || 'White'} – {black || 'Black'}
          </p>
          <p className="mt-1 text-2xs text-tertiary">
            {tree.headers.Opening || tree.headers.ECO || 'Opening not tagged'} ·{' '}
            {tree.headers.Result || '*'}
          </p>
        </section>

        {!profile.data?.aliases.length ? (
          <EmptyState
            title="Personal identity is not configured."
            description="Add exact player-name aliases in Settings → Profile. Kingfisher never guesses which player is you."
          />
        ) : !ownColor ? (
          <EmptyState
            title="This is not identified as one of your games."
            description="Neither player matches an explicit personal alias."
          />
        ) : (
          <>
            <section className="border-b border-line-subtle px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-tertiary">
                  Compare repertoire
                </span>
                <select
                  value={effectiveId ?? ''}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="ml-auto h-6 max-w-44 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-secondary"
                >
                  {matching.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </div>
              {!effectiveId ? (
                <p className="mt-2 text-2xs text-tertiary">
                  No {ownColor === 'w' ? 'White' : 'Black'} repertoire exists.
                </p>
              ) : insights.deviation ? (
                <div className="mt-2 text-[11.5px] leading-relaxed text-secondary">
                  <p>In repertoire through {insights.deviation.inBookPlies} plies.</p>
                  {insights.deviation.own ? (
                    <button
                      type="button"
                      className="mt-1 text-left text-accent hover:underline"
                      onClick={() => goTo(insights.deviation!.own!.nodeId)}
                    >
                      You deviated with {insights.deviation.own.playedSan} on ply{' '}
                      {insights.deviation.own.ply}.
                    </button>
                  ) : null}
                  {insights.deviation.opponent ? (
                    <button
                      type="button"
                      className="mt-1 text-left text-accent hover:underline"
                      onClick={() => goTo(insights.deviation!.opponent!.nodeId)}
                    >
                      Your opponent deviated with {insights.deviation.opponent.playedSan} on ply{' '}
                      {insights.deviation.opponent.ply}.
                    </button>
                  ) : null}
                  {!insights.deviation.own && !insights.deviation.opponent ? (
                    <p className="mt-1 text-tertiary">
                      The recorded line did not contradict a prepared move.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
            <section className="px-3 py-3">
              <h3 className="text-[10px] uppercase tracking-wide text-tertiary">Factual markers</h3>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-2xs">
                <dt className="text-tertiary">Repeated positions</dt>
                <dd className="text-right text-secondary tabular">{insights.repeated}</dd>
                <dt className="text-tertiary">Critical positions</dt>
                <dd className="text-right text-secondary tabular">{insights.critical}</dd>
                <dt className="text-tertiary">Saved evaluations</dt>
                <dd className="text-right text-secondary tabular">
                  {Object.values(tree.nodes).filter((node) => node.evaluation).length}
                </dd>
              </dl>
            </section>
          </>
        )}
      </PanelBody>
    </div>
  );
}
