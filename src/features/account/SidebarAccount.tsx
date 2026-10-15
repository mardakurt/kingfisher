'use client';

import Link from 'next/link';

import { cn } from '@/lib/cn';
import { useAccount } from '@/stores/account-store';

import { SyncDot } from './AccountRoute';
import { syncHeadline } from './sync-labels';

const ROW =
  'flex h-9 w-full items-center rounded-[var(--radius-control)] text-[13px] text-secondary transition-colors hover:bg-black/[0.04] hover:text-primary active:bg-black/[0.08] dark:hover:bg-white/[0.06] dark:active:bg-white/[0.11]';

function initials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (name ? (parts[1]?.[0] ?? '') : '')).toUpperCase();
}

/**
 * The account at the foot of the sidebar: who is signed in and whether their
 * work is synced, one click from the Account page. Absent when this build has
 * no account service, so a local-only build looks exactly as it always did.
 */
export function SidebarAccount({
  compact,
  onNavigate,
}: {
  compact: boolean;
  onNavigate?: () => void;
}) {
  const status = useAccount((state) => state.status);
  const user = useAccount((state) => state.user);
  const phase = useAccount((state) => state.phase);
  const lastSyncedAt = useAccount((state) => state.lastSyncedAt);
  const conflicts = useAccount((state) => state.conflicts);

  if (status === 'unconfigured' || status === 'loading') return null;

  if (status === 'signed-out' || !user) {
    return (
      <Link
        href="/sign-in?next=/analysis"
        onClick={onNavigate}
        className={cn(ROW, compact ? 'justify-center' : 'gap-2.5 px-2.5')}
        aria-label="Sign in to sync your work"
        title="Sign in to keep your work on every device"
      >
        <span
          aria-hidden
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-line text-[11px]"
        >
          ↗
        </span>
        <span className={cn('truncate', compact && 'hidden')}>Sign in to sync</span>
      </Link>
    );
  }

  const headline = syncHeadline({ status, phase, lastSyncedAt, conflicts });
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      className={cn(ROW, compact ? 'justify-center' : 'gap-2.5 px-2.5')}
      aria-label={`Account, ${user.email ?? ''}: ${headline.text}`}
      title={`${user.email ?? 'Account'} — ${headline.text}`}
      data-account-status={phase}
    >
      <span className="relative shrink-0">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-contrast">
          {initials(user.displayName, user.email)}
        </span>
        <SyncDot
          tone={headline.tone}
          className="absolute -right-0.5 -bottom-0.5 ring-2 ring-[var(--surface-sidebar)]"
        />
      </span>
      <span className={cn('min-w-0 flex-1 text-left', compact && 'hidden')}>
        <span className="block truncate text-primary">{user.displayName ?? user.email}</span>
        <span className="block truncate text-[11px] leading-tight text-tertiary">
          {headline.text}
        </span>
      </span>
    </Link>
  );
}
