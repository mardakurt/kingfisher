'use client';

/**
 * Settings, in sections.
 *
 * A single scrolling list of twenty controls is a list nobody reads, so the
 * dialog is split by what the setting affects and only one section is on screen
 * at a time. Appearance choices carry a live preview drawn by the real board
 * renderer — not a picture of one — because the only trustworthy preview of a
 * piece set is the piece set.
 */

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Check } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { BookManager } from '@/features/book/BookManager';
import { EngineManager } from '@/features/engine/EngineManager';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented, Tabs } from '@/components/ui/Tabs';
import { BOARD_THEMES, boardTheme, boardThemeVariables } from '@/features/board/themes';
import { PIECE_SETS, PieceIcon } from '@/features/board/pieces';
import { MiniBoard } from '@/features/board/MiniBoard';
import { ENGINE_PRESETS, detectCores, enginePreset, resolveThreads } from '@/engine/presets';
import { useEngine } from '@/stores/engine-store';
import {
  createWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
  type BackedUpReferenceSource,
  type WorkspaceBackup,
} from '@/persistence/backup';
import { getRepositories } from '@/persistence/repositories';
import {
  useProfile,
  phase3Keys,
  invalidateGames,
  invalidatePositionContext,
} from '@/features/persistence/queries';
import { parsePairing } from '@/companion/client';
import { importPgnIntoSqlite } from '@/companion/import';
import { companionClient } from '@/companion/session';
import {
  LICHESS_TOKEN_URL,
  setLichessToken,
  testLichessAccount,
} from '@/database/providers/lichess-auth';
import { beginLichessLogin, revokeToken } from '@/database/providers/lichess-pkce';
import { fetchChessComProfile } from '@/sync/chess-com-sync';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { lastFailures } from '@/components/ErrorBoundary';
import {
  repairIntegrity,
  repairableIssues,
  scanIntegrity,
  type IntegrityReport,
} from '@/persistence/integrity';
import { useWorkspaceLayout } from '@/stores/workspace-layout-store';
import { APP_VERSION } from '@/lib/version';

import { buildDiagnosticReport } from './diagnostic-report';
import { searchSettings, type SettingsSection } from './settings-index';
import { exportSettings, parseSettingsExport } from './settings-transfer';
import { useShortcuts } from '@/stores/shortcuts-store';
import type { ChessDatabaseProvider, ProviderHealth } from '@/database/types';
import { engineDefinitions } from '@/engine/registry';
import { useCompanionStatus } from '@/companion/useCompanion';
import { useAccountSync, type AccountSyncState } from '@/stores/account-sync-store';
import type { LinkedAccountRecord, SyncProvider } from '@/persistence/domain';
import { cn } from '@/lib/cn';
import type { PieceType } from '@/chess/types';
import { DEFAULT_PREFERENCES, usePreferences, type Preferences } from '@/stores/preferences-store';
import { catalogPack } from '@/reference/catalog';
import { installedReferenceSources, startInstall } from '@/reference/manager';
import { formatBytes } from '@/features/databases/CollectionList';
import { useUi } from '@/stores/ui-store';

import { TablebaseSettings } from './TablebaseSettings';

type Section = SettingsSection;

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'board', label: 'Board' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'engine', label: 'Engine' },
  { id: 'companion', label: 'Companion' },
  { id: 'database', label: 'Database' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'profile', label: 'Profile' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const isSection = (value: string | null): value is Section =>
  value !== null && SECTIONS.some((entry) => entry.id === value);

/**
 * The starting position, for every appearance preview.
 *
 * Deliberately the start rather than a contrived position with one of each
 * piece: thirty-two men is the densest a board ever gets, so it is the case
 * where a piece set is hardest to read and where a clipped or overlapping
 * board is most obvious. It is also the one position every chess player can
 * check at a glance — a preview you have to study to verify is not a preview.
 */
const PREVIEW_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function SettingsDialog() {
  const open = useUi((state) => state.settingsOpen);
  const setOpen = useUi((state) => state.setSettingsOpen);
  const requested = useUi((state) => state.settingsSection);
  const [chosen, setChosen] = useState<Section>('appearance');

  /*
    Derived rather than synchronised through an effect. A request from
    elsewhere ("open diagnostics") wins until the user picks a tab themselves,
    at which point it is cleared and their choice stands. Copying it into local
    state in an effect would render the wrong tab for one frame and fight the
    user on every re-render.
  */
  const section: Section = isSection(requested) ? requested : chosen;
  const choose = (next: Section) => {
    setChosen(next);
    if (requested) useUi.setState({ settingsSection: null });
  };

  const close = () => {
    setOpen(false);
    if (requested) useUi.setState({ settingsSection: null });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Settings"
      description="Stored on this machine. Nothing here needs an account."
      width="w-[640px]"
    >
      <SettingsSearch onJump={choose} />
      <div className="-mx-4 mb-3 overflow-x-auto border-b border-line-subtle px-2">
        <Tabs items={SECTIONS} value={section} onChange={choose} />
      </div>
      {section === 'appearance' && <AppearanceSection />}
      {section === 'board' && <BoardSection />}
      {section === 'pieces' && <PiecesSection />}
      {section === 'workspace' && <WorkspaceSection />}
      {section === 'engine' && <EngineSection />}
      {section === 'companion' && <CompanionSection />}
      {section === 'keyboard' && <KeyboardSection />}
      {section === 'assistant' && <AssistantSection />}
      {section === 'database' && <DatabaseSection />}
      {section === 'accounts' && <AccountsSection />}
      {section === 'profile' && <ProfileSection />}
      {section === 'diagnostics' && <DiagnosticsSection />}
    </Dialog>
  );
}

function AppearanceSection() {
  const prefs = usePreferences();
  return (
    <div className="flex flex-col gap-4">
      <Row label="Theme" hint="Applies to the whole application, not the board.">
        <Segmented
          items={[
            { id: 'dark', label: 'Dark' },
            { id: 'light', label: 'Light' },
          ]}
          value={prefs.theme}
          onChange={(value) => prefs.set('theme', value)}
        />
      </Row>

      <Row label="Piece animation" hint="Reduced-motion system settings always win.">
        <Segmented
          items={[
            { id: 'off', label: 'Off' },
            { id: 'fast', label: 'Fast' },
            { id: 'normal', label: 'Normal' },
          ]}
          value={prefs.animationSpeed}
          onChange={(value) => prefs.set('animationSpeed', value)}
        />
      </Row>

      <Row
        label="Annotation colours"
        hint="Arrow and highlight brushes. Names still round-trip through PGN."
      >
        <Segmented
          items={[
            { id: 'standard', label: 'Standard' },
            { id: 'colorblind', label: 'Colour-blind' },
          ]}
          value={prefs.arrowPalette}
          onChange={(value) => prefs.set('arrowPalette', value)}
        />
      </Row>

      <div className="flex gap-1.5" aria-hidden>
        {(['green', 'red', 'blue', 'yellow'] as const).map((brush) => (
          <span
            key={brush}
            title={brush}
            className="h-5 flex-1 rounded-[3px]"
            style={{ background: `var(--shape-${brush})` }}
          />
        ))}
      </div>
    </div>
  );
}

function BoardSection() {
  const prefs = usePreferences();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_176px] gap-4">
        <div className="grid grid-cols-2 gap-1.5">
          {BOARD_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={prefs.boardTheme === theme.id}
              onClick={() => prefs.set('boardTheme', theme.id)}
              title={theme.description}
              className={cn(
                'flex items-center gap-2 rounded-[4px] border px-1.5 py-1 text-left text-2xs transition-colors',
                prefs.boardTheme === theme.id
                  ? 'border-accent bg-accent-muted text-primary'
                  : 'border-line text-tertiary hover:border-line-strong hover:text-secondary',
              )}
            >
              <span className="grid h-6 w-6 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-[2px]">
                <span style={{ background: theme.light }} />
                <span style={{ background: theme.dark }} />
                <span style={{ background: theme.dark }} />
                <span style={{ background: theme.light }} />
              </span>
              <span className="truncate">{theme.name}</span>
            </button>
          ))}
        </div>

        {/*
          The real renderer, so the preview cannot drift from the board — and
          large enough to see. At 120px the pieces were smaller than the
          typography around them, which is not a preview of anything.
        */}
        <div className="shrink-0">
          <MiniBoard
            fen={PREVIEW_FEN}
            theme={prefs.boardTheme}
            pieceSet={prefs.pieceSet}
            testId="board-preview"
            className="w-full"
          />
          <p className="mt-1 text-center text-[10px] text-tertiary">
            {boardTheme(prefs.boardTheme).name}
          </p>
        </div>
      </div>

      <Row label="Coordinates" hint="Labels always name the real square, so they follow a flip.">
        <Segmented
          items={[
            { id: 'inside', label: 'Inside' },
            { id: 'outside', label: 'Outside' },
            { id: 'none', label: 'Off' },
          ]}
          value={prefs.coordinateStyle}
          onChange={(value) => prefs.set('coordinateStyle', value)}
        />
      </Row>

      <Row label="Evaluation bar">
        <Toggle
          label="Show evaluation bar"
          checked={prefs.showEvaluationBar}
          onChange={(value) => prefs.set('showEvaluationBar', value)}
        />
      </Row>

      <Row
        label="Evaluation graph"
        hint="A bar per move that has a saved engine evaluation, under the board."
      >
        <Toggle
          label="Show evaluation graph"
          checked={prefs.showEvaluationGraph}
          onChange={(value) => prefs.set('showEvaluationGraph', value)}
        />
      </Row>
    </div>
  );
}

