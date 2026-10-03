'use client';

/**
 * ChessBase's "Download Online Games": anyone's public games from Lichess or
 * Chess.com, once, into My games (`src/sync/download.ts`). Nothing about the
 * account is kept; the games go through the ordinary import, so duplicates
 * are skipped and variant games are refused with their reason.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Tabs';
import { importGames } from '@/persistence/import-game';
import { getRepositories } from '@/persistence/repositories';
import { describeError } from '@/lib/describe-error';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { downloadOnlineGames, type OnlineSite } from '@/sync/download';

const PERIODS = [
  { id: '1', label: '1 month', months: 1 },
  { id: '3', label: '3 months', months: 3 },
  { id: '12', label: '12 months', months: 12 },
  { id: '36', label: '3 years', months: 36 },
] as const;

const FIELD =
  'h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60';

export function DownloadGamesDialog({ onClose }: { readonly onClose: () => void }) {
  const prefs = usePreferences();
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [site, setSite] = useState<OnlineSite>('lichess');
  const [username, setUsername] = useState('');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('3');
  const [max, setMax] = useState('200');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const cap = Math.max(1, Math.min(2_000, Number(max) || 200));
  const months = PERIODS.find((entry) => entry.id === period)?.months ?? 3;

  const run = async () => {
    const name = username.trim();
    if (!name || busy) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setStatus(site === 'lichess' ? 'Asking Lichess…' : 'Reading the Chess.com archive list…');
    try {
      const pgn = await downloadOnlineGames({
        site,
        username: name,
        months,
        max: cap,
        signal: abort.signal,
        ...(site === 'lichess' && prefs.lichessToken ? { token: prefs.lichessToken } : {}),
        onMonth: (done, of) => setStatus(`Read ${done} of ${of} monthly archives…`),
      });
      if (!pgn.trim()) {
        setStatus(null);
        setError(
          `${site === 'lichess' ? 'Lichess' : 'Chess.com'} has no public games by “${name}” in the last ${PERIODS.find((entry) => entry.id === period)?.label}.`,
        );
        return;
      }
      setStatus('Importing…');
      const repositories = await getRepositories();
      const summary = await importGames(pgn, repositories.games, { signal: abort.signal });
      await queryClient.invalidateQueries({ queryKey: ['games'] });
      await queryClient.invalidateQueries({ queryKey: ['collection-index'] });
      notify({
        tone: 'success',
        message:
          summary.imported === 0
            ? `Every downloaded game by ${name} was already in My games.`
            : `${summary.imported} game${summary.imported === 1 ? '' : 's'} by ${name} added to My games.`,
        detail: [
          `${summary.games + (summary.refused ?? 0)} downloaded from ${site === 'lichess' ? 'Lichess' : 'Chess.com'}.`,
          summary.duplicates ? `${summary.duplicates} already there.` : null,
          summary.refusedDetail ?? null,
        ]
          .filter(Boolean)
          .join(' '),
      });
      onClose();
      router.push(`/games?player=${encodeURIComponent(name)}`);
    } catch (failure) {
      if (abort.signal.aborted) {
        setStatus(null);
        return;
      }
      const described = describeError(failure);
      setStatus(null);
      setError([described.message, described.remedy].filter(Boolean).join(' '));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      title="Download online games"
      description="A player’s public games from Lichess or Chess.com, into My games. Nothing about the account is kept."
      footer={
        <>
          <Button
            onClick={() => {
              controller.current?.abort();
              onClose();
            }}
          >
            {busy ? 'Stop' : 'Cancel'}
          </Button>
          <Button
            variant="accent"
            disabled={!username.trim() || busy}
            onClick={() => void run()}
            data-download-games
          >
            Download
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented
          items={[
            { id: 'lichess', label: 'Lichess' },
            { id: 'chess.com', label: 'Chess.com' },
          ]}
          value={site}
          onChange={(next) => setSite(next as OnlineSite)}
        />
        <label className="block text-[11px] text-tertiary">
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void run();
            }}
            className={`${FIELD} mt-1`}
            placeholder={site === 'lichess' ? 'e.g. DrNykterstein' : 'e.g. MagnusCarlsen'}
            autoFocus
          />
        </label>
        <div className="flex flex-wrap items-start gap-3">
          <div className="text-[11px] text-tertiary">
            <p className="mb-1">Played in the last</p>
            <Segmented
              items={PERIODS.map((entry) => ({ id: entry.id, label: entry.label }))}
              value={period}
              onChange={(next) => setPeriod(next as (typeof PERIODS)[number]['id'])}
            />
          </div>
          <label className="w-28 text-[11px] text-tertiary">
            At most
            <input
              value={max}
              inputMode="numeric"
              onChange={(event) => setMax(event.target.value.replace(/\D/g, '').slice(0, 4))}
              className={`${FIELD} mt-1 h-[30px]`}
            />
          </label>
        </div>
        <p className="text-[11px] leading-snug text-tertiary">
          The newest {cap.toLocaleString()} games of the period are kept.{' '}
          {site === 'lichess'
            ? prefs.lichessToken
              ? 'Your Lichess sign-in is used for the request.'
              : 'Lichess may ask you to sign in (Settings → Accounts) before it serves an export.'
            : 'Chess.com publishes archives a month at a time; each month is one request.'}{' '}
          Chess960 and other variants are not imported.
        </p>
        {status ? (
          <p className="text-xs text-secondary" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-caution" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
