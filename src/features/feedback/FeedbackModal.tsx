'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/cn';

import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_MESSAGE,
  validateFeedbackDraft,
  type FeedbackCategory,
  type FeedbackDraft,
  type FeedbackResult,
} from './feedback-schema';
import { GithubFallbackSink, HttpFeedbackSink } from './feedback-sink';
import { buildEnvelopeFromDraft } from './use-feedback';
import { collectFeedbackTechnicalInfo, formatTechnicalPreview } from './feedback-technical';
import type { FeedbackSurface } from './feedback-schema';

/**
 * The in-app Feedback dialog.
 *
 * One implementation, called from:
 *   - the bottom of the sidebar
 *   - the Cmd+K "Send feedback" / "Report a problem" /
 *     "Report a data issue" commands
 *   - the "Help and Feedback" section in Settings
 *
 * No telemetry. No background upload. The message does not
 * leave the browser until the user clicks Send.
 *
 * The modal:
 *   - shows the user exactly what will be sent;
 *   - lets the user inspect the technical information
 *     before attaching it;
 *   - keeps the draft if the modal closes accidentally
 *     (current session only — no analytics, no persistence
 *     across reloads);
 *   - on failure, offers Copy Feedback or Open GitHub
 *     Feedback so the typed message is never lost.
 */

interface FeedbackModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
  readonly githubRepositoryUrl: string;
  readonly initialCategory?: FeedbackCategory;
  readonly initialMessage?: string;
  readonly draft?: FeedbackDraft | null;
  readonly onDraftChange?: (draft: FeedbackDraft | null) => void;
  readonly currentFenProvider?: () => string | null;
}

