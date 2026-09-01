'use client';

import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Tabs';
import { BOARD_THEMES } from '@/features/board/themes';
import { PIECE_SETS } from '@/features/board/pieces';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

export function SettingsDialog() {
  const open = useUi((state) => state.settingsOpen);
  const setOpen = useUi((state) => state.setSettingsOpen);
  const prefs = usePreferences();

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Settings"
      description="Stored on this machine. Nothing here needs an account."
      width="w-[520px]"
    >
      <div className="flex flex-col gap-4">
        <Row label="Appearance">
          <Segmented
            items={[
              { id: 'dark', label: 'Dark' },
              { id: 'light', label: 'Light' },
            ]}
            value={prefs.theme}
            onChange={(value) => prefs.set('theme', value)}
          />
        </Row>

        <Row label="Board">
          <div className="flex flex-wrap gap-1.5">
            {BOARD_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                title={theme.name}
                aria-pressed={prefs.boardTheme === theme.id}
                onClick={() => prefs.set('boardTheme', theme.id)}
                className="flex items-center gap-1.5 rounded-[4px] border px-1.5 py-1 text-2xs transition-colors"
                style={{
                  borderColor:
                    prefs.boardTheme === theme.id ? 'var(--accent)' : 'var(--border-subtle)',
                  color:
                    prefs.boardTheme === theme.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                <span className="flex h-4 w-4 overflow-hidden rounded-[2px]">
                  <span className="h-full w-1/2" style={{ background: theme.light }} />
                  <span className="h-full w-1/2" style={{ background: theme.dark }} />
                </span>
                {theme.name}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Pieces">
          <Segmented
            items={PIECE_SETS.map((set) => ({ id: set.id, label: set.name }))}
            value={prefs.pieceSet}
            onChange={(value) => prefs.set('pieceSet', value)}
          />
        </Row>

        <Row label="Coordinates">
          <Toggle
            label="Show coordinates"
            checked={prefs.showCoordinates}
            onChange={(value) => prefs.set('showCoordinates', value)}
          />
        </Row>

        <Row label="Animate moves">
          <Toggle
            label="Animate moves"
            checked={prefs.animateMoves}
            onChange={(value) => prefs.set('animateMoves', value)}
          />
        </Row>

        <Row label="Evaluation bar">
          <Toggle
            label="Show evaluation bar"
            checked={prefs.showEvaluationBar}
            onChange={(value) => prefs.set('showEvaluationBar', value)}
          />
        </Row>

        <Row label="Analyse automatically" hint="Restart the engine whenever the position changes.">
          <Toggle
            label="Analyse automatically"
            checked={prefs.autoAnalyse}
            onChange={(value) => prefs.set('autoAnalyse', value)}
          />
        </Row>

        <div className="border-t border-line-subtle pt-4">
          <h3 className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
            Engine
          </h3>

          <Row label="Lines (MultiPV)">
            <Segmented
              items={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))}
              value={String(prefs.engineMultiPv)}
              onChange={(value) => prefs.set('engineMultiPv', Number(value))}
            />
          </Row>

          <Row label="Hash" hint="Transposition table size in megabytes.">
            <Segmented
              items={[16, 64, 128, 256].map((n) => ({ id: String(n), label: `${n} MB` }))}
              value={String(prefs.engineHashMb)}
              onChange={(value) => prefs.set('engineHashMb', Number(value))}
            />
          </Row>

          <Row label="Search limit">
            <Segmented
              items={[
                { id: 'infinite', label: 'Infinite' },
                { id: 'depth-24', label: 'Depth 24' },
                { id: 'depth-32', label: 'Depth 32' },
                { id: 'movetime-5000', label: '5 s' },
              ]}
              value={limitId(prefs.engineLimit)}
              onChange={(value) => prefs.set('engineLimit', limitFromId(value))}
            />
          </Row>
        </div>
      </div>
    </Dialog>
  );
}

const limitId = (limit: ReturnType<typeof usePreferences.getState>['engineLimit']): string => {
  switch (limit.kind) {
    case 'depth':
      return `depth-${limit.depth}`;
    case 'movetime':
      return `movetime-${limit.ms}`;
    case 'nodes':
      return `nodes-${limit.nodes}`;
    default:
      return 'infinite';
  }
};

const limitFromId = (id: string): ReturnType<typeof usePreferences.getState>['engineLimit'] => {
  const [kind, value] = id.split('-');
  if (kind === 'depth') return { kind: 'depth', depth: Number(value) };
  if (kind === 'movetime') return { kind: 'movetime', ms: Number(value) };
  return { kind: 'infinite' };
};

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
    <div>
      <p className="text-xs text-primary">{label}</p>
      {hint && <p className="mt-0.5 text-2xs text-tertiary">{hint}</p>}
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
