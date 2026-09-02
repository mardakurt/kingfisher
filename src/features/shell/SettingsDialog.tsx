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

import { Button } from '@/components/ui/Button';
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
  type WorkspaceBackup,
} from '@/persistence/backup';
import { getRepositories } from '@/persistence/repositories';
import { useProfile, phase3Keys } from '@/features/persistence/queries';
import { parsePairing } from '@/companion/client';
import { importPgnIntoSqlite } from '@/companion/import';
import { companionClient } from '@/companion/session';
import {
  LICHESS_TOKEN_URL,
  setLichessToken,
  testLichessAccount,
} from '@/database/providers/lichess-auth';
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
import type { ChessDatabaseProvider, ProviderHealth } from '@/database/types';
import { engineDefinitions } from '@/engine/registry';
import { useCompanionStatus } from '@/companion/useCompanion';
import { cn } from '@/lib/cn';
import type { PieceType } from '@/chess/types';
import { DEFAULT_PREFERENCES, usePreferences, type Preferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

type Section =
  | 'appearance'
  | 'board'
  | 'pieces'
  | 'engine'
  | 'companion'
  | 'database'
  | 'assistant'
  | 'profile'
  | 'diagnostics';

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'board', label: 'Board' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'engine', label: 'Engine' },
  { id: 'companion', label: 'Companion' },
  { id: 'database', label: 'Database' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'profile', label: 'Profile' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

const isSection = (value: string | null): value is Section =>
  value !== null && SECTIONS.some((entry) => entry.id === value);

/** A position with one of each piece, so a preview shows the whole alphabet. */
const PREVIEW_FEN = 'r1bqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1';

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
      <div className="-mx-4 -mt-3 mb-3 overflow-x-auto border-b border-line-subtle px-2">
        <Tabs items={SECTIONS} value={section} onChange={choose} />
      </div>
      {section === 'appearance' && <AppearanceSection />}
      {section === 'board' && <BoardSection />}
      {section === 'pieces' && <PiecesSection />}
      {section === 'engine' && <EngineSection />}
      {section === 'companion' && <CompanionSection />}
      {section === 'assistant' && <AssistantSection />}
      {section === 'database' && <DatabaseSection />}
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
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4">
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

        {/* The real renderer, so the preview cannot drift from the board. */}
        <div className="shrink-0">
          <MiniBoard
            fen={PREVIEW_FEN}
            theme={prefs.boardTheme}
            pieceSet={prefs.pieceSet}
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
      <Row label="Lines (MultiPV)" hint="Changing this puts the preset into Custom.">
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
        hint="Set by the preset, sized to the cores this machine reports."
      >
        <span className="text-2xs text-secondary tabular">
          {prefs.engineHashMb} MB · {prefs.engineThreads} thread
          {prefs.engineThreads === 1 ? '' : 's'}
          {capabilities?.maxThreads ? ` of ${capabilities.maxThreads}` : ''}
        </span>
      </Row>

      <Row label="Analyse automatically" hint="Restart the engine whenever the position changes.">
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
  return (
    <div className="flex flex-col gap-4">
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
      <div>
        <h3 className="text-xs text-primary">Local companion</h3>
        <p className="mt-1 text-2xs leading-relaxed text-tertiary">
          {/*
            It does not serve tablebases and never has: there is no tablebase
            route in the companion, and Syzygy evidence comes from the separate
            Lichess provider. The claim was left over from a plan that changed.
          */}
          Optional. It runs native engines and SQLite collections — the two things a browser cannot.
          Everything else in Kingfisher works without it.
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

      {connected ? <SqliteDatabases /> : null}
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
  const status = useCompanionStatus();
  const notify = useUi((state) => state.notify);
  const [name, setName] = useState('');
  const [pgn, setPgn] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

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

  const load = async () => {
    const client = companionClient();
    if (!client || !selected || !pgn.trim()) return;
    setBusy('import');
    try {
      const result = await importPgnIntoSqlite(client, selected, pgn, (progress) =>
        setBusy(`import:${progress.parsed}/${progress.total}`),
      );
      setPgn('');
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
              <span className="min-w-0 flex-1 truncate text-secondary">{entry.name}</span>
              <span className="text-tertiary tabular">
                {entry.games === null ? '—' : `${entry.games.toLocaleString()} games`}
              </span>
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
 * The user's own Lichess token for the opening explorer.
 *
 * Lichess requires authentication for explorer requests now. Kingfisher ships
 * no credential of its own: one would breach their terms and give every
 * installation a single shared rate limit. The alternative offered here is the
 * honest one — your token, or the local sources, which need no network at all.
 */
function LichessAccess() {
  const prefs = usePreferences();
  const configured = prefs.lichessToken.length > 0;
  const [testing, setTesting] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const test = async () => {
    setTesting(true);
    setTestError(null);
    setAccount(null);
    setLichessToken(prefs.lichessToken);
    try {
      const result = await testLichessAccount();
      setAccount(result.username);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'The connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h3 className="text-xs text-primary">Lichess opening explorer</h3>
      <p className="mt-1 text-2xs leading-relaxed text-tertiary">
        The Masters and Lichess databases need a personal API token. No scopes are required. Without
        one, those two sources say so and the local sources carry on working.
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
      <p className="mt-1 text-[10px] text-tertiary">
        {configured ? 'Configured.' : 'Not configured.'} Sent only to explorer.lichess.org and
        excluded from workspace backups.
      </p>
      <label className="mt-2 flex items-center gap-2 text-2xs text-secondary">
        <input
          type="checkbox"
          checked={prefs.rememberLichessToken}
          onChange={(event) => prefs.set('rememberLichessToken', event.target.checked)}
          className="accent-[var(--accent)]"
        />
        Remember this token on this device
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="accent" onClick={() => void test()} disabled={!configured || testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        {configured ? (
          <Button
            variant="danger"
            onClick={() => {
              prefs.set('lichessToken', '');
              prefs.set('rememberLichessToken', false);
              setLichessToken('');
              setAccount(null);
              setTestError(null);
            }}
          >
            Disconnect
          </Button>
        ) : null}
        {account ? <span className="text-xs text-positive">Connected as {account}</span> : null}
      </div>
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

  const exportBackup = async () => {
    setBusy(true);
    try {
      const preferences = portablePreferences(usePreferences.getState());
      const backup = await createWorkspaceBackup((await getRepositories()).raw, preferences, {
        includeGames,
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
            useWorkspaceLayout.setState({
              sidebarCollapsed: false,
              toolDockCollapsed: false,
              toolDockWidth: 420,
              preset: 'analysis',
            });
            notify({ tone: 'info', message: 'Layout reset. Board and data are untouched.' });
          }}
        >
          Reset layout
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

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="relative h-4 w-7 rounded-full transition-colors"
    style={{ background: checked ? 'var(--accent)' : 'var(--border-strong)' }}
  >
    <span
      className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
      style={{ left: checked ? '14px' : '2px' }}
    />
  </button>
);