export function FeedbackModal(props: FeedbackModalProps) {
  const {
    open,
    onClose,
    clientVersion,
    surface,
    githubRepositoryUrl,
    initialCategory = 'broken',
    initialMessage = '',
    draft,
    onDraftChange,
    currentFenProvider,
  } = props;

  /* Initial state is computed once at mount. The parent
     remounts the modal on each open (it is conditionally
     rendered), so this captures the freshly-sent initial
     values without an effect. */
  const [category, setCategory] = useState<FeedbackCategory>(draft?.category ?? initialCategory);
  const [message, setMessage] = useState<string>(draft?.message ?? initialMessage);
  const [includeFen, setIncludeFen] = useState<boolean>(Boolean(draft?.currentFen));
  const [includeTechnical, setIncludeTechnical] = useState<boolean>(
    draft?.includeTechnical ?? false,
  );
  const [previewTechnical, setPreviewTechnical] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  /* Probed once when the modal opens. The GET endpoint tells
     us whether a durable sink exists. When it does not, the
     modal does not pretend a Send button is going to deliver;
     it shows the Copy / Open GitHub fallback as the primary
     path. The state goes through three values:
       - 'unknown': initial, before the probe returns
       - true: a durable sink exists; the Send button works
       - false: no sink; the modal renders the explicit
                fallback surface */
  const [directAvailable, setDirectAvailable] = useState<boolean | 'unknown'>('unknown');
  /* Captured once at mount via a state initialiser (allowed
     in a render path because the initialiser only runs at
     mount time). The parent remounts the modal on each
     open, so this gives every fresh open a fresh timestamp. */
  const [openedAtMs] = useState<number>(() => Date.now());
  const messageId = useId();
  const categoryId = useId();

  /* Persist a draft back to the caller whenever the user
     edits. The caller decides whether to keep it across
     navigation. The modal itself does not write to
     localStorage: a feedback draft is too sensitive for a
     general persistence layer. */
  useEffect(() => {
    if (!open || !onDraftChange) return;
    const fen = includeFen ? currentFenProvider?.() : undefined;
    const next: FeedbackDraft = {
      category,
      message,
      ...(fen ? { currentFen: fen } : {}),
      includeTechnical,
      technicalInfo: includeTechnical ? previewTechnicalAsRecord(previewTechnical) : undefined,
    };
    onDraftChange(next);
  }, [
    open,
    category,
    message,
    includeFen,
    includeTechnical,
    previewTechnical,
    currentFenProvider,
    onDraftChange,
  ]);

  const validationError = useMemo(() => {
    const fen = includeFen ? currentFenProvider?.() : undefined;
    const draft: FeedbackDraft = {
      category,
      message,
      ...(fen ? { currentFen: fen } : {}),
      includeTechnical,
      technicalInfo: includeTechnical ? previewTechnicalAsRecord(previewTechnical) : undefined,
    };
    return validateFeedbackDraft(draft);
  }, [category, message, includeFen, includeTechnical, previewTechnical, currentFenProvider]);

  const refreshTechnicalPreview = useCallback(() => {
    if (!includeTechnical) {
      setPreviewTechnical(null);
      return;
    }
    void collectFeedbackTechnicalInfo({ clientVersion, surface })
      .then((info) => setPreviewTechnical(formatTechnicalPreview(info)))
      .catch(() => setPreviewTechnical(null));
  }, [includeTechnical, clientVersion, surface]);

  /* Probe the route once when the modal opens. If the GET
     returns that no sink is configured, the modal renders the
     fallback surface — no Send button, no fake success.
     Network errors default to "unknown" rather than false, so
     the Send button is still offered in case the route is up
     but the GET timed out; the route itself will reject any
     submission without a sink with the explicit 503. */
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    /* Schedule the probe asynchronously so the synchronous setState
       calls live in callbacks, not in the effect's body. The
       initial render sees `directAvailable === 'unknown'`; the
       callbacks below settle it on the next tick. */
    queueMicrotask(() => {
      if (cancelled) return;
      setResult(null);
      setDirectAvailable('unknown');
    });
    void fetch('/api/feedback', {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then((response) =>
        response
          .json()
          .then((body: { directSubmission?: unknown }) =>
            typeof body.directSubmission === 'boolean' ? body.directSubmission : null,
          )
          .catch(() => null),
      )
      .then((available) => {
        if (cancelled) return;
        setDirectAvailable(available === null ? 'unknown' : available);
      })
      .catch(() => {
        if (cancelled) return;
        setDirectAvailable('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !includeTechnical) return;
    let cancelled = false;
    void collectFeedbackTechnicalInfo({ clientVersion, surface })
      .then((info) => {
        if (cancelled) return;
        setPreviewTechnical(formatTechnicalPreview(info));
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewTechnical(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, includeTechnical, clientVersion, surface]);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (validationError) return;
    /* If the probe told us the route has no durable sink,
       do not even attempt a submit. The modal renders the
       fallback panel instead — clicking Send would only
       produce a 503 we are deliberately returning. */
    if (directAvailable === false) return;
    const fen = includeFen ? currentFenProvider?.() : undefined;
    const draftEnvelope: FeedbackDraft = {
      category,
      message,
      ...(fen ? { currentFen: fen } : {}),
      includeTechnical,
      technicalInfo: includeTechnical ? previewTechnicalAsRecord(previewTechnical) : undefined,
    };
    const envelope = buildEnvelopeFromDraft(draftEnvelope, {
      clientVersion,
      surface,
      openedAtMs,
    });
    setSubmitting(true);
    setResult(null);
    try {
      const sink = new HttpFeedbackSink();
      const res = await sink.submit(envelope);
      setResult(res);
      if (res.ok) {
        onDraftChange?.(null);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    category,
    message,
    includeFen,
    includeTechnical,
    previewTechnical,
    currentFenProvider,
    clientVersion,
    surface,
    submitting,
    validationError,
    onDraftChange,
    openedAtMs,
    directAvailable,
  ]);

  const copyFeedback = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const draftText = formatFallbackText({
      category,
      message,
      currentFen: includeFen ? (currentFenProvider?.() ?? null) : null,
      clientVersion,
      surface,
    });
    try {
      await navigator.clipboard.writeText(draftText);
    } catch {
      /* Clipboard permission refused. The user can still
         highlight and copy by hand. */
    }
  }, [category, message, includeFen, currentFenProvider, clientVersion, surface]);

  const openGitHubFallback = useCallback(() => {
    const fallback = new GithubFallbackSink({
      repositoryUrl: githubRepositoryUrl,
      template: categoryTemplateFor(category),
      clientVersion,
      surface,
    });
    const fen = includeFen ? currentFenProvider?.() : undefined;
    const envelope = buildEnvelopeFromDraft(
      {
        category,
        message,
        ...(fen ? { currentFen: fen } : {}),
        includeTechnical,
        technicalInfo: includeTechnical ? previewTechnicalAsRecord(previewTechnical) : undefined,
      },
      { clientVersion, surface, openedAtMs },
    );
    void fallback.submit(envelope);
  }, [
    category,
    message,
    includeFen,
    currentFenProvider,
    includeTechnical,
    previewTechnical,
    githubRepositoryUrl,
    clientVersion,
    surface,
    openedAtMs,
  ]);

  const onDialogClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  if (!open) return null;
  /* When no durable sink exists, the modal does not pretend
     to be a "Send" form — it is a "Your message is here, here
     are the honest ways to file it" surface. The same
     surface is shown after a 503 returns from the route so a
     transient misconfiguration is handled identically. */
  const isUnconfigured =
    directAvailable === false || (result?.ok === false && result.code === 'unconfigured');
  return (
    <Dialog
      open={open}
      onClose={onDialogClose}
      title={isUnconfigured ? 'Feedback — direct delivery not configured' : 'Send feedback'}
      description={
        isUnconfigured
          ? 'Kingfisher does not currently have a private feedback inbox configured. Copy the message below or open a pre-filled GitHub issue instead.'
          : 'Sent only when you click Send. Kingfisher never sends anything automatically.'
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="text-[11px] text-tertiary">{validationError ?? '\u00a0'}</div>
          <div className="flex items-center gap-2">
            {isUnconfigured ? (
              <>
                <Button size="sm" variant="ghost" onClick={copyFeedback}>
                  Copy feedback
                </Button>
                <Button size="sm" variant="subtle" onClick={openGitHubFallback}>
                  Open GitHub feedback
                </Button>
                <Button size="sm" variant="ghost" onClick={onDialogClose}>
                  Close
                </Button>
              </>
            ) : (
              <>
                {result && !result.ok && (
                  <>
                    <Button size="sm" variant="ghost" onClick={copyFeedback}>
                      Copy feedback
                    </Button>
                    <Button size="sm" variant="subtle" onClick={openGitHubFallback}>
                      Open GitHub feedback
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={onDialogClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="accent"
                  onClick={submit}
                  disabled={Boolean(validationError) || submitting}
                >
                  {submitting ? 'Sending…' : 'Send feedback'}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <FeedbackBody
        categoryId={categoryId}
        messageId={messageId}
        category={category}
        message={message}
        includeFen={includeFen}
        includeTechnical={includeTechnical}
        previewTechnical={previewTechnical}
        maxMessage={FEEDBACK_MAX_MESSAGE}
        onCategoryChange={setCategory}
        onMessageChange={setMessage}
        onIncludeFenChange={setIncludeFen}
        onIncludeTechnicalChange={(next) => {
          setIncludeTechnical(next);
          if (next) refreshTechnicalPreview();
        }}
        onRefreshTechnical={refreshTechnicalPreview}
        result={result}
        unconfigured={isUnconfigured}
      />
    </Dialog>
  );
}

function FeedbackBody(props: {
  readonly categoryId: string;
  readonly messageId: string;
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly includeFen: boolean;
  readonly includeTechnical: boolean;
  readonly previewTechnical: string | null;
  readonly maxMessage: number;
  readonly onCategoryChange: (category: FeedbackCategory) => void;
  readonly onMessageChange: (message: string) => void;
  readonly onIncludeFenChange: (next: boolean) => void;
  readonly onIncludeTechnicalChange: (next: boolean) => void;
  readonly onRefreshTechnical: () => void;
  readonly result: FeedbackResult | null;
  readonly unconfigured: boolean;
}) {
  const {
    categoryId,
    messageId,
    category,
    message,
    includeFen,
    includeTechnical,
    previewTechnical,
    maxMessage,
    onCategoryChange,
    onMessageChange,
    onIncludeFenChange,
    onIncludeTechnicalChange,
    onRefreshTechnical,
    result,
    unconfigured,
  } = props;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <fieldset>
        <legend className="text-xs uppercase tracking-wide text-tertiary">Category</legend>
        <div id={categoryId} className={cn('mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2')}>
          {FEEDBACK_CATEGORIES.map((value) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border border-line-subtle px-2 py-1.5',
                category === value ? 'bg-accent/10 ring-1 ring-accent' : 'bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="kingfisher-feedback-category"
                value={value}
                checked={category === value}
                onChange={() => onCategoryChange(value)}
                className="accent-accent"
              />
              <span className="text-xs">{FEEDBACK_CATEGORY_LABELS[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-tertiary">Message</span>
        <textarea
          id={messageId}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          maxLength={maxMessage}
          rows={6}
          className="resize-y rounded-md border border-line-subtle bg-surface-2 px-2 py-1.5 text-sm"
          placeholder="Describe what you saw, what you expected, and how to reproduce it."
        />
        <span className="text-right text-[11px] text-tertiary">
          {message.length} / {maxMessage}
        </span>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-xs font-medium">Include current position (FEN)</span>
          <span className="block text-[11px] text-tertiary">
            Off by default. The current board position will be attached only when this is on.
          </span>
        </span>
        <Toggle
          label="Include current position"
          checked={includeFen}
          onChange={onIncludeFenChange}
        />
      </label>
      <label className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-xs font-medium">Include technical information</span>
          <span className="block text-[11px] text-tertiary">
            App version, browser, storage state, engine providers, and tablebase health. Never
            includes your games, studies, notes, or repertoire.
          </span>
        </span>
        <Toggle
          label="Include technical information"
          checked={includeTechnical}
          onChange={onIncludeTechnicalChange}
        />
      </label>
      {includeTechnical && (
        <details className="rounded-md border border-line-subtle bg-surface-2 p-2 text-[11px]">
          <summary className="cursor-pointer font-medium">What will be included?</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
            {previewTechnical ?? 'Collecting…'}
          </pre>
          <Button size="sm" variant="ghost" onClick={onRefreshTechnical}>
            Refresh
          </Button>
        </details>
      )}
      {result?.ok && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-700">
          Thanks. Your feedback was sent. Reference {result.reference}.
        </p>
      )}
      {result && !result.ok && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-700">
          {result.message}
        </p>
      )}
      {unconfigured && (
        <p
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800"
          role="status"
        >
          Direct feedback is not currently configured. Use <strong>Copy feedback</strong> or{' '}
          <strong>Open GitHub feedback</strong> below to file this manually — typing a message here
          is not the same as sending it.
        </p>
      )}
    </div>
  );
}

function previewTechnicalAsRecord(preview: string | null): Record<string, string> | undefined {
  if (!preview) return undefined;
  return { snapshot: preview };
}

function formatFallbackText(input: {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly currentFen: string | null;
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
}): string {
  return [
    `Category: ${input.category}`,
    '',
    input.message,
    '',
    input.currentFen ? `Position: ${input.currentFen}` : '',
    `Kingfisher ${input.clientVersion} on ${input.surface}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function categoryTemplateFor(category: FeedbackCategory): string {
  switch (category) {
    case 'broken':
      return 'bug_report.md';
    case 'data-issue':
      return 'data_issue.md';
    case 'improvement':
      return 'feature_request.md';
    case 'confusing':
    case 'general':
    default:
      return 'feature_request.md';
  }
}
