'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import { positionKey } from '@/chess/fen';
import { Plus } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { databaseProviderById } from '@/database/registry';
import { useDatabaseProviders } from '@/database/use-database-providers';
import type { ProviderHealth } from '@/database/types';
import { EnginePanelHost } from '@/features/engine/EnginePanelHost';
import { ExplorerPanel } from '@/features/explorer/ExplorerPanel';
import { NotesPanel } from '@/features/notes/NotesPanel';
import { useProfile, useRepertoiresAtPosition } from '@/features/persistence/queries';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { TranspositionRoutes } from '@/features/repertoire/TranspositionRoutes';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import type { WorkspaceToolId } from './modules';

const lazyPanel = (loader: () => Promise<{ default: React.ComponentType }>) =>
  dynamic(loader, { ssr: false, loading: () => <ToolLoading /> });

const CompanionPanel = lazyPanel(() =>
  import('@/features/assistant/CompanionPanel').then((module) => ({
    default: module.CompanionPanel,
  })),
);
const TranspositionsPanel = lazyPanel(() =>
  import('@/features/explorer/TranspositionsPanel').then((module) => ({
    default: module.TranspositionsPanel,
  })),
);
const GameInsightsPanel = lazyPanel(() =>
  import('@/features/games/GameInsightsPanel').then((module) => ({
    default: module.GameInsightsPanel,
  })),
);
const FeaturesPanel = lazyPanel(() =>
  import('@/features/analysis/FeaturesPanel').then((module) => ({ default: module.FeaturesPanel })),
);
const TheoryRadarHost = lazyPanel(() =>
  import('@/features/theory/TheoryRadarHost').then((module) => ({
    default: module.TheoryRadarHost,
  })),
);
const CandidateComparison = lazyPanel(() =>
  import('@/features/engine/CandidateComparison').then((module) => ({
    default: module.CandidateComparison,
  })),
);
const GuessTheMovePanel = lazyPanel(() =>
  import('@/features/model-games/GuessTheMovePanel').then((module) => ({
    default: module.GuessTheMovePanel,
  })),
);
const CalculationHost = lazyPanel(() =>
  import('@/features/calculation/CalculationHost').then((module) => ({
    default: module.CalculationHost,
  })),
);
const PositionReportPanel = lazyPanel(() =>
  import('@/features/position-report/PositionReportPanel').then((module) => ({
    default: module.PositionReportPanel,
  })),
);
const TablebasePanel = lazyPanel(() =>
  import('@/features/analysis/TablebasePanel').then((module) => ({
    default: module.TablebasePanel,
  })),
);
const ConversionPanel = lazyPanel(() =>
  import('@/features/endgame/ConversionHost').then((module) => ({
    default: module.ConversionHost,
  })),
);
const PositionHealthPanel = lazyPanel(() =>
  import('@/features/repertoire/PositionHealthPanel').then((module) => ({
    default: module.PositionHealthPanel,
  })),
);

function ToolLoading() {
  return (
    <div
      className="flex h-full min-h-[240px] items-center justify-center text-xs text-tertiary"
      aria-live="polite"
    >
      Loading tool…
    </div>
  );
}

export function ToolContent({
  tool,
  contextPanel,
}: {
  readonly tool: WorkspaceToolId;
  readonly contextPanel?: ReactNode;
}) {
  if (tool === 'engine') return <EnginePanelHost />;
  if (tool === 'explorer') return <ExplorerPanel />;
  if (tool === 'database') return <DatabasePositionPanel />;
  if (tool === 'repertoire') return <RepertoirePositionPanel />;
  if (tool === 'repertoire-health') return <PositionHealthPanel />;
  if (tool === 'model-games') return <GameInsightsPanel />;
  if (tool === 'personal-results') return <PersonalResultsPanel />;
  if (tool === 'features') return <FeaturesPanel />;
  if (tool === 'transpositions') return <TranspositionsPanel />;
  if (tool === 'theory-radar') return <TheoryRadarHost />;
  if (tool === 'calculation') return <CalculationHost />;
  if (tool === 'guess-the-move') return <GuessTheMovePanel />;
  if (tool === 'candidates') return <CandidateComparison />;
  if (tool === 'tablebase') return <TablebasePanel />;
  if (tool === 'conversion') return <ConversionPanel />;
  if (tool === 'report') return <PositionReportPanel />;
  if (tool === 'companion') return <CompanionPanel />;
  if (tool === 'document') {
    return (
      contextPanel ?? (
        <EmptyState
          title="No route context available."
          description="Choose another tool for evidence at this position."
        />
      )
    );
  }
  return <NotesPanel />;
}

