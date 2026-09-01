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
import { useQueryClient } from '@tanstack/react-query';

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
import { cn } from '@/lib/cn';
import type { PieceType } from '@/chess/types';
import { DEFAULT_PREFERENCES, usePreferences, type Preferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

type Section = 'appearance' | 'board' | 'pieces' | 'engine' | 'database' | 'profile';

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'board', label: 'Board' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'engine', label: 'Engine' },
  { id: 'database', label: 'Database' },
  { id: 'profile', label: 'Profile' },
];

/** A position with one of each piece, so a preview shows the whole alphabet. */
const PREVIEW_FEN = 'r1bqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1';

export function SettingsDialog() {
  const open = useUi((state) => state.settingsOpen);
  const setOpen = useUi((state) => state.setSettingsOpen);
  const [section, setSection] = useState<Section>('appearance');

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Settings"
      description="Stored on this machine. Nothing here needs an account."
      width="w-[640px]"
    >
      <div className="-mx-4 -mt-3 mb-3 border-b border-line-subtle px-2">
        <Tabs items={SECTIONS} value={section} onChange={setSection} />
      </div>
      {section === 'appearance' && <AppearanceSection />}
      {section === 'board' && <BoardSection />}
      {section === 'pieces' && <PiecesSection />}
      {section === 'engine' && <EngineSection />}
      {section === 'database' && <DatabaseSection />}
      {section === 'profile' && <ProfileSection />}
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
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EngineSection() {
  const prefs = usePreferences();
  const capabilities = useEngine((state) => state.capabilities);
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

      <Row label="Lines (MultiPV)" hint="Only used when the preset is Custom.">
        <Segmented
          items={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))}
          value={String(prefs.engineMultiPv)}
          onChange={(value) => prefs.set('engineMultiPv', Number(value))}
        />
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
        <BackupControls />
      </div>
    </div>
  );
}

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

function portablePreferences(state: Preferences): Record<string, unknown> {
  return Object.fromEntries(
    (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).map((key) => [key, state[key]]),
  );
}

function applyPortablePreferences(value: Readonly<Record<string, unknown>>): void {
  const current = usePreferences.getState();
  const next: Partial<Preferences> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
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
