'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Toggle } from '@/components/ui/Toggle';
import { PageHeader } from '@/features/shell/PageHeader';
import { cn } from '@/lib/cn';
import type { SyncConflictRecord } from '@/persistence/sync-state';
import { GAME_SYNC_LIMIT } from '@/sync/cloud/games-source';
import { DEVICE_ONLY_STORES } from '@/sync/cloud/scope';
import { useAccount } from '@/stores/account-store';
import { usePreferences } from '@/stores/preferences-store';

import {
  describeAuthError,
  sendPasswordReset,
  updateDisplayName,
  updatePassword,
} from './auth-actions';
import { describeStore, relativeTime, syncHeadline, type SyncTone } from './sync-labels';

const TONE_DOT: Record<SyncTone, string> = {
  neutral: 'bg-tertiary',
  positive: 'bg-positive',
  busy: 'bg-accent animate-pulse',
  caution: 'bg-caution',
  negative: 'bg-negative',
};

export function SyncDot({ tone, className }: { tone: SyncTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONE_DOT[tone], className)}
    />
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line-subtle py-7 last:border-b-0">
      <div className="grid gap-5 md:grid-cols-[220px_1fr] md:gap-10">
        <div>
          <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
          {description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{description}</p>
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/**
 * The one switch on this page: whether this device carries My games.
 *
 * Per device and off by default (`src/sync/cloud/games-source.ts`). The
 * sentence under it states the two things that differ from the rest of
 * sync, because both would surprise somebody who assumed a mirror: only the
 * newest games travel, and deleting one deletes it here only.
 */
function MyGamesSync() {
  const on = usePreferences((state) => state.syncMyGames);
  const set = usePreferences((state) => state.set);
  return (
    <div
      className="mt-5 rounded-[var(--radius-control)] border border-line-subtle p-3"
      data-my-games-sync
    >
      <div className="flex items-center gap-3">
        <Toggle
          label="Sync My games on this device"
          checked={on}
          onChange={(value) => set('syncMyGames', value)}
        />
        <p className="text-sm text-primary">Sync My games on this device</p>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">
        Your newest {GAME_SYNC_LIMIT.toLocaleString()} games travel to every device where this is
        also on. Games are added, never removed: deleting a game deletes it from this device only,
        and signing out leaves them here.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-36 shrink-0 text-[13px] text-tertiary">{label}</dt>
      <dd className="min-w-0 text-sm text-primary">{children}</dd>
    </div>
  );
}

function titleOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['title', 'name', 'label'])
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  return null;
}

function ConflictRow({ conflict }: { conflict: SyncConflictRecord }) {
  const restore = useAccount((state) => state.restoreConflict);
  const dismiss = useAccount((state) => state.dismissConflict);
  const [busy, setBusy] = useState(false);
  const local = titleOf(conflict.localValue);
  const remote = titleOf(conflict.remoteValue);
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">
          {describeStore(conflict.store, 1)}
          {local ? ` · ${local}` : ''}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">
          {conflict.localValue === null
            ? 'You deleted this here while it was changed elsewhere; the changed version was kept.'
            : conflict.remoteValue === null
              ? 'It was deleted on another device while you changed it here. Your version is kept below.'
              : `Changed on this device and on ${conflict.remoteDevice ?? 'another device'}. The account’s version${remote && remote !== local ? ` (“${remote}”)` : ''} is showing; yours is kept here.`}{' '}
          <span className="text-tertiary">{relativeTime(conflict.detectedAt)}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="subtle"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await restore(conflict.id);
            setBusy(false);
          }}
        >
          {conflict.localValue === null ? 'Delete it again' : 'Use my version'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void dismiss(conflict.id)}>
          Keep account’s
        </Button>
      </div>
    </li>
  );
}