function DatabasePositionPanel() {
  const prefs = usePreferences();
  const providers = useDatabaseProviders();
  const provider = databaseProviderById(prefs.explorerSourceId) ?? providers[0];
  const health = useQuery<ProviderHealth>({
    queryKey: ['provider-health', provider?.id ?? 'none'],
    enabled: Boolean(provider),
    queryFn: async ({ signal }) =>
      provider?.health
        ? provider.health(signal)
        : { state: 'unsupported', checkedAt: 0, message: 'Connection testing is not available.' },
    staleTime: 30_000,
    retry: false,
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>Database at this position</PanelHeader>
      <PanelBody className="p-3">
        <label className="text-xs text-tertiary">
          Active source
          <select
            value={provider?.id ?? ''}
            onChange={(event) => prefs.set('explorerSourceId', event.target.value)}
            className="mt-1 h-9 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary"
          >
            {providers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 border-y border-line-subtle py-3">
          <p className="text-sm text-primary">{health.data?.message ?? 'Checking provider…'}</p>
          <p className="mt-1 text-xs text-tertiary">{provider?.description}</p>
          {health.data?.latencyMs != null ? (
            <p className="mt-2 text-xs text-tertiary tabular">
              Last query {health.data.latencyMs} ms
            </p>
          ) : null}
        </div>
        <Link
          href="/databases"
          className="mt-4 inline-flex h-9 items-center rounded-[4px] border border-line px-3 text-sm text-secondary hover:bg-surface-2 hover:text-primary"
        >
          Manage data sources
        </Link>
      </PanelBody>
    </div>
  );
}

function RepertoirePositionPanel() {
  const { node } = useAnalysisPosition();
  const key = positionKey(node.fen);
  const entries = useRepertoiresAtPosition(key);
  const setOpen = useUi((state) => state.setAddToRepertoireOpen);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>Repertoire decisions</PanelHeader>
      <PanelBody>
        {entries.isPending ? (
          <p className="p-3 text-xs text-tertiary">Reading repertoires…</p>
        ) : (entries.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No repertoire decision here."
            description="Record your move and the replies you expect from this exact position."
            action={
              <Button icon={<Plus />} onClick={() => setOpen(true)}>
                Add decision
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-line-subtle">
            {entries.data?.map((entry) => (
              <div key={entry.id}>
                <div className="p-3">
                  <p className="text-sm text-primary">
                    {entry.moves.map((move) => move.san).join(', ')}
                  </p>
                  {entry.note ? <p className="mt-1 text-xs text-tertiary">{entry.note}</p> : null}
                </div>
                {/*
                  The evidence that this one record really is shared. A tree
                  shows divergence and hides convergence, so a player editing a
                  tabiya reached three ways has no way to see that the other two
                  inherited the change — except by being shown the routes.
                */}
                <TranspositionRoutes repertoireId={entry.repertoireId} positionKey={key} />
              </div>
            ))}
            <div className="p-3">
              <Button icon={<Plus />} onClick={() => setOpen(true)}>
                Update decision
              </Button>
            </div>
          </div>
        )}
      </PanelBody>
    </div>
  );
}

function PersonalResultsPanel() {
  const profile = useProfile();
  const aliases = useMemo(() => profile.data?.aliases ?? [], [profile.data?.aliases]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>Personal results</PanelHeader>
      <PanelBody>
        {aliases.length === 0 ? (
          <EmptyState
            title="No player aliases configured."
            description="Add the exact names used in your PGNs under Settings → Profile."
          />
        ) : (
          <div className="p-3">
            <p className="text-sm text-primary">Matching your local games as</p>
            <ul className="mt-2 space-y-1 text-xs text-secondary">
              {aliases.map((alias) => (
                <li key={alias}>{alias}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-tertiary">
              Choose My games in Explorer to see move-by-move results for these identities at the
              current position.
            </p>
          </div>
        )}
      </PanelBody>
    </div>
  );
}
