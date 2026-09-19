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

import { useEffect, useRef, useState } from 'react';

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
      {/*
        The title gets the room. It is the one flexible thing in a header of
        fixed buttons, and at 1280px it had been squeezed to thirty pixels —
        a document called "Queue White – Queue Black" read as "Fro…".
      */}
      <div className="min-w-[10ch] flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <DocumentTitle document={document} />
          {/*
            Phase 63: a synced or online game where the viewer was one of
            the players carries the side. "Playing as White" / "Playing as
            Black" tells the reader which one they sat down at, which is
            what they actually want to know on the second click — the
            "read-only source" pill alone says nothing about whose game
            it was.
          */}
          {(document.kind === 'reference-game' || document.kind === 'database-game') &&
          document.viewerSide ? (
            /*
              Phase 72: shown at every width, and for stored games too. The
              pill was `wide:` only, so on a laptop the one fact a player
              wants on the second click — which side was theirs — was hidden
              exactly where the board is smallest.
            */
            <span
              className="shrink-0 rounded-[3px] bg-accent/15 px-1 text-[10px] font-medium text-accent"
              data-viewer-side={document.viewerSide}
            >
              You played {document.viewerSide === 'w' ? 'White' : 'Black'}
            </span>
          ) : null}
          {document.kind === 'database-game' || document.kind === 'reference-game' ? (
            <span className="hidden shrink-0 rounded-[3px] bg-surface-3 px-1 text-[10px] text-tertiary wide:inline">
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
          <span className="hidden min-[1500px]:inline">Save to study</span>
        </Button>
      )}
    </div>
  );
}

/**
 * The title in the workspace header.
 *
 * For an `untitled` analysis the user owns the title — clicking it makes it
 * editable. The other kinds draw their title from somewhere the user does
 * not control (a PGN header for a database or reference game, a stored
 * chapter title for a study chapter), and renaming those happens through
 * the source's own rename dialog, which is the path that propagates the
 * change to the right places.
 */
function DocumentTitle({ document }: { readonly document: AnalysisDocument }) {
  const setDocument = useAnalysis((state) => state.setDocument);
  const editable = document.kind === 'untitled';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(document.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  /*
    Entering edit mode re-seeds the draft from the current title so opening
    a different document mid-session does not leave a stale value in the
    input. The reset happens in the event handler rather than an effect on
    `document.title` so it runs once per click rather than every render.
  */
  const startEditing = () => {
    setDraft(document.title);
    setEditing(true);
  };

  if (!editable || !editing) {
    return (
      <span
        className={cn(
          'min-w-0 truncate text-xs text-primary',
          editable && 'cursor-text rounded-[3px] hover:bg-surface-2',
        )}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        title={editable ? 'Click to rename' : documentTitle(document)}
        aria-label={editable ? 'Rename this analysis' : documentTitle(document)}
        onClick={editable ? startEditing : undefined}
        onKeyDown={
          editable
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  startEditing();
                }
              }
            : undefined
        }
      >
        {documentTitle(document)}
      </span>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== document.title) {
      setDocument({ kind: 'untitled', title: trimmed });
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  return (
    /*
      The wrapper is the flex item, sized to whatever room the title had
      when it was a span. The previous build put `flex-1` on the input
      itself, which made the input grow past the wrapper: in a flex row
      with no max-width on the wrapper, `flex-1` grew until something
      further out set a width, and the rest of the header (the save
      indicator and the Save-to-study button) ended up off-screen.
      Constraining the wrapper to `min-w-0 max-w-full` and the input to
      `block w-full` keeps the rename box exactly where the title sat.
    */
    <span className="block min-w-0 max-w-full">
      <input
        ref={inputRef}
        data-rename-analysis
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        size={Math.max(draft.length, 8)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        className="block w-full min-w-0 max-w-full rounded-[3px] border border-accent/60 bg-surface-2 px-1 text-xs text-primary outline-none focus:border-accent"
      />
    </span>
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
        // Below `wide` the header's budget goes to the title; the state is
        // still in the status bar, and "Unsaved changes" keeps its colour there.
        'hidden shrink-0 text-[10.5px] wide:inline',
        state === 'unsaved' ? 'text-caution' : 'text-tertiary',
      )}
    >
      {label}
    </span>
  );
}
