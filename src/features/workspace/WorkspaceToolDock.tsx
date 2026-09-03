'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { positionKey } from '@/chess/fen';
import { Database, Plus } from '@/components/icons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { databaseProviderById } from '@/database/registry';
import { useDatabaseProviders } from '@/database/use-database-providers';
import type { ProviderHealth } from '@/database/types';
import { EnginePanelHost } from '@/features/engine/EnginePanelHost';
import { ExplorerPanel } from '@/features/explorer/ExplorerPanel';
import { NotesPanel } from '@/features/notes/NotesPanel';
import { useProfile, useRepertoiresAtPosition } from '@/features/persistence/queries';
import { Tabs } from '@/components/ui/Tabs';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useCalculation } from '@/features/calculation/calculation-store';
import { TranspositionRoutes } from '@/features/repertoire/TranspositionRoutes';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import {
  useWorkspaceLayout,
  type WorkspacePreset,
  type WorkspaceToolId,
} from '@/stores/workspace-layout-store';

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
const TablebasePanel = lazyPanel(() =>
  import('@/features/analysis/TablebasePanel').then((module) => ({
    default: module.TablebasePanel,
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

const LABELS: Record<WorkspaceToolId, string> = {
  engine: 'Engine',
  explorer: 'Explorer',
  database: 'Database',
  repertoire: 'Repertoire',
  'model-games': 'Model Games',
  'personal-results': 'Personal Results',
  features: 'Features',
  transpositions: 'Transpositions',
  'theory-radar': 'Theory Radar',
  calculation: 'Calculation',
  'guess-the-move': 'Guess the Move',
  tablebase: 'Tablebase',
  companion: 'Companion',
  document: 'Context',
  notes: 'Notes',
};

const PRESETS: readonly { id: WorkspacePreset; label: string }[] = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'study', label: 'Study' },
  { id: 'opening-research', label: 'Opening Research' },
  { id: 'preparation', label: 'Preparation' },
  { id: 'minimal-board', label: 'Minimal Board' },
];

const PRESET_TOOL: Record<WorkspacePreset, WorkspaceToolId> = {
  analysis: 'engine',
  study: 'notes',
  'opening-research': 'explorer',
  preparation: 'database',
  'minimal-board': 'engine',
};

const ROUTE_TOOLS: Record<string, readonly WorkspaceToolId[]> = {
  analysis: [
    'engine',
    'explorer',
    'database',
    'repertoire',
    'transpositions',
    'theory-radar',
    'calculation',
    'features',
    'tablebase',
    'companion',
    'notes',
  ],
  studies: [
    'document',
    'engine',
    'explorer',
    'database',
    'transpositions',
    'calculation',
    'features',
    'tablebase',
    'companion',
    'notes',
  ],
  repertoire: [
    'document',
    'explorer',
    'database',
    'transpositions',
    'theory-radar',
    'engine',
    'model-games',
    'features',
    'notes',
  ],
  openings: [
    'explorer',
    'database',
    'transpositions',
    'theory-radar',
    'engine',
    'repertoire',
    'model-games',
    'personal-results',
    'features',
  ],
  endgame: ['tablebase', 'engine', 'features', 'notes', 'explorer', 'database'],
  'opening-files': [
    'document',
    'explorer',
    'theory-radar',
    'repertoire',
    'transpositions',
    'model-games',
    'engine',
    'notes',
  ],
  'model-game': [
    'guess-the-move',
    'notes',
    'repertoire',
    'model-games',
    'features',
    'explorer',
    'database',
    'engine',
  ],
  games: [
    'engine',
    'explorer',
    'database',
    'repertoire',
    'calculation',
    'features',
    'tablebase',
    'notes',
  ],
  preparation: [
    'document',
    'engine',
    'explorer',
    'database',
    'theory-radar',
    'repertoire',
    'model-games',
    'features',
    'notes',
  ],
  training: ['document', 'engine', 'explorer', 'database', 'features', 'tablebase', 'notes'],
  review: [
    'document',
    'engine',
    'explorer',
    'database',
    'repertoire',
    'model-games',
    'features',
    'tablebase',
    'companion',
    'notes',
  ],
};

export function WorkspaceToolDock({
  workspace,
  className,
  contextLabel = 'Context',
  contextPanel,
  fill = false,
  locked,
}: {
  readonly workspace: keyof typeof ROUTE_TOOLS;
  readonly className?: string;
  readonly contextLabel?: string;
  readonly contextPanel?: ReactNode;
  /** Fill a route-owned grid track instead of taking the persisted dock width. */
  readonly fill?: boolean;
  /**
   * Hide every tool's evidence behind an explicit choice.
   *
   * Self-analysis needs the computer to be *deliberately* absent, not broken
   * and not merely un-started — so the dock keeps its shape, keeps its tabs
   * visible, and says whose decision this was. Mounting is what is withheld:
   * a locked tool issues no query and starts no engine, which is also why the
   * lock cannot be worked around by switching tabs.
   */
  readonly locked?: {
    readonly message: string;
    readonly action?: ReactNode;
    /** Tools that stay usable while the rest are withheld. */
    readonly except?: readonly WorkspaceToolId[];
  };
}) {
  const wide = useMediaQuery('(min-width: 1100px)');
  const tools = ROUTE_TOOLS[workspace] ?? ROUTE_TOOLS.analysis!;
  /*
    A running calculation locks the dock from inside it.

    The alternative — every workspace passing a lock down — is one workspace
    away from leaking the engine into a session the player asked to be blind.
    A gate whose enforcement depends on nine call sites remembering is not a
    gate.
  */
  const calculating = useCalculation((state) => state.fen !== null && !state.revealed);
  const effectiveLock =
    locked ??
    (calculating
      ? {
          message: 'Evidence is hidden while you calculate. Submit your lines to reveal it.',
          except: ['calculation'] as readonly WorkspaceToolId[],
        }
      : undefined);
  const active = useWorkspaceLayout((state) => state.activeTools[workspace] ?? state.activeTool);
  const setActive = useWorkspaceLayout((state) => state.setActiveTool);
  const collapsed = useWorkspaceLayout((state) => state.toolDockCollapsed);
  const setCollapsed = useWorkspaceLayout((state) => state.setToolDockCollapsed);
  const width = useWorkspaceLayout((state) => state.toolDockWidth);
  const setWidth = useWorkspaceLayout((state) => state.setToolDockWidth);
  const preset = useWorkspaceLayout((state) => state.preset);
  const setPreset = useWorkspaceLayout((state) => state.setPreset);
  const selected = tools.includes(active) ? active : (tools[0] as WorkspaceToolId);
  const selectTool = (tool: WorkspaceToolId) => setActive(workspace, tool);
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const openDiagnostics = () => openSettingsAt('diagnostics');

  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!wide) return;
    const startX = event.clientX;
    const startWidth = width;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => setWidth(startWidth + startX - next.clientX);
    const done = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', done);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', done);
  };

  if (collapsed) {
    return (
      <aside
        className={cn(
          'flex shrink-0 items-center justify-center border-line-subtle bg-surface-1',
          wide ? 'w-11 border-l' : 'h-11 border-t',
          className,
        )}
      >
        <IconButton label="Open workspace tools" onClick={() => setCollapsed(false)}>
          <Database />
        </IconButton>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'relative flex min-h-0 min-w-0 shrink-0 flex-col bg-surface-1',
        wide ? 'border-l border-line-subtle' : 'min-h-[360px] border-t border-line-subtle',
        className,
      )}
      style={wide && !fill ? { width } : undefined}
      aria-label="Workspace tools"
    >
      {wide && !fill ? (
        <button
          type="button"
          aria-label="Resize workspace tools"
          onPointerDown={resize}
          className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none"
        />
      ) : (
        <div className="mx-auto my-1 h-1 w-12 rounded-full bg-line-strong" aria-hidden />
      )}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line-subtle px-3">
        <label htmlFor={`workspace-preset-${workspace}`} className="text-2xs text-tertiary">
          Layout
        </label>
        <select
          id={`workspace-preset-${workspace}`}
          value={preset}
          onChange={(event) => {
            const next = event.target.value as WorkspacePreset;
            setPreset(next);
            selectTool(PRESET_TOOL[next]);
          }}
          className="h-7 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none focus:border-accent/60"
        >
          {PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 items-stretch border-b border-line-subtle">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs
            items={tools.map((id) => ({
              id,
              label: id === 'document' ? contextLabel : LABELS[id],
            }))}
            value={selected}
            onChange={selectTool}
          />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="w-9 shrink-0 border-l border-line-subtle text-lg text-tertiary hover:bg-surface-2 hover:text-primary"
          aria-label="Collapse workspace tools"
        >
          {wide ? '›' : '⌄'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {/*
          Keyed by tool so switching tabs resets a boundary that has caught:
          a tool that failed once should be tried again on its own next visit
          rather than staying broken until the whole dock remounts.

          The dock itself is outside the boundary on purpose — the tabs have to
          survive so the user can leave a tool that will not load.
        */}
        {effectiveLock &&
        selected !== 'document' &&
        !(effectiveLock.except ?? []).includes(selected) ? (
          <LockedTool message={effectiveLock.message} action={effectiveLock.action} />
        ) : (
          <ErrorBoundary
            key={selected}
            label={selected === 'document' ? contextLabel : LABELS[selected]}
            onClose={() => selectTool(tools[0] as WorkspaceToolId)}
            closeLabel="Close tool"
            onDiagnostics={openDiagnostics}
          >
            <ToolContent tool={selected} contextPanel={contextPanel} />
          </ErrorBoundary>
        )}
      </div>
    </aside>
  );
}

function LockedTool({
  message,
  action,
}: {
  readonly message: string;
  readonly action?: ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      role="status"
    >
      <span aria-hidden className="text-xl text-tertiary/60">
        ◔
      </span>
      <p className="max-w-[34ch] text-xs leading-relaxed text-secondary">{message}</p>
      {action}
    </div>
  );
}

function ToolContent({ tool, contextPanel }: { tool: WorkspaceToolId; contextPanel?: ReactNode }) {
  if (tool === 'engine') return <EnginePanelHost />;
  if (tool === 'explorer') return <ExplorerPanel />;
  if (tool === 'database') return <DatabasePositionPanel />;
  if (tool === 'repertoire') return <RepertoirePositionPanel />;
  if (tool === 'model-games') return <GameInsightsPanel />;
  if (tool === 'personal-results') return <PersonalResultsPanel />;
  if (tool === 'features') return <FeaturesPanel />;
  if (tool === 'transpositions') return <TranspositionsPanel />;
  if (tool === 'theory-radar') return <TheoryRadarHost />;
  if (tool === 'calculation') return <CalculationHost />;
  if (tool === 'guess-the-move') return <GuessTheMovePanel />;
  if (tool === 'tablebase') return <TablebasePanel />;
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
