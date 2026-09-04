'use client';

/**
 * What a new installation says for itself.
 *
 * Not a tutorial and not a wizard. A player who has just opened a chess
 * program wants to know one thing — is it ready — and the honest answer on a
 * fresh Kingfisher is yes, because the engine is in the browser and the
 * reference is in the download. So this reports the two facts that make that
 * true, offers the three optional things that make it better, and gets out of
 * the way permanently once dismissed or once there is any work to return to.
 *
 * Every line here is a live check rather than a script. If the bundled
 * reference is still installing, it says so and shows how far it has got; if
 * it failed, it says that instead. A "you're all set!" panel that says the
 * same thing whether or not anything worked is worse than no panel.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Board, Check, Close, Database, Download, Opening, Players } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { DEFAULT_ENGINE_ID, engineDefinition } from '@/engine/registry';
import { cn } from '@/lib/cn';
import { BUNDLED_PACK_ID } from '@/reference/catalog';
import { useReferenceSources } from '@/reference/use-references';
import { useUi } from '@/stores/ui-store';

export function FirstRun({ onDismiss }: { readonly onDismiss: () => void }) {
  const router = useRouter();
  const references = useReferenceSources();
  const openSettingsAt = useUi((state) => state.openSettingsAt);

  const engineName = engineDefinition(DEFAULT_ENGINE_ID)?.name ?? 'Stockfish';
  const starter = references.sources.find((source) => source.id === BUNDLED_PACK_ID);
  const progress = references.progress[BUNDLED_PACK_ID];
  const failure = references.errors[BUNDLED_PACK_ID];

  const referenceState = failure
    ? { ok: false, text: failure }
    : progress
      ? {
          ok: false,
          text: `Preparing — ${Math.round(
            (progress.bytesDone / Math.max(1, progress.bytesTotal)) * 100,
          )}%`,
        }
      : starter?.installed
        ? {
            ok: true,
            text: `${starter.name} — ${(starter.gameCount ?? 0).toLocaleString()} games, on this machine`,
          }
        : { ok: false, text: 'Not ready yet' };

  return (
    <section
      className="rounded-[6px] border border-line bg-surface-2 p-4"
      data-first-run
      aria-label="Getting started"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-primary">Kingfisher is ready.</h2>
          <p className="mt-0.5 text-xs text-tertiary">
            Nothing to download, no account, and no database to find first.
          </p>

          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <Ready ok label="Engine" detail={`${engineName} — in this browser, sandboxed`} />
            <Ready ok={referenceState.ok} label="Opening Explorer" detail={referenceState.text} />
          </dl>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
            Optional
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Optional icon={<Players />} onClick={() => openSettingsAt('accounts')}>
              Connect Lichess or Chess.com
            </Optional>
            <Optional icon={<Download />} onClick={() => router.push('/databases')}>
              Install more reference data
            </Optional>
            <Optional icon={<Database />} onClick={() => openSettingsAt('companion')}>
              Add a native engine
            </Optional>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="accent" icon={<Board />} onClick={() => router.push('/analysis')}>
              Start studying
            </Button>
            <Link
              href="/openings"
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-xs text-secondary transition-colors hover:border-line-strong hover:text-primary"
            >
              <Opening className="h-4 w-4" />
              Browse the opening library
            </Link>
          </div>
        </div>

        <IconButton label="Dismiss the getting-started panel" onClick={onDismiss}>
          <Close />
        </IconButton>
      </div>
    </section>
  );
}

const Ready = ({
  ok,
  label,
  detail,
}: {
  readonly ok: boolean;
  readonly label: string;
  readonly detail: string;
}) => (
  <div className="flex items-start gap-2">
    <span
      className={cn(
        'mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
        ok ? 'bg-success/20 text-success' : 'bg-surface-3 text-tertiary',
      )}
      aria-hidden
    >
      {ok ? <Check className="h-3 w-3" /> : <span className="text-[9px]">…</span>}
    </span>
    <div className="min-w-0">
      <dt className="text-xs text-primary">{label}</dt>
      <dd className="truncate text-[11px] text-tertiary">{detail}</dd>
    </div>
  </div>
);

const Optional = ({
  icon,
  onClick,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-xs text-secondary transition-colors hover:border-line-strong hover:text-primary"
  >
    <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    {children}
  </button>
);