const PREVIEW_PIECES: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

function PiecesSection() {
  const prefs = usePreferences();
  const theme = boardTheme(prefs.boardTheme);

  return (
    <div className="flex flex-col gap-1.5">
      {PIECE_SETS.map((set) => {
        const active = prefs.pieceSet === set.id;
        return (
          <button
            key={set.id}
            type="button"
            aria-pressed={active}
            onClick={() => prefs.set('pieceSet', set.id)}
            className={cn(
              'flex items-center gap-3 rounded-[5px] border px-2.5 py-2 text-left transition-colors',
              active
                ? 'border-accent bg-accent-muted'
                : 'border-line hover:border-line-strong hover:bg-surface-2',
            )}
          >
            {/*
              Rendered on both square colours, because a set that reads on one
              and vanishes on the other is the failure worth catching here.
            */}
            <span
              className="flex h-9 shrink-0 overflow-hidden rounded-[3px]"
              style={boardThemeVariables(theme) as React.CSSProperties}
            >
              {PREVIEW_PIECES.map((type, index) => (
                <span
                  key={type}
                  className="flex h-9 w-9 items-center justify-center"
                  style={{
                    background: index % 2 === 0 ? theme.light : theme.dark,
                  }}
                >
                  <PieceIcon
                    piece={{ color: index < 3 ? 'w' : 'b', type }}
                    set={set.id}
                    className="h-[86%] w-[86%]"
                    decorative
                  />
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-xs', active ? 'text-primary' : 'text-secondary')}>
                {set.name}
              </span>
              <span className="block truncate text-[10.5px] text-tertiary">{set.description}</span>
              {/*
                The artwork is other people's work under a licence that asks for
                credit. Crediting it where it is chosen, rather than only in a
                file, is both the obligation and the more useful place for it.
              */}
              {set.kind === 'vector' ? (
                <span className="block truncate text-[10px] text-tertiary/80">
                  {set.attribution.author} · {set.attribution.license}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EngineSection() {
  const [tab, setTab] = useState<'analysis' | 'engines' | 'books'>('analysis');
  return (
    <div className="flex flex-col gap-4">
      <ConfigurationHealth area="engine" />
      <Segmented
        items={[
          { id: 'analysis', label: 'Analysis settings' },
          { id: 'engines', label: 'Engines' },
          { id: 'books', label: 'Books' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'engines' ? (
        <EngineManager />
      ) : tab === 'books' ? (
        <BookManager />
      ) : (
        <AnalysisSettings />
      )}
    </div>
  );
}

function AnalysisSettings() {
  const prefs = usePreferences();
  const capabilities = useEngine((state) => state.primary.capabilities);
  return (
    <div className="flex flex-col gap-4">
      <Row
        label="Analysis preset"
        hint="Threads scale to this machine and always leave one core for the interface."
      >
        <Segmented
          items={[
            ...ENGINE_PRESETS.map((preset) => ({ id: preset.id, label: preset.name })),
            { id: 'custom' as const, label: 'Custom' },
          ]}
          value={prefs.enginePreset}
          onChange={(value) => {
            prefs.set('enginePreset', value);
            const preset = enginePreset(value);
            if (!preset) return;
            prefs.set('engineMultiPv', preset.multiPv);
            prefs.set('engineHashMb', preset.hashMb);
            prefs.set('engineLimit', preset.limit);
            prefs.set(
              'engineThreads',
              resolveThreads(preset, detectCores(), capabilities?.maxThreads ?? detectCores()),
            );
          }}
        />
      </Row>

      {/* The value is always what the engine runs with; a preset only fills it
          in. Changing it therefore means the preset no longer describes the
          settings, and saying so is more honest than leaving a preset selected
          that is not in force. */}
      <Row
        label="Lines (MultiPV)"
        hint="How many candidate moves the engine reports. Each extra line costs search depth on the others, so three is a good default and eight is a different tool. Changing this puts the preset into Custom."
      >
        <Segmented
          items={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))}
          value={String(prefs.engineMultiPv)}
          onChange={(value) => {
            prefs.set('engineMultiPv', Number(value));
            prefs.set('enginePreset', 'custom');
          }}
        />
      </Row>

      <Row
        label="Hash and threads"
        hint="Threads is how many CPU cores the search runs on. Hash is the memory it keeps its table of already-searched positions in — a bigger table means fewer positions searched twice, until it is large enough that your machine starts swapping. Both are set by the preset, sized to the cores this machine reports."
      >
        <span className="text-2xs text-secondary tabular">
          {prefs.engineHashMb} MB · {prefs.engineThreads} thread
          {prefs.engineThreads === 1 ? '' : 's'}
          {capabilities?.maxThreads ? ` of ${capabilities.maxThreads}` : ''}
        </span>
      </Row>

      <Row
        label="Analyse automatically"
        hint="Restart the engine whenever the position changes. Convenient while browsing a game; expensive on a laptop battery."
      >
        <Toggle
          label="Analyse automatically"
          checked={prefs.autoAnalyse}
          onChange={(value) => prefs.set('autoAnalyse', value)}
        />
      </Row>
    </div>
  );
}

function DatabaseSection() {
  const prefs = usePreferences();
  const providers = useDatabaseProviders();
  return (
    <div className="flex flex-col gap-4">
      <ConfigurationHealth area="database" />
      {/*
        The reference source, which the explorer, the theory radar and the
        position report all read. It was settable only from the explorer's own
        header, which meant the settings search could offer "Explorer source"
        and then land somebody in a section that did not contain it.
      */}
      <Row
        label="Explorer source"
        hint="The reference database the explorer, theory radar and position report read."
      >
        <select
          aria-label="Explorer source"
          value={prefs.explorerSourceId}
          onChange={(event) => prefs.set('explorerSourceId', event.target.value)}
          className="h-8 w-full max-w-[220px] rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Explorer minimum rating" hint="Applies to database lookups that support it.">
        <Segmented
          items={[
            { id: '0', label: 'Any' },
            { id: '2000', label: '2000' },
            { id: '2200', label: '2200' },
            { id: '2500', label: '2500' },
          ]}
          value={String(prefs.explorerMinRating ?? 0)}
          onChange={(value) =>
            prefs.set('explorerMinRating', Number(value) === 0 ? null : Number(value))
          }
        />
      </Row>

      <Row label="Explorer since" hint="Only count games from this year onwards.">
        <Segmented
          items={[
            { id: '0', label: 'Any' },
            { id: '2015', label: '2015' },
            { id: '2020', label: '2020' },
            { id: '2023', label: '2023' },
          ]}
          value={String(prefs.explorerSinceYear ?? 0)}
          onChange={(value) =>
            prefs.set('explorerSinceYear', Number(value) === 0 ? null : Number(value))
          }
        />
      </Row>
      {/*
        The Lichess connection lives in Accounts now, where somebody looking
        for "connect my account" will actually go. Left reachable from here
        too, because this is the section that explains which explorer sources
        need it.
      */}
      <div className="border-t border-line-subtle pt-3">
        <LichessAccess />
      </div>
      <div className="border-t border-line-subtle pt-3">
        <BackupControls />
      </div>
    </div>
  );
}

/**
 * Pairing with the local companion.
 *
 * The whole configuration is one paste. The companion prints a URL with the
 * token in its fragment; splitting that into two fields the user has to copy
 * separately would be two chances to get it wrong for no benefit.
 */
function CompanionSection() {
  const prefs = usePreferences();
  const status = useCompanionStatus();
  const [pairing, setPairing] = useState('');
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(prefs.companionUrl && prefs.companionToken);

  const pair = () => {
    const parsed = parsePairing(pairing);
    if (!parsed) {
      setError('That does not look like a pairing address. It ends with #token=…');
      return;
    }
    setError(null);
    prefs.set('companionUrl', parsed.url);
    prefs.set('companionToken', parsed.token);
    setPairing('');
  };

  return (
    <div className="flex flex-col gap-4">
      <ConfigurationHealth area="companion" />
      <div>
        <h3 className="text-xs text-primary">Local companion</h3>
        <p className="mt-1 text-2xs leading-relaxed text-tertiary">
          {/*
            It does serve tablebases as of Phase 12: the companion manages a
            Fathom-based probe helper, so local Syzygy files are read without
            the user starting anything else. Endgame evidence still falls back
            to the Lichess provider, and the board says which one answered.
          */}
          Optional. It runs native engines, SQLite collections and local Syzygy tables — the things
          a browser cannot. Everything else in Kingfisher works without it.
        </p>
        <p className="mt-2 rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 font-mono text-[10.5px] text-secondary">
          npm run companion
        </p>
      </div>

      {connected ? (
        <div className="rounded-[4px] border border-line bg-surface-inset p-3">
          <p className="text-2xs text-secondary">
            Paired with <span className="font-mono">{prefs.companionUrl}</span>
          </p>
          {status.isPending ? (
            <p className="mt-1 text-[10.5px] text-tertiary">Checking…</p>
          ) : status.isError ? (
            <p className="mt-1 text-[10.5px] text-negative">
              {status.error instanceof Error ? status.error.message : 'Not reachable.'}
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-[10.5px]">
              <dt className="text-tertiary">Native engines</dt>
              <dd className="text-right text-secondary">
                {status.data?.engines.map((engine) => engine.name).join(', ') || 'none'}
              </dd>
              <dt className="text-tertiary">Databases</dt>
              <dd className="text-right text-secondary tabular">
                {status.data?.databases.length ?? 0}
              </dd>
              <dt className="text-tertiary">Running sessions</dt>
              <dd className="text-right text-secondary tabular">
                {status.data?.sessions.length ?? 0}
              </dd>
            </dl>
          )}
          <div className="mt-2 flex justify-end">
            <Button
              variant="danger"
              onClick={() => {
                prefs.set('companionUrl', '');
                prefs.set('companionToken', '');
              }}
            >
              Unpair
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-2xs text-tertiary">
            Pairing address
            <input
              value={pairing}
              onChange={(event) => setPairing(event.target.value)}
              placeholder="http://127.0.0.1:4321#token=…"
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 font-mono text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
            />
          </label>
          {error ? <p className="mt-1 text-2xs text-negative">{error}</p> : null}
          <div className="mt-2 flex justify-end">
            <Button variant="accent" onClick={pair} disabled={!pairing.trim()}>
              Pair
            </Button>
          </div>
        </div>
      )}

      {connected ? <CustomEngines /> : null}
      {connected ? <SqliteDatabases /> : null}
      {connected ? <TablebaseSettings /> : null}
    </div>
  );
}

/**
 * Lichess and Chess.com accounts whose games are pulled locally.
 *
 * Nothing about this is an account *in* Kingfisher: a username is public,
 * nothing is uploaded, and no credential is required — a Lichess token, if
 * one is already set for the explorer, is reused only because it raises that
 * API's rate allowance.
 *
 * §25 is the rule the status line here exists for: a sync that failed says
 * why it failed. An account whose last sync was rate-limited must never be
 * presented as an account with no games.
 */
function AccountsSection() {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const runs = useAccountSync((state) => state.runs);
  const syncNow = useAccountSync((state) => state.syncNow);
  const [provider, setProvider] = useState<SyncProvider>('lichess');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const accounts = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: async () => (await getRepositories()).linkedAccounts.list(),
  });

  const link = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const repositories = await getRepositories();
      const account = await repositories.linkedAccounts.link({ provider, username: trimmed });
      setUsername('');
      await accounts.refetch();
      // Linking is only useful once it has fetched something, so the first
      // sync starts here rather than waiting to be asked a second time.
      await syncNow(account);
      await accounts.refetch();
      invalidateGames(queryClient);
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The account could not be linked.',
      });
    } finally {
      setBusy(false);
    }
  };

  const sync = async (account: LinkedAccountRecord) => {
    await syncNow(account);
    await accounts.refetch();
    invalidateGames(queryClient);
  };

  const unlink = async (id: string) => {
    const repositories = await getRepositories();
    await repositories.linkedAccounts.unlink(id);
    await accounts.refetch();
  };

  const linked = accounts.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <LichessAccess />

      <div className="border-t border-line-subtle pt-4">
        <h3 className="text-xs text-primary">Linked accounts</h3>
        <p className="mt-1 text-2xs leading-relaxed text-tertiary">
          Games from a Lichess or Chess.com username, pulled into the ordinary local collection —
          same fingerprint, same duplicate handling, same searches as anything else imported.
          Nothing is uploaded and no Kingfisher account exists.
        </p>
      </div>

      {linked.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {linked.map((account) => {
            const run = runs[account.id];
            return (
              <li
                key={account.id}
                className="rounded-[4px] border border-line bg-surface-inset p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-2xs text-secondary">
                    {PROVIDER_LABEL[account.provider]} ·{' '}
                    <span className="font-mono text-primary">{account.username}</span>
                  </span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="accent"
                      disabled={run?.running}
                      onClick={() => void sync(account)}
                    >
                      {run?.running ? 'Syncing…' : 'Sync now'}
                    </Button>
                    <Button variant="danger" onClick={() => void unlink(account.id)}>
                      Unlink
                    </Button>
                  </div>
                </div>
                <p
                  className={cn(
                    'mt-1 text-[10.5px]',
                    run && run.state !== 'ready' && run.state !== 'loading'
                      ? 'text-negative'
                      : 'text-tertiary',
                  )}
                >
                  {describeAccountStatus(account, run)}
                </p>
                {run?.remedy ? (
                  <p className="mt-0.5 text-[10.5px] text-tertiary">{run.remedy}</p>
                ) : null}
                {account.provider === 'chess.com' ? (
                  <ChessComProfileLine account={account} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div>
        <label className="block text-2xs text-tertiary">
          Add an account
          <div className="mt-1 flex gap-1.5">
            <select
              value={provider}
              aria-label="Account provider"
              onChange={(event) => setProvider(event.target.value as SyncProvider)}
              className="h-8 rounded-[4px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60"
            >
              <option value="lichess">Lichess</option>
              <option value="chess.com">Chess.com</option>
            </select>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              aria-label="Account username"
              className="h-8 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2.5 font-mono text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
            />
            <Button
              variant="accent"
              disabled={!username.trim() || busy}
              onClick={() => void link()}
            >
              {busy ? 'Linking…' : 'Link'}
            </Button>
          </div>
        </label>
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<SyncProvider, string> = {
  lichess: 'Lichess',
  'chess.com': 'Chess.com',
};

/**
 * One factual line per account.
 *
 * Never "no games": an account that failed to sync says what failed, and one
 * that has never synced says that instead of implying an empty library.
 */
function describeAccountStatus(
  account: LinkedAccountRecord,
  run: AccountSyncState | undefined,
): string {
  if (run?.running) return 'Syncing…';
  if (run && run.state !== 'ready') return run.message;
  if (run?.state === 'ready') {
    return `${run.message} ${account.importedCount.toLocaleString()} imported in total.`;
  }
  if (account.lastSyncStatus === 'error') {
    return account.lastError ?? 'The last sync failed.';
  }
  if (account.lastSyncCompletedAt === undefined) return 'Never synced.';
  return `Last synced ${describeAge(account.lastSyncCompletedAt)}. ${account.importedCount.toLocaleString()} imported in total.`;
}

const describeAge = (at: number): string => {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * Arbitrary UCI engines, registered by path rather than installed from the
 * catalogue.
 *
 * The user names an executable; the companion is the one that decides
 * whether it is trustworthy — it confirms the file exists and is
 * executable, then runs a real UCI handshake before accepting it. What
 * comes back (a detected name, an author, or a truthful rejection) is
 * everything shown here, because this build has no other way to know
 * whether an arbitrary binary does what it claims.
 */
function CustomEngines() {
  const status = useCompanionStatus();
  const notify = useUi((state) => state.notify);
  const [enginePath, setEnginePath] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const engines = status.data?.engines ?? [];
  const custom = engines.filter((engine) => engine.custom);

  const register = async () => {
    const client = companionClient();
    const trimmed = enginePath.trim();
    if (!client || !trimmed) return;
    setBusy('register');
    try {
      const registered = await client.registerEngine(trimmed);
      setEnginePath('');
      await status.refetch();
      notify({
        tone: 'success',
        message: registered.detectedName
          ? `${registered.detectedName} added and confirmed to speak UCI.`
          : `${registered.name} added.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The engine could not be registered.',
      });
    } finally {
      setBusy(null);
    }
  };

  const unregister = async (id: string) => {
    const client = companionClient();
    if (!client) return;
    setBusy(`remove:${id}`);
    try {
      await client.unregisterEngine(id);
      await status.refetch();
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The engine could not be removed.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-[4px] border border-line bg-surface-inset p-3">
      <h3 className="text-xs text-primary">Custom UCI engines</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        Any engine that speaks UCI, not only the ones this build knows how to install. The companion
        confirms it before adding it: a path that is not executable, or a process that never
        completes the handshake, is rejected rather than added.
      </p>

      {custom.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {custom.map((engine) => (
            <li
              key={engine.id}
              className="flex items-center justify-between gap-2 rounded-[4px] border border-line-subtle px-2 py-1 text-[10.5px]"
            >
              <span className="truncate text-secondary">
                {engine.name}
                {engine.author ? <span className="text-tertiary"> · {engine.author}</span> : null}
              </span>
              <Button
                variant="danger"
                disabled={busy === `remove:${engine.id}`}
                onClick={() => void unregister(engine.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex gap-1.5">
        <input
          value={enginePath}
          onChange={(event) => setEnginePath(event.target.value)}
          placeholder="/absolute/path/to/engine"
          aria-label="Engine executable path"
          className="h-8 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-2 px-2.5 font-mono text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
        />
        <Button
          variant="accent"
          onClick={() => void register()}
          disabled={!enginePath.trim() || busy === 'register'}
        >
          {busy === 'register' ? 'Testing…' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

/**
 * SQLite collections held by the companion.
 *
 * IndexedDB was measured to 50,000 games and is fine there. This is for the
 * collections where it is not — and the browser still does the chess, so a game
 * imported here has the same fingerprint and the same canonical position keys
 * as one imported into IndexedDB.
 */
function SqliteDatabases() {
  const queryClient = useQueryClient();
  const status = useCompanionStatus();
  const notify = useUi((state) => state.notify);
  const [name, setName] = useState('');
  const [pgn, setPgn] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [aggregates, setAggregates] = useState<Record<string, string>>({});

  const databases = status.data?.databases ?? [];
  const selected = target || databases[0]?.key || '';

  const create = async () => {
    const client = companionClient();
    if (!client || !name.trim()) return;
    setBusy('create');
    try {
      const created = await client.createDatabase(name.trim());
      setName('');
      setTarget(created.key);
      await status.refetch();
      notify({ tone: 'success', message: `SQLite database "${created.name}" created.` });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The database could not be created.',
      });
    } finally {
      setBusy(null);
    }
  };

  /*
    The explorer answers unfiltered questions from a derived aggregate table, so
    the honest thing to offer is a way to check that the derivation still agrees
    with the games and positions it came from — and a rebuild if it does not.
    Nothing is repaired without being asked.
  */
  const verify = async (key: string) => {
    const client = companionClient();
    if (!client) return;
    setBusy(`verify:${key}`);
    try {
      const facts = await client.databaseIntegrity(key);
      setAggregates((current) => ({
        ...current,
        [key]: facts.consistent
          ? `Aggregates agree with ${facts.positions.toLocaleString()} indexed positions.`
          : `Aggregates cover ${facts.aggregatedPositions.toLocaleString()} of ${facts.positions.toLocaleString()} positions.`,
      }));
      if (!facts.consistent) {
        const rebuilt = await client.rebuildAggregates(key);
        setAggregates((current) => ({
          ...current,
          [key]: rebuilt.consistent
            ? `Rebuilt: aggregates agree with ${rebuilt.positions.toLocaleString()} positions.`
            : 'Rebuild did not reconcile the aggregates; the source rows may be damaged.',
        }));
        await queryClient.invalidateQueries({ queryKey: ['explorer', `sqlite:${key}`] });
      }
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The check could not be run.',
      });
    } finally {
      setBusy(null);
    }
  };

  const load = async () => {
    const client = companionClient();
    if (!client || !selected || !pgn.trim()) return;
    setBusy('import');
    try {
      const result = await importPgnIntoSqlite(client, selected, pgn, (progress) =>
        /*
          The streaming worker knows how many games it has parsed, never how
          many are still to come, so this counts up rather than inventing a
          denominator that would sit at zero.
        */
        setBusy(
          `import:${progress.imported.toLocaleString()} of ${progress.parsed.toLocaleString()} parsed`,
        ),
      );
      setPgn('');
      await queryClient.invalidateQueries({ queryKey: ['explorer', `sqlite:${selected}`] });
      await status.refetch();
      notify({
        tone: 'success',
        message: `${result.imported} games imported, ${result.duplicates} duplicates skipped.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The import failed.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-line-subtle pt-3">
      <h3 className="text-xs text-primary">SQLite collections</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        For archives larger than IndexedDB is comfortable with. They appear as ordinary sources in
        the opening explorer.
      </p>

      {databases.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {databases.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center gap-2 rounded-[4px] border border-line bg-surface-inset px-2.5 py-1.5 text-2xs"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-secondary">{entry.name}</span>
                {aggregates[entry.key] ? (
                  <span className="mt-0.5 block text-[10px] text-tertiary">
                    {aggregates[entry.key]}
                  </span>
                ) : null}
              </div>
              <span className="text-tertiary tabular">
                {entry.games === null ? '—' : `${entry.games.toLocaleString()} games`}
              </span>
              <Button
                variant="ghost"
                onClick={() => void verify(entry.key)}
                disabled={busy !== null}
              >
                {busy === `verify:${entry.key}` ? 'Checking…' : 'Verify explorer index'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex gap-1.5">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New collection name"
          className={FIELD_INPUT.replace('mt-1 ', '')}
        />
        <Button onClick={() => void create()} disabled={!name.trim() || busy !== null}>
          Create
        </Button>
      </div>

      {databases.length > 0 ? (
        <div className="mt-3">
          <label className="block text-2xs text-tertiary">
            Import a PGN into
            <select
              value={selected}
              onChange={(event) => setTarget(event.target.value)}
              className={FIELD_INPUT}
            >
              {databases.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={pgn}
            onChange={(event) => setPgn(event.target.value)}
            placeholder="Paste a PGN collection…"
            className="mt-1.5 min-h-24 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 font-mono text-[10.5px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
          />
          <div className="mt-1.5 flex items-center justify-end gap-2">
            {busy?.startsWith('import:') ? (
              <span className="text-2xs text-tertiary tabular">{busy.slice(7)}</span>
            ) : null}
            <Button
              variant="accent"
              onClick={() => void load()}
              disabled={!pgn.trim() || busy !== null}
            >
              {busy?.startsWith('import') ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where the grounded assistant sends its evidence packets.
 *
 * No key ships with Kingfisher and none is ever defaulted. An unconfigured
 * assistant is a disabled assistant, and every other part of the application
 * carries on exactly as before — which is the only arrangement that keeps the
 * product honest about being local-first.
 */
function AssistantSection() {
  const prefs = usePreferences();
  const configured = Boolean(prefs.assistantBaseUrl && prefs.assistantModel);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-xs text-primary">Grandmaster companion</h3>
        <p className="mt-1 text-2xs leading-relaxed text-tertiary">
          Answers questions about the position using only evidence Kingfisher already has — engine
          lines, database counts, your repertoire, structural features, tablebase results. It is
          shown the evidence and asked to cite it; it is not asked what it remembers about chess.
        </p>
      </div>

      <label className="block text-2xs text-tertiary">
        API base URL (OpenAI-compatible)
        <input
          value={prefs.assistantBaseUrl}
          onChange={(event) => prefs.set('assistantBaseUrl', event.target.value.trim())}
          placeholder="http://localhost:11434/v1"
          className={FIELD_INPUT}
        />
      </label>
      <label className="block text-2xs text-tertiary">
        Model
        <input
          value={prefs.assistantModel}
          onChange={(event) => prefs.set('assistantModel', event.target.value.trim())}
          placeholder="llama3.1 or gpt-4o-mini"
          className={FIELD_INPUT}
        />
      </label>
      <label className="block text-2xs text-tertiary">
        API key (leave empty for a local endpoint)
        <input
          type="password"
          value={prefs.assistantApiKey}
          onChange={(event) => prefs.set('assistantApiKey', event.target.value.trim())}
          className={FIELD_INPUT}
        />
      </label>

      <p className="text-[10.5px] leading-relaxed text-tertiary">
        {configured
          ? 'Configured. The Companion tab in Analysis is enabled.'
          : 'Not configured. The Companion tab explains what is missing and everything else works.'}{' '}
        The key is stored in this browser only and is sent to the URL above and nowhere else.
      </p>
    </div>
  );
}

const FIELD_INPUT =
  'mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60';

function ProfileSection() {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const profile = useProfile();
  const [draftAliases, setDraftAliases] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aliases = draftAliases ?? profile.data?.aliases.join('\n') ?? '';

  const save = async () => {
    setBusy(true);
    try {
      const values = aliases
        .split('\n')
        .map((alias) => alias.trim())
        .filter(Boolean);
      await (await getRepositories()).profile.setAliases(values);
      setDraftAliases(values.join('\n'));
      void queryClient.invalidateQueries({ queryKey: phase3Keys.profile });
      /*
        The aliases are what "My games" means. Without this the explorer keeps
        showing the count it computed before the user said who they are —
        which, on a fresh profile, is zero for every position they had already
        looked at.
      */
      invalidatePositionContext(queryClient);
      notify({
        tone: 'success',
        message: `${values.length} personal name ${values.length === 1 ? 'alias' : 'aliases'} saved.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Aliases could not be saved.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-xs text-primary">My player names</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        One exact name per line. Matching folds case and repeated whitespace only; names are never
        inferred or silently merged.
      </p>
      <textarea
        value={aliases}
        onChange={(event) => setDraftAliases(event.target.value)}
        placeholder={'Metin Arda Kurt\nM. A. Kurt'}
        className="mt-3 min-h-32 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 font-mono text-xs leading-relaxed text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
      />
      <div className="mt-2 flex justify-end">
        <Button variant="accent" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save aliases'}
        </Button>
      </div>
    </div>
  );
}

/**
 * The public facts Chess.com publishes about a linked account.
 *
 * Their Published-Data API serves a profile and a stats document without a
 * key, so this is one request each and no credential. It is shown because a
 * linked account with nothing but a username beside it gives no way to tell
 * "linked to the right person" from "linked to a typo".
 *
 * Nothing here is inferred, and in particular no attempt is made to connect
 * this username to a FIDE identity or to a player in a reference source. That
 * remains an explicit statement the user makes, exactly as in Phase 12.
 */
function ChessComProfileLine({ account }: { readonly account: LinkedAccountRecord }) {
  const profile = useQuery({
    queryKey: ['chess-com-profile', account.username],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: ({ signal }) => fetchChessComProfile(account.username, { signal }),
  });

  if (profile.isPending) return null;
  if (profile.isError) {
    return (
      <p className="mt-0.5 text-[10.5px] text-tertiary">
        Chess.com did not return a profile for this username.
      </p>
    );
  }

  const ratings = Object.entries(profile.data.ratings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, rating]) => `${kind} ${rating}`)
    .join(' · ');

  return (
    <p className="mt-0.5 text-[10.5px] text-tertiary">
      {[profile.data.title, profile.data.name, profile.data.country].filter(Boolean).join(' · ')}
      {ratings ? ` — ${ratings}` : ' — no published ratings'}
    </p>
  );
}

/**
 * Connecting a Lichess account.
 *
 * Lichess requires authentication for explorer requests now, and Kingfisher
 * ships no credential of its own — one would breach their terms and give every
 * installation a single shared rate limit. Phase 5 concluded from that that
 * users must paste a personal token; that was the wrong reading. Lichess
 * supports the Authorization Code flow with PKCE for public clients, which is
 * built for an application with no backend and no secret to keep, and is what
 * their own client-side example uses.
 *
 * So: one button. The personal token stays underneath, because a scripted or
 * air-gapped setup still wants one, but it is no longer the front door.
 */
function LichessAccess() {
  const prefs = usePreferences();
  const configured = prefs.lichessToken.length > 0;
  const [testing, setTesting] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    setTestError(null);
    try {
      window.location.href = await beginLichessLogin(window.location.origin);
    } catch (error) {
      setConnecting(false);
      setTestError(
        error instanceof Error ? error.message : 'The sign-in could not be started here.',
      );
    }
  };

  const disconnect = async () => {
    const token = prefs.lichessToken;
    prefs.set('lichessToken', '');
    prefs.set('rememberLichessToken', false);
    prefs.set('lichessUsername', '');
    setLichessToken('');
    setAccount(null);
    setTestError(null);
    // Forgotten locally first, then revoked: a revoke that cannot reach
    // Lichess must not leave the token still working in this browser.
    if (token) await revokeToken(token);
  };

  const test = async () => {
    setTesting(true);
    setTestError(null);
    setAccount(null);
    setLichessToken(prefs.lichessToken);
    try {
      const result = await testLichessAccount();
      setAccount(result.username);
      /*
        Record who the token belongs to, so the row above says "Connected as
        …" rather than just "Connected". A token pasted through the advanced
        path has no sign-in to learn the name from, and a settings page that
        can only say a credential exists is a settings page that cannot tell
        you whose it is.
      */
      prefs.set('lichessUsername', result.username);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'The connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h3 className="text-xs text-primary">Lichess account</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        Connecting unlocks the Masters and Lichess explorer databases and the player explorer.
        Kingfisher asks for <strong>no scopes at all</strong> — everything it does works with a
        token that only identifies the account. Nothing is uploaded, and the built-in reference
        works without any of this.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {configured ? (
          <>
            <span className="flex items-center gap-1.5 text-xs text-positive">
              <Check className="h-3.5 w-3.5" />
              Connected{prefs.lichessUsername ? ` as ${prefs.lichessUsername}` : ''}
            </span>
            <Button onClick={() => void test()} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button variant="danger" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="accent" onClick={() => void connect()} disabled={connecting}>
            {connecting ? 'Opening Lichess…' : 'Connect Lichess'}
          </Button>
        )}
        {account && !prefs.lichessUsername ? (
          <span className="text-xs text-positive">Connected as {account}</span>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
        You approve the connection on lichess.org and come back here. There is no Kingfisher account
        and no server in between: the token is issued to this browser, kept in this browser, and
        excluded from workspace backups. Disconnecting revokes it with Lichess.
      </p>

      <button
        type="button"
        onClick={() => setAdvanced((open) => !open)}
        aria-expanded={advanced}
        className="mt-3 text-[10px] text-tertiary underline-offset-2 hover:text-secondary hover:underline"
      >
        {advanced ? 'Hide' : 'Advanced:'} use a personal access token instead
      </button>
      {advanced ? (
        <div className="mt-2 rounded-[4px] border border-line bg-surface-2 p-2.5">
          <p className="text-[10px] leading-relaxed text-tertiary">
            For a scripted setup, or a browser that cannot complete a redirect. No scopes are
            required.
          </p>
          <div className="mt-2 flex gap-1.5">
            <input
              type="password"
              aria-label="Lichess personal access token"
              value={prefs.lichessToken}
              onChange={(event) => prefs.set('lichessToken', event.target.value.trim())}
              placeholder="lip_…"
              className="h-8 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2.5 font-mono text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
            />
            <a
              href={LICHESS_TOKEN_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-8 items-center rounded-[4px] border border-line px-2.5 text-2xs text-secondary hover:border-line-strong"
            >
              Create one
            </a>
          </div>
          <label className="mt-2 flex items-center gap-2 text-2xs text-secondary">
            <input
              type="checkbox"
              checked={prefs.rememberLichessToken}
              onChange={(event) => prefs.set('rememberLichessToken', event.target.checked)}
              className="accent-[var(--accent)]"
            />
            Remember this token on this device
          </label>
        </div>
      ) : null}
      {testError ? <p className="mt-2 text-xs text-negative">{testError}</p> : null}
      <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
        Capabilities after connection: Masters, aggregated Lichess games, player explorer, recent
        games, and master-game PGN retrieval. Explorer endpoints use OAuth bearer authentication.
      </p>
    </div>
  );
}

function BackupControls() {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const inputRef = useRef<HTMLInputElement>(null);
  const [includeGames, setIncludeGames] = useState(false);
  const [pending, setPending] = useState<WorkspaceBackup | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /*
    What the restored backup said was installed but this profile has not got.
    Kept in state after the restore rather than acted on, because reinstalling
    is a several-hundred-megabyte download and a restore is not consent to
    start one.
  */
  const [missingSources, setMissingSources] = useState<readonly BackedUpReferenceSource[]>([]);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const preferences = portablePreferences(usePreferences.getState());
      const backup = await createWorkspaceBackup((await getRepositories()).raw, preferences, {
        includeGames,
        // Names and sizes only. The packs themselves are hundreds of megabytes
        // and can be fetched again; what cannot be recovered is knowing which
        // ones the workspace was reading from.
        referenceSources: installedReferenceSources(),
      });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kingfisher-${new Date(backup.createdAt).toISOString().slice(0, 10)}.chess-study-backup.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify({
        tone: 'success',
        message: includeGames ? 'Complete backup exported.' : 'Portable workspace backup exported.',
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Backup export failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text()) as unknown;
      setPending(parseWorkspaceBackup(value));
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That backup file is invalid.',
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const restore = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await restoreWorkspaceBackup((await getRepositories()).raw, pending, mode);
      applyPortablePreferences(result.preferences);
      await queryClient.invalidateQueries();
      const here = new Set(installedReferenceSources().map((source) => source.id));
      setMissingSources(result.referenceSources.filter((source) => !here.has(source.id)));
      setPending(null);
      setReplaceOpen(false);
      notify({
        tone: 'success',
        message: `${result.records} records restored by ${mode}.`,
        detail: result.includesGames
          ? 'The imported game collection was included.'
          : 'Existing imported games were left untouched.',
      });
    } catch (error) {
      // The restore transaction is all-or-nothing, so a failure here means
      // nothing was written. Say so, rather than leaving the user guessing
      // whether half a workspace landed.
      setReplaceOpen(false);
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The backup could not be restored.',
        detail: 'No data was changed.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-xs text-primary">Backup and restore</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        Versioned JSON includes studies, repertoires, training history, model links, aliases, drafts
        and preferences. Imported games are optional and excluded by default.
      </p>
      <label className="mt-3 flex items-center gap-2 text-2xs text-secondary">
        <input
          type="checkbox"
          checked={includeGames}
          onChange={(event) => setIncludeGames(event.target.checked)}
        />
        Include imported games and position indexes
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="accent" onClick={() => void exportBackup()} disabled={busy}>
          Export backup
        </Button>
        <Button variant="subtle" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose backup to restore…
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </div>
      {pending ? (
        <div className="mt-3 rounded-[4px] border border-line bg-surface-inset p-3">
          <p className="text-2xs text-secondary">
            Backup from {new Date(pending.createdAt).toLocaleString()} ·{' '}
            {pending.includesGames ? 'includes games' : 'authored work only'}
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
            Merge writes matching IDs over their current records. Replace clears only the stores
            present in this backup; a portable backup never clears imported games.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="accent" onClick={() => void restore('merge')} disabled={busy}>
              Merge
            </Button>
            <Button variant="danger" onClick={() => setReplaceOpen(true)} disabled={busy}>
              Replace…
            </Button>
            <Button className="ml-auto" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {missingSources.length > 0 ? (
        <div className="mt-3 rounded-[4px] border border-line bg-surface-inset p-3">
          <p className="text-2xs text-secondary">
            These reference sources were installed when the backup was made, and are not on this
            machine:
          </p>
          <ul className="mt-1.5 space-y-1">
            {missingSources.map((source) => (
              <li key={source.id} className="flex items-baseline gap-2 text-2xs">
                <span className="text-primary">{source.name}</span>
                <span className="text-tertiary">
                  {source.version ? `${source.version} · ` : ''}
                  {formatBytes(source.bytes)}
                </span>
                <Button
                  className="ml-auto"
                  disabled={busy || catalogPack(source.id) === undefined}
                  onClick={() => {
                    void startInstall(source.id);
                    setMissingSources((rest) => rest.filter((entry) => entry.id !== source.id));
                  }}
                >
                  {catalogPack(source.id) ? 'Reinstall' : 'Not in the catalog'}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-tertiary">
            Their contents are not in the backup — they are large, and they can be downloaded again.
            Which sources were switched on, and in what order, was restored with your preferences.
          </p>
          <Button className="mt-2" onClick={() => setMissingSources([])}>
            Dismiss
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={replaceOpen}
        title="Replace local workspace data?"
        description="Every authored-data store included in this backup will be cleared and restored in one transaction. If validation or a write fails, the current data remains intact."
        confirmLabel="Replace and restore"
        onCancel={() => setReplaceOpen(false)}
        onConfirm={() => restore('replace')}
      />
    </div>
  );
}

const SECRET_PREFERENCE_KEYS = new Set<keyof Preferences>([
  'companionToken',
  'lichessToken',
  'assistantApiKey',
]);

function portablePreferences(state: Preferences): Record<string, unknown> {
  return Object.fromEntries(
    (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[])
      .filter((key) => !SECRET_PREFERENCE_KEYS.has(key))
      .map((key) => [key, state[key]]),
  );
}

function DiagnosticsSection() {
  const companion = useCompanionStatus();
  const primary = useEngine((state) => state.primary);
  const assistantBaseUrl = usePreferences((state) => state.assistantBaseUrl);
  const assistantModel = usePreferences((state) => state.assistantModel);
  const providers = useDatabaseProviders();

  return (
    <div className="space-y-5">
      <SettingsTransfer />
      <DiagnosticGroup title="Data providers">
        {providers.map((provider) => (
          <ProviderDiagnostic key={provider.id} provider={provider} />
        ))}
      </DiagnosticGroup>

      <DiagnosticGroup title="Engines">
        {engineDefinitions().map((engine) => (
          <div
            key={engine.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line-subtle py-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate text-xs text-primary">{engine.name}</p>
              <p className="truncate text-[10px] text-tertiary">
                {engine.transport} · {engine.family} · {engine.license}
              </p>
            </div>
            <span
              className={cn(
                'self-center text-[10px] uppercase tracking-wide',
                primary.engineId === engine.id && primary.status !== 'idle'
                  ? primary.status === 'error' || primary.status === 'unavailable'
                    ? 'text-negative'
                    : 'text-positive'
                  : 'text-tertiary',
              )}
            >
              {primary.engineId === engine.id
                ? primary.status
                : engine.transport === 'worker'
                  ? 'available'
                  : 'companion'}
            </span>
          </div>
        ))}
      </DiagnosticGroup>

      <DiagnosticGroup title="Services">
        <DiagnosticLine
          name="Local companion"
          status={companion.isError ? 'Offline' : companion.data ? 'Online' : 'Not paired'}
          detail={
            companion.isError
              ? companion.error.message
              : companion.data
                ? `${companion.data.engines.length} engines · ${companion.data.databases.length} databases`
                : 'Pair in the Companion section.'
          }
          ok={Boolean(companion.data)}
        />
        <DiagnosticLine
          name="Grounded assistant"
          status={assistantBaseUrl && assistantModel ? 'Configured' : 'Not configured'}
          detail={
            assistantBaseUrl && assistantModel
              ? `${assistantModel} · ${safeHost(assistantBaseUrl)}`
              : 'Configure a model and API base URL in Assistant.'
          }
          ok={Boolean(assistantBaseUrl && assistantModel)}
        />
      </DiagnosticGroup>

      <IntegritySection />
      <RecoveryActions />
      <CopyReport />
    </div>
  );
}

/**
 * The integrity scan.
 *
 * Scanned on request rather than on open: it reads every record, and a
 * diagnostics tab that stalls for a second on a large collection is a tab
 * people stop opening.
 */
function IntegritySection() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [busy, setBusy] = useState<'scan' | 'repair' | null>(null);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();

  const scan = async () => {
    setBusy('scan');
    try {
      const repositories = await getRepositories();
      setReport(await scanIntegrity(repositories.raw));
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The integrity scan could not run.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const repair = async () => {
    if (!report) return;
    setBusy('repair');
    try {
      const repositories = await getRepositories();
      const result = await repairIntegrity(repositories.raw, report.issues);
      const rescanned = await scanIntegrity(repositories.raw);
      setReport(rescanned);
      // Anything the repair touched is now stale in the query cache.
      await client.invalidateQueries();
      notify({
        tone: 'success',
        message:
          `Removed ${result.removed} unreachable record${result.removed === 1 ? '' : 's'}` +
          `${result.renumbered ? `, renumbered ${result.renumbered} chapter(s)` : ''}.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The repair did not complete. Nothing was changed.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const repairable = report ? repairableIssues(report) : [];

  return (
    <DiagnosticGroup title="Data integrity">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <Button size="sm" onClick={() => void scan()} disabled={busy !== null}>
          {busy === 'scan' ? 'Scanning…' : 'Run integrity scan'}
        </Button>
        {repairable.length > 0 && (
          <Button size="sm" variant="accent" onClick={() => void repair()} disabled={busy !== null}>
            {busy === 'repair' ? 'Repairing…' : `Repair ${repairable.length} safe issue(s)`}
          </Button>
        )}
        {report && (
          <span className="text-[10px] text-tertiary tabular">
            {Object.values(report.counts)
              .reduce((sum, value) => sum + value, 0)
              .toLocaleString()}{' '}
            records · {report.durationMs} ms
          </span>
        )}
      </div>
      {report && report.issues.length === 0 && (
        <p className="pb-2 text-[10px] text-positive">Healthy. Every stored reference resolves.</p>
      )}
      {report?.issues.map((issue) => (
        <div key={`${issue.store}-${issue.title}`} className="border-t border-line-subtle py-2">
          <p className="text-xs text-primary">{issue.title}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-tertiary">{issue.detail}</p>
          <p className="mt-1 text-[10px] text-tertiary">
            <span className="uppercase tracking-wide text-caution">{issue.category}</span>
            {issue.repair ? ` · ${issue.repair}` : ''}
            {issue.repairable ? '' : ' · not repaired automatically'}
          </p>
        </div>
      ))}
    </DiagnosticGroup>
  );
}

/**
 * Targeted recovery, rather than one button that clears everything.
 *
 * Each of these fixes a specific stuck subsystem and loses nothing else, so a
 * user troubleshooting a dead engine never has to reach for something that
 * would also take their layout or their pairing with it.
 */
function RecoveryActions() {
  const shutdown = useEngine((state) => state.shutdown);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const companionStatus = useCompanionStatus();

  return (
    <DiagnosticGroup title="Recovery">
      <div className="flex flex-wrap gap-2 py-2">
        <Button
          size="sm"
          onClick={() => {
            shutdown();
            notify({
              tone: 'info',
              message: 'Engines stopped. They restart on the next analysis.',
            });
          }}
        >
          Restart engines
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void companionStatus.refetch();
            notify({ tone: 'info', message: 'Reconnecting to the companion…' });
          }}
        >
          Reconnect companion
        </Button>
        <Button
          size="sm"
          onClick={() => {
            // Provider results only. Nothing stored is touched.
            void client.invalidateQueries({ queryKey: ['explorer'] });
            void client.invalidateQueries({ queryKey: ['provider-health'] });
            void client.invalidateQueries({ queryKey: ['tablebase'] });
            notify({ tone: 'info', message: 'Cached provider results cleared.' });
          }}
        >
          Clear provider cache
        </Button>
        <Button
          size="sm"
          onClick={() => {
            useWorkspaceLayout.getState().resetAllLayouts();
            useWorkspaceLayout.setState({ sidebarCollapsed: false });
            notify({
              tone: 'info',
              message: 'Every workspace layout reset. Board and data are untouched.',
            });
          }}
        >
          Reset all layouts
        </Button>
      </div>
    </DiagnosticGroup>
  );
}

function CopyReport() {
  const [copied, setCopied] = useState(false);
  const notify = useUi((state) => state.notify);
  const providers = useDatabaseProviders();
  const companion = useCompanionStatus();
  const primary = useEngine((state) => state.primary);
  const client = useQueryClient();

  const copy = async () => {
    try {
      const preferences = usePreferences.getState();
      const repositories = await getRepositories();
      const integrity = await scanIntegrity(repositories.raw);
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);

      const report = buildDiagnosticReport(
        {
          appVersion: APP_VERSION,
          userAgent: navigator.userAgent,
          language: navigator.language,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          crossOriginIsolated: window.crossOriginIsolated,
          storage: {
            indexedDb: typeof indexedDB === 'undefined' ? 'unavailable' : 'available',
            ...(estimate?.usage !== undefined ? { usageBytes: estimate.usage } : {}),
            ...(estimate?.quota !== undefined ? { quotaBytes: estimate.quota } : {}),
            ...((await navigator.storage?.persisted?.().catch(() => undefined)) !== undefined
              ? { persisted: await navigator.storage.persisted() }
              : {}),
          },
          providers: providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            health: client.getQueryData<ProviderHealth>(['provider-health', provider.id]) ?? null,
          })),
          engines: engineDefinitions().map((engine) => ({
            id: engine.id,
            name: engine.name,
            transport: engine.transport,
            status: primary.engineId === engine.id ? primary.status : 'not started',
          })),
          companion: companion.data
            ? {
                state: 'online',
                engines: companion.data.engines.length,
                databases: companion.data.databases.length,
              }
            : companion.isError
              ? { state: 'offline', error: companion.error.message }
              : { state: 'not-paired' },
          secrets: {
            lichessToken: preferences.lichessToken.length > 0,
            companionToken: preferences.companionToken.length > 0,
            assistantApiKey: preferences.assistantApiKey.length > 0,
          },
          assistant: {
            configured: Boolean(preferences.assistantBaseUrl && preferences.assistantModel),
            ...(preferences.assistantModel ? { model: preferences.assistantModel } : {}),
          },
          integrity,
          failures: lastFailures,
          counts: integrity.counts,
        },
        // Passed so a secret that leaked into an error message is caught even
        // though no field above ever reads one.
        [preferences.lichessToken, preferences.companionToken, preferences.assistantApiKey].filter(
          (value) => value.length > 0,
        ),
      );

      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The report could not be copied.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <DiagnosticGroup title="Support">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <Button size="sm" variant="accent" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy diagnostic report'}
        </Button>
        <span className="text-[10px] leading-relaxed text-tertiary">
          Plain text for a bug report. Contains no games, notes, tokens or keys.
        </span>
      </div>
    </DiagnosticGroup>
  );
}

function ProviderDiagnostic({ provider }: { provider: ChessDatabaseProvider }) {
  const health = useQuery({
    queryKey: ['provider-health', provider.id],
    queryFn: ({ signal }) =>
      provider.health
        ? provider.health(signal)
        : Promise.resolve({
            state: 'unsupported' as const,
            checkedAt: 0,
            message: 'No connection test exposed.',
          }),
    staleTime: 30_000,
    retry: false,
  });
  const result = health.data;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line-subtle py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-xs text-primary">{provider.name}</p>
        <p className="text-[10px] leading-relaxed text-tertiary">
          {result?.message ?? 'Not tested yet.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {result?.latencyMs != null ? (
          <span className="text-[10px] text-tertiary tabular">{result.latencyMs} ms</span>
        ) : null}
        <Button size="sm" onClick={() => void health.refetch()} disabled={health.isFetching}>
          {health.isFetching ? 'Testing…' : 'Test'}
        </Button>
      </div>
    </div>
  );
}

function DiagnosticGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
        {title}
      </h3>
      <div className="mt-1 border-y border-line-subtle">{children}</div>
    </section>
  );
}

function DiagnosticLine({
  name,
  status,
  detail,
  ok,
}: {
  name: string;
  status: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line-subtle py-2 last:border-0">
      <div>
        <p className="text-xs text-primary">{name}</p>
        <p className="mt-0.5 text-[10px] text-tertiary">{detail}</p>
      </div>
      <span
        className={cn(
          'self-center text-[10px] uppercase tracking-wide',
          ok ? 'text-positive' : 'text-caution',
        )}
      >
        {status}
      </span>
    </div>
  );
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return 'custom endpoint';
  }
}

function applyPortablePreferences(value: Readonly<Record<string, unknown>>): void {
  const current = usePreferences.getState();
  const next: Partial<Preferences> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    // Backups from an older Kingfisher version may still contain credentials.
    // Treat them as untrusted input and never restore secrets into this device.
    if (SECRET_PREFERENCE_KEYS.has(key)) continue;
    const candidate = value[key];
    const fallback = DEFAULT_PREFERENCES[key];
    if (candidate === undefined) continue;
    // Primitive settings must retain their primitive kind. Structured engine
    // limits are accepted only when they name a supported limit kind.
    if (typeof fallback === typeof candidate && typeof candidate !== 'object') {
      (next as Record<string, unknown>)[key] = candidate;
    } else if (
      key === 'engineLimit' &&
      candidate &&
      typeof candidate === 'object' &&
      ['infinite', 'depth', 'nodes', 'movetime'].includes(
        String((candidate as { kind?: unknown }).kind),
      )
    ) {
      (next as Record<string, unknown>)[key] = candidate;
    }
  }
  usePreferences.setState({ ...current, ...next });
}

const Row = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col items-start justify-between gap-2 py-1 sm:flex-row sm:items-center sm:gap-6">
    <div className="min-w-0">
      <p className="text-xs text-primary">{label}</p>
      {hint && <p className="mt-0.5 text-2xs leading-relaxed text-tertiary">{hint}</p>}
    </div>
    <div className="max-w-full shrink-0">{children}</div>
  </div>
);

/**
 * Search across every preference.
 *
 * Ten phases of configuration means nobody can remember which of eleven
 * sections holds "threads" or "piece set". A result names the setting, explains
 * it in a sentence, and jumps to the section holding it — the explanation
 * matters as much as the jump, because "Hash (MB)" tells a user nothing about
 * whether they want to change it.
 */
function SettingsSearch({ onJump }: { readonly onJump: (section: Section) => void }) {
  const [query, setQuery] = useState('');
  const results = searchSettings(query);

  return (
    <div className="-mt-2 mb-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search settings — try “threads”, “piece set”, “shortcut”"
        aria-label="Search settings"
        className="h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary focus:border-accent/60"
      />
      {query.trim() !== '' ? (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-[4px] border border-line-subtle">
          {results.length === 0 ? (
            <p className="p-3 text-xs text-tertiary">No setting matches “{query.trim()}”.</p>
          ) : (
            results.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  onJump(entry.section);
                  setQuery('');
                }}
                className="flex w-full flex-col items-start gap-0.5 border-b border-line-subtle px-3 py-2 text-left last:border-0 hover:bg-surface-2"
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-xs text-primary">{entry.label}</span>
                  <span className="shrink-0 text-2xs uppercase tracking-wide text-tertiary">
                    {entry.section}
                  </span>
                </span>
                <span className="text-2xs leading-relaxed text-tertiary">{entry.description}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Layouts, pinned tools and the reset that recovers from a bad arrangement. */
function WorkspaceSection() {
  const prefs = usePreferences();
  const compact = useWorkspaceLayout((state) => state.compact);
  const setCompact = useWorkspaceLayout((state) => state.setCompact);
  const savedLayouts = useWorkspaceLayout((state) => state.savedLayouts);
  const deleteLayout = useWorkspaceLayout((state) => state.deleteLayout);
  const resetAllLayouts = useWorkspaceLayout((state) => state.resetAllLayouts);
  const notify = useUi((state) => state.notify);

  return (
    <div className="flex flex-col gap-4">
      {/*
        A policy rather than a pixel size, because the same number of pixels is
        a huge board on a desktop display and an impossible one on a laptop.
        This sizes the chrome; the board takes what is left.
      */}
      <Row
        label="Board priority"
        hint="How much of a workspace the board gets. Balanced keeps a taller notation panel and a wider dock; Maximum folds the notation into the dock and lets the board fill the column. A panel you have dragged to a size yourself keeps that size; everything else follows this setting. On a short screen the board may already be limited by window height, in which case the larger policies change the panels around it rather than the board itself."
      >
        <Segmented
          items={[
            { id: 'balanced' as const, label: 'Balanced' },
            { id: 'large' as const, label: 'Large' },
            { id: 'maximum' as const, label: 'Maximum' },
          ]}
          value={prefs.boardPriority}
          onChange={(value) => prefs.set('boardPriority', value)}
        />
      </Row>

      <Row
        label="Compact density"
        hint="Less padding around panels, so more of the window is board and evidence. Text size and hit targets are unchanged."
      >
        <Toggle label="Compact density" checked={compact} onChange={setCompact} />
      </Row>

      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
          Saved layouts
        </h3>
        <p className="mt-1 text-2xs leading-relaxed text-tertiary">
          Panel placement and sizes only. A layout never carries which study or position was open,
          so applying one cannot drag last month&rsquo;s document onto your screen with it.
        </p>
        <div className="mt-2 border-y border-line-subtle">
          {savedLayouts.length === 0 ? (
            <p className="py-2 text-xs text-tertiary">
              None yet. Save one from any workspace&rsquo;s Layout menu.
            </p>
          ) : (
            savedLayouts.map((layout) => (
              <div
                key={layout.id}
                className="flex items-center justify-between gap-3 border-b border-line-subtle py-2 last:border-0"
              >
                <p className="text-xs text-primary">{layout.name}</p>
                <Button size="sm" onClick={() => deleteLayout(layout.id)}>
                  Delete
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <Row
        label="Reset every workspace layout"
        hint="Puts every panel back where it started, on every workspace and every screen size. Board, documents and data are untouched."
      >
        <Button
          size="sm"
          onClick={() => {
            resetAllLayouts();
            notify({ tone: 'info', message: 'Every workspace layout reset.' });
          }}
        >
          Reset all layouts
        </Button>
      </Row>
    </div>
  );
}

/** Shortcuts live in their own dialog, which is also the reference. */
function KeyboardSection() {
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen);
  const overrides = useShortcuts((state) => state.overrides);
  const resetAll = useShortcuts((state) => state.resetAll);
  const changed = Object.keys(overrides).length;

  return (
    <div className="flex flex-col gap-4">
      <Row
        label="Keyboard shortcuts"
        hint="Every command, its binding, and any conflict. The reference and the editor are the same screen, so they cannot drift apart."
      >
        <Button size="sm" onClick={() => setShortcutsOpen(true)}>
          Open shortcuts
        </Button>
      </Row>
      <Row
        label="Customised bindings"
        hint={
          changed === 0
            ? 'Every command is on its default binding.'
            : `${changed} command${changed === 1 ? '' : 's'} rebound.`
        }
      >
        <Button size="sm" disabled={changed === 0} onClick={resetAll}>
          Reset all shortcuts
        </Button>
      </Row>
    </div>
  );
}

/**
 * Export and import configuration.
 *
 * Separate from the workspace backup because they answer different questions:
 * a backup is "keep my chess data safe", this is "make my other machine feel
 * like this one". It carries no credentials, which is stated on screen because
 * a promise the user cannot see is a promise they cannot rely on.
 */
function SettingsTransfer() {
  const notify = useUi((state) => state.notify);
  const fileInput = useRef<HTMLInputElement>(null);

  const download = () => {
    const file = exportSettings({
      preferences: usePreferences.getState(),
      layout: {
        arrangements: useWorkspaceLayout.getState().arrangements,
        savedLayouts: useWorkspaceLayout.getState().savedLayouts,
        pinnedTools: useWorkspaceLayout.getState().pinnedTools,
      },
      shortcuts: useShortcuts.getState().overrides,
    });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kingfisher-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify({ tone: 'info', message: 'Settings exported. No tokens or keys are included.' });
  };

  const upload = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify({ tone: 'error', message: 'That file is not valid JSON.' });
      return;
    }
    const result = parseSettingsExport(parsed);
    if (!result.ok) {
      notify({ tone: 'error', message: result.error });
      return;
    }
    applyPortablePreferences(result.value.preferences as Record<string, unknown>);
    useShortcuts.getState().replaceAll(result.value.shortcuts);
    const layout = result.value.layout as {
      arrangements?: unknown;
      savedLayouts?: unknown;
      pinnedTools?: unknown;
    } | null;
    /*
      §64: a malformed layout must not reject the rest. Each part is checked
      on its own, so an export with a damaged arrangement still restores the
      appearance and the shortcuts it got right.
    */
    if (layout && typeof layout === 'object') {
      const patch: Record<string, unknown> = {};
      if (layout.arrangements && typeof layout.arrangements === 'object') {
        patch.arrangements = layout.arrangements;
      }
      if (Array.isArray(layout.savedLayouts)) patch.savedLayouts = layout.savedLayouts;
      if (layout.pinnedTools && typeof layout.pinnedTools === 'object') {
        patch.pinnedTools = layout.pinnedTools;
      }
      useWorkspaceLayout.setState(patch as never);
    }
    notify({ tone: 'info', message: 'Settings imported.' });
  };

  return (
    <DiagnosticGroup title="Settings transfer">
      <div className="flex flex-col gap-2 py-2">
        <p className="text-2xs leading-relaxed text-tertiary">
          Appearance, board, workspace layouts, pinned tools and keyboard bindings — without any
          chess data, and without your Lichess token, companion token, assistant key or the
          addresses of services on your own network.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={download}>
            Export settings
          </Button>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            Import settings
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import settings file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
        </div>
      </div>
    </DiagnosticGroup>
  );
}

/**
 * Whether the things you configured actually work, where you configured them.
 *
 * §20's complaint: a setting that exists but gives no sign of whether it took
 * effect teaches the user to distrust the whole screen. Before this, the only
 * way to find out whether Lichess was connected or the companion was reachable
 * was to open Diagnostics — a different section, for a question you were
 * asking about the section you were already in.
 *
 * Diagnostics remains the detailed view. This is the one-line answer.
 */
function ConfigurationHealth({ area }: { readonly area: 'companion' | 'database' | 'engine' }) {
  const companion = useCompanionStatus();
  const companionUrl = usePreferences((state) => state.companionUrl);
  const lichessToken = usePreferences((state) => state.lichessToken);
  const primary = useEngine((state) => state.primary);

  if (area === 'companion') {
    if (companionUrl.trim() === '') {
      return <HealthLine ok={false} status="Not connected" detail="No companion is paired." />;
    }
    if (companion.isPending) {
      return <HealthLine ok detail="Checking…" status="Connecting" />;
    }
    if (companion.isError || !companion.data) {
      return (
        <HealthLine
          ok={false}
          status="Unreachable"
          detail="Paired, but the service did not answer. Is it still running?"
        />
      );
    }
    const engines = companion.data.engines?.length ?? 0;
    const databases = companion.data.databases?.length ?? 0;
    return (
      <HealthLine
        ok
        status="Connected"
        detail={`${engines} engine${engines === 1 ? '' : 's'} · ${databases} database${
          databases === 1 ? '' : 's'
        }`}
      />
    );
  }

  if (area === 'database') {
    return lichessToken.trim() === '' ? (
      <HealthLine
        ok={false}
        status="No token"
        detail="Lichess requires a personal token for opening explorer requests."
      />
    ) : (
      <HealthLine ok status="Token stored" detail="Use Test below to confirm it still works." />
    );
  }

  return (
    <HealthLine
      ok={primary.status !== 'error' && primary.status !== 'unavailable'}
      status={primary.status === 'idle' ? 'Ready' : primary.status}
      detail={`Primary engine: ${primary.engineId ?? 'none selected'}`}
    />
  );
}

function HealthLine({
  ok,
  status,
  detail,
}: {
  readonly ok: boolean;
  readonly status: string;
  readonly detail: string;
}) {
  return (
    <div
      role="status"
      className="mb-3 flex items-center justify-between gap-3 rounded-[4px] border border-line-subtle bg-surface-2 px-2.5 py-1.5"
    >
      <p className="min-w-0 text-2xs leading-relaxed text-tertiary">{detail}</p>
      <span
        className={cn(
          'shrink-0 text-[10px] uppercase tracking-wide',
          ok ? 'text-positive' : 'text-caution',
        )}
      >
        {status}
      </span>
    </div>
  );
}
