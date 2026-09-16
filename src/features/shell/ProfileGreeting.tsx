/**
 * The sidebar's greeting.
 *
 * Phase 55 introduced a `displayName` on the profile so that the workspace
 * has a sense of "this is *mine*" instead of "this is some chess data".
 * That feeling is what makes a user come back instead of bouncing — the
 * owner's report called this the biggest problem in Kingfisher, and the
 * fix has to be visible from the moment they open the app.
 *
 * Two states, drawn at the bottom of the sidebar:
 *   - First-launch (no display name): a single text field, a one-line
 *     "what should we call you" prompt, a Save button. Saving once moves
 *     the user to the persistent greeting and dismisses the prompt.
 *   - Persistent (display name is set): a quiet "Welcome back, {name}"
 *     line with a tiny pencil that reopens Settings so the name can be
 *     changed later. The persistent greeting is intentionally low-key;
 *     the welcome prompt is the one place the user sees a real input.
 *
 * The greeting never appears in the collapsed rail: a name in 72 px is
 * a typographic bruise, and the Settings button next to it would have to
 * disappear, which would make renaming impossible from the rail. The
 * Settings dialog is always one keystroke away regardless.
 */
'use client';

import { useState, useCallback } from 'react';

import { useUi } from '@/stores/ui-store';
import { useProfile } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import { cn } from '@/lib/cn';

export function ProfileGreeting() {
  const profile = useProfile();
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const [draft, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = profile.data?.displayName?.trim();
  const showPrompt = profile.data !== undefined && !displayName;

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await (await getRepositories()).profile.setDisplayName(trimmed);
      setDraftName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the name.');
    } finally {
      setBusy(false);
    }
  }, [draft]);

  if (showPrompt) {
    return (
      <div
        data-profile-greeting="prompt"
        className="m-1.5 rounded-[5px] border border-line-subtle bg-surface-2 p-2"
      >
        <p className="text-2xs leading-relaxed text-tertiary">
          What should we call you? A name is what makes this your workspace — your studies,
          repertoire and training plan stay here, browser after browser.
        </p>
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void save();
            }
          }}
          placeholder="Your name"
          aria-label="Your name"
          className={cn(
            'mt-2 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none',
            'placeholder:text-tertiary/60 focus:border-accent/60',
          )}
        />
        {error ? <p className="mt-1 text-2xs text-danger">{error}</p> : null}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !draft.trim()}
            className={cn(
              'rounded-[4px] bg-accent px-3 py-1 text-xs font-medium text-accent-fg transition-opacity',
              (busy || !draft.trim()) && 'cursor-not-allowed opacity-50',
            )}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  if (displayName) {
    return (
      <div
        data-profile-greeting="set"
        className="m-1.5 flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-2xs text-secondary"
      >
        <span className="truncate">
          <span className="text-tertiary">Welcome back, </span>
          <span className="font-medium text-primary">{displayName}</span>
        </span>
        <button
          type="button"
          onClick={() => openSettingsAt('profile')}
          aria-label="Change your name in Settings"
          className="ml-auto rounded-[4px] px-1.5 py-0.5 text-tertiary transition-colors hover:bg-surface-2 hover:text-primary"
        >
          Edit
        </button>
      </div>
    );
  }

  /*
   * Profile still loading. The first paint of the workspace reads as
   * "Kingfisher" because that is the brand; the greeting sits at the
   * bottom of the sidebar where it does not draw attention while
   * data is on the wire.
   */
  return null;
}
