'use client';

/**
 * What am I editing, and is it safe?
 *
 * Both questions have to be answerable at a glance, because the answer changes
 * what the user is allowed to assume. A study chapter is theirs and is being
 * written to disk; an imported game is source material and is not; an untitled
 * analysis is neither until they file it.
 *
 * The save state is never optimistic. "Saved" means a write completed, and a
 * failed write says so rather than quietly showing a tick.
 */

import { Save, Warning } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { documentContext, documentTitle } from '@/persistence/describe';
import { selectSaveState, useAnalysis, type SaveState } from '@/stores/analysis-store';
import type { AnalysisDocument } from '@/persistence/types';
import { useUi } from '@/stores/ui-store';

export function DocumentHeader() {
  const document = useAnalysis((state) => state.document);
  const saveState = useAnalysis(selectSaveState);
  const saveError = useAnalysis((state) => state.saveError);
  const setSaveToStudyOpen = useUi((state) => state.setSaveToStudyOpen);

  const context = documentContext(document);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-xs text-primary">{documentTitle(document)}</span>
          {document.kind === 'database-game' || document.kind === 'reference-game' ? (
            <span className="shrink-0 rounded-[3px] bg-surface-3 px-1 text-[10px] text-tertiary">
              read-only source
            </span>
          ) : null}
        </div>
        {context && <span className="block truncate text-[10px] text-tertiary">{context}</span>}
      </div>

      <SaveIndicator state={saveState} error={saveError} kind={document.kind} />

      {document.kind !== 'study-chapter' && (
        <Button
          icon={<Save />}
          onClick={() => setSaveToStudyOpen(true)}
          className="shrink-0"
          aria-label="Save this analysis to a study"
        >
          <span className="hidden lg:inline">Save to study</span>
        </Button>
      )}
    </div>
  );
}

interface SaveIndicatorProps {
  readonly state: SaveState;
  readonly error: string | null;
  readonly kind: AnalysisDocument['kind'];
}

function SaveIndicator({ state, error, kind }: SaveIndicatorProps) {
  if (state === 'error') {
    return (
      <span
        title={error ?? 'The last save failed.'}
        className="flex shrink-0 items-center gap-1 text-[10.5px] text-negative"
      >
        <Warning className="h-3 w-3" />
        <span className="hidden sm:inline">Not saved</span>
      </span>
    );
  }

  // Away from a chapter, a completed write means the draft is safe across a
  // reload — not that the work has been filed anywhere. Say the weaker thing.
  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'unsaved'
        ? 'Unsaved changes'
        : kind === 'study-chapter'
          ? 'Saved'
          : 'Draft saved';

  return (
    <span
      className={cn(
        'hidden shrink-0 text-[10.5px] sm:inline',
        state === 'unsaved' ? 'text-caution' : 'text-tertiary',
      )}
    >
      {label}
    </span>
  );
}
