'use client';

/**
 * Tagging a reviewed position with what it was actually about.
 *
 * The built-in list is closed so that counts mean the same thing in six
 * months; the custom field exists because no closed list describes everybody's
 * mistakes. Nothing here is suggested, ranked or pre-selected from an engine
 * score: a theme is the player's reading of their own thinking, and a
 * centipawn loss cannot supply one.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { getRepositories } from '@/persistence/repositories';
import {
  IMPROVEMENT_THEMES,
  themeLabel,
  type DecisionRecord,
  type ReviewItemRecord,
} from '@/persistence/domain';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { useCustomThemes } from './queries';
import { invalidateReview } from '@/features/persistence/queries';

export function ThemePicker({
  decision,
  reviewItem,
  onChanged,
}: {
  readonly decision?: DecisionRecord | null;
  readonly reviewItem?: ReviewItemRecord | null;
  readonly onChanged: () => void;
}) {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const custom = useCustomThemes();
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = new Set(reviewItem?.themes ?? decision?.themes ?? []);
  const options = [...IMPROVEMENT_THEMES, ...(custom.data ?? [])];

  const write = async (next: readonly string[]) => {
    setBusy(true);
    try {
      const repositories = await getRepositories();
      if (decision) {
        await repositories.review.annotateDecision(decision.id, decision.revision, {
          themes: next,
        });
      }
      if (reviewItem) {
        await repositories.review.updateReviewItem(reviewItem.id, reviewItem.revision, {
          themes: next,
          // Tagging is what "I have reviewed this" means in practice.
          ...(reviewItem.status === 'unreviewed' ? { status: 'reviewed' as const } : {}),
        });
      }
      invalidateReview(client);
      onChanged();
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The themes could not be saved.',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (theme: string) => {
    const next = selected.has(theme)
      ? [...selected].filter((entry) => entry !== theme)
      : [...selected, theme];
    void write(next);
  };

  const addCustom = async () => {
    const slug = adding.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug) return;
    setAdding('');
    const repositories = await getRepositories();
    await repositories.profile.addCustomTheme(slug);
    await custom.refetch();
    void write([...selected, slug]);
  };

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        What was this about?
      </h3>
      <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
        Your own reading, not the engine&rsquo;s. These are what the improvement summary counts.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((theme) => (
          <button
            key={theme}
            type="button"
            aria-pressed={selected.has(theme)}
            disabled={busy}
            onClick={() => toggle(theme)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-60',
              selected.has(theme)
                ? 'border-accent bg-accent-muted text-primary'
                : 'border-line-subtle text-secondary hover:border-line hover:text-primary',
            )}
          >
            {themeLabel(theme)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void addCustom();
            }
          }}
          placeholder="Add your own theme"
          aria-label="Add your own theme"
          className="h-7 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60"
        />
        <Button onClick={() => void addCustom()} disabled={!adding.trim() || busy}>
          Add
        </Button>
      </div>
    </div>
  );
}