function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const signOut = useAccount((state) => state.signOut);
  const router = useRouter();
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sign out"
      description="Your account keeps everything that has synced. Choose what stays on this device."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signOut({ removeSyncedCopies: remove });
              setBusy(false);
              onClose();
              router.push('/sign-in');
            }}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="sr-only">After signing out</legend>
        {[
          {
            value: false,
            title: 'Keep a copy on this device',
            body: 'Recommended on your own computer. You can keep working offline.',
          },
          {
            value: true,
            title: 'Remove synced work from this device',
            body: 'For a shared computer. Only work your account already holds is removed; anything not yet uploaded stays.',
          },
        ].map((option) => (
          <label
            key={String(option.value)}
            className={cn(
              'flex cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3',
              remove === option.value ? 'border-accent bg-accent-muted' : 'border-line',
            )}
          >
            <input
              type="radio"
              name="sign-out-mode"
              checked={remove === option.value}
              onChange={() => setRemove(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-primary">{option.title}</span>
              <span className="block text-[13px] text-secondary">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const deleteAccount = useAccount((state) => state.deleteAccount);
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete your account"
      description="This removes your account and every copy of your work stored in it. Work on this device stays on this device."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy || typed !== 'DELETE'}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await deleteAccount();
                onClose();
                router.push('/');
              } catch (failure) {
                setError(describeAuthError(failure as Error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </Button>
        </>
      }
    >
      <label className="block text-sm text-secondary">
        Type <strong className="font-mono text-primary">DELETE</strong> to confirm.
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="mt-2 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-1 px-3 font-mono text-sm text-primary outline-none focus:border-accent"
          autoComplete="off"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function ProfileName({ initial }: { initial: string | null }) {
  const [name, setName] = useState(initial ?? '');
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await updateDisplayName(name);
        setMessage(result.message ?? null);
      }}
    >
      <input
        aria-label="Display name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={120}
        placeholder="How Kingfisher should call you"
        className="h-8 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 text-sm text-primary outline-none focus:border-accent sm:max-w-xs"
      />
      <Button type="submit" variant="subtle" size="sm">
        Save
      </Button>
      {message && (
        <span className="text-xs text-secondary" role="status">
          {message}
        </span>
      )}
    </form>
  );
}

const PROVIDER_NAME: Record<string, string> = { email: 'Email and password', google: 'Google' };
const providerName = (provider: string) => PROVIDER_NAME[provider] ?? provider;

function PasswordChange({
  email,
  providers,
}: {
  email: string | null;
  providers: readonly string[];
}) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!providers.includes('email')) {
    const provider = providers[0] ?? 'google';
    return (
      <p className="text-sm text-secondary">
        You sign in with {provider === 'google' ? 'Google' : provider}. Your password is managed
        there.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await updatePassword(password);
          setMessage({ ok: result.ok, text: result.message ?? '' });
          if (result.ok) setPassword('');
        }}
      >
        <input
          type="password"
          aria-label="New password"
          autoComplete="new-password"
          value={password}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password (8+ characters)"
          className="h-8 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-1 px-2.5 text-sm text-primary outline-none focus:border-accent sm:max-w-xs"
        />
        <Button type="submit" variant="subtle" size="sm" disabled={password.length < 8}>
          Change password
        </Button>
      </form>
      {email && (
        <button
          type="button"
          className="text-[13px] text-accent hover:underline"
          onClick={async () => {
            const result = await sendPasswordReset(email);
            setMessage({ ok: result.ok, text: result.message ?? '' });
          }}
        >
          Email me a reset link instead
        </button>
      )}
      {message && (
        <p
          role="status"
          className={cn('text-[13px]', message.ok ? 'text-positive' : 'text-negative')}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export function AccountRoute() {
  const router = useRouter();
  const account = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (account.status === 'signed-out') router.replace('/sign-in?next=/account');
  }, [account.status, router]);

  // Keep "2 min ago" honest while the page is open.
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (account.status === 'unconfigured') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Account" subtitle="Accounts are not set up in this build" />
        <p className="mx-auto w-full max-w-4xl px-5 py-8 text-sm leading-relaxed text-secondary sm:px-8">
          Everything you make is saved on this device, and Settings → Backup exports it as a file
          you can move anywhere.
        </p>
      </div>
    );
  }
  if (account.status !== 'signed-in' || !account.user) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Account" subtitle="Loading your account…" />
      </div>
    );
  }

  const user = account.user;
  const headline = syncHeadline(account);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Account"
        subtitle={user.email ?? undefined}
        actions={
          <span
            className="inline-flex items-center gap-2 px-2 text-sm text-secondary"
            role="status"
            aria-live="polite"
          >
            <SyncDot tone={headline.tone} />
            <span>{headline.text}</span>
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-5 pb-16 sm:px-8">
          <Section
            title="Sync"
            description="Your work is saved on this device first, then copied to your account within a few seconds. Open Kingfisher anywhere you sign in and it is there."
          >
            <dl>
              <Row label="Last synced">{relativeTime(account.lastSyncedAt)}</Row>
              <Row label="This device">
                {typeof window !== 'undefined'
                  ? (localStorage.getItem('kingfisher.device-id') ?? '—')
                  : '—'}
              </Row>
              {account.lastError && account.phase !== 'idle' && (
                <Row label="Last problem">
                  <span className="text-negative">{account.lastError}</span>
                </Row>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void account.syncNow({ reconcile: true })}
                disabled={account.phase === 'syncing'}
              >
                {account.phase === 'syncing' ? 'Syncing…' : 'Sync now'}
              </Button>
            </div>
            <MyGamesSync />
            <details className="mt-5 text-[13px] text-secondary">
              <summary className="cursor-pointer text-primary">
                What syncs, and what stays on this device
              </summary>
              <div className="mt-3 space-y-2 leading-relaxed">
                <p>
                  <strong className="font-medium text-primary">Syncs:</strong> studies and chapters
                  with every variation, comment and annotation; unsaved analysis; repertoires;
                  training cards and progress; preparation; opening files; journal, decisions and
                  review; saved searches; pinned lines; stored engine results; puzzle history; the
                  positions you analysed; and your display, board and engine preferences.
                </p>
                <p>
                  <strong className="font-medium text-primary">Stays here:</strong> imported game
                  collections (except My games when you switch it on above) and reference packs
                  (large, and re-importable), engines and tablebases, secrets such as API tokens,
                  settings that describe this machine (threads, memory, installed sources), and{' '}
                  {Object.values(DEVICE_ONLY_STORES).length} kinds of in-progress engine job.
                </p>
              </div>
            </details>
          </Section>

          {account.conflicts.length > 0 && (
            <Section
              title="To review"
              description="When the same thing was changed in two places, the account’s version is used everywhere and yours is kept here until you decide."
            >
              <ul className="space-y-3">
                {account.conflicts.map((conflict) => (
                  <ConflictRow key={conflict.id} conflict={conflict} />
                ))}
              </ul>
            </Section>
          )}

          <Section title="Profile">
            <dl>
              <Row label="Email">
                {user.email}{' '}
                {!user.emailConfirmed && <span className="ml-1 text-caution">(not confirmed)</span>}
              </Row>
              <Row label="Signs in with">{user.providers.map(providerName).join(' · ')}</Row>
              <Row label="Name">
                <ProfileName initial={user.displayName} />
              </Row>
            </dl>
          </Section>

          <Section title="Security">
            <PasswordChange email={user.email} providers={user.providers} />
          </Section>

          <Section
            title="Session"
            description="Signing out never deletes anything from your account."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="subtle" onClick={() => setSigningOut(true)}>
                Sign out
              </Button>
            </div>
          </Section>

          <Section
            title="Delete account"
            description={
              <>
                Removes the account and its copy of your work. Export a backup first from{' '}
                <Link href="/settings" className="text-accent hover:underline">
                  Settings
                </Link>{' '}
                if you want one.
              </>
            }
          >
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete account…
            </Button>
          </Section>
        </div>
      </div>
      <SignOutDialog open={signingOut} onClose={() => setSigningOut(false)} />
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </div>
  );
}
