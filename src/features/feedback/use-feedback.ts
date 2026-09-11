'use client';

import { useCallback, useState } from 'react';

import { GithubFallbackSink, HttpFeedbackSink, type FeedbackSink } from './feedback-sink';
import {
  validateFeedbackDraft,
  type FeedbackDraft,
  type FeedbackEnvelope,
  type FeedbackResult,
  type FeedbackSurface,
} from './feedback-schema';

export interface BuildEnvelopeInput {
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
  readonly openedAtMs: number;
}

/**
 * Build the wire envelope from a renderer-validated draft.
 *
 * The route accepts only `Record<string, string>` for
 * technical info; the modal collects the dictionary in
 * `collectFeedbackTechnicalInfo` and we keep it as a single
 * `snapshot` key on the wire.
 */
export function buildEnvelopeFromDraft(
  draft: FeedbackDraft,
  meta: BuildEnvelopeInput,
): FeedbackEnvelope {
  const envelope: FeedbackEnvelope = {
    category: draft.category,
    message: draft.message.trim(),
    includeTechnical: draft.includeTechnical,
    clientVersion: meta.clientVersion,
    surface: meta.surface,
  };
  return envelope;
}

export interface UseFeedbackOptions {
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
  readonly githubRepositoryUrl: string;
  readonly sink?: FeedbackSink;
}

export interface UseFeedbackApi {
  readonly open: boolean;
  readonly category: FeedbackDraft['category'];
  readonly message: string;
  readonly setOpen: (open: boolean) => void;
  readonly setCategory: (category: FeedbackDraft['category']) => void;
  readonly setMessage: (message: string) => void;
  readonly submit: () => Promise<FeedbackResult | null>;
  readonly fallback: () => void;
  readonly result: FeedbackResult | null;
  readonly busy: boolean;
  readonly validationError: string | null;
}

export function useFeedback(options: UseFeedbackOptions): UseFeedbackApi {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackDraft['category']>('broken');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [draft] = useState<FeedbackDraft>({
    category: 'broken',
    message: '',
    includeTechnical: false,
  });

  const submit = useCallback(async () => {
    const error = validateFeedbackDraft(draft);
    if (error) return null;
    const envelope = buildEnvelopeFromDraft(draft, {
      clientVersion: options.clientVersion,
      surface: options.surface,
      openedAtMs: Date.now() - 2000,
    });
    setBusy(true);
    setResult(null);
    try {
      const sink = options.sink ?? new HttpFeedbackSink();
      const out = await sink.submit(envelope);
      setResult(out);
      return out;
    } finally {
      setBusy(false);
    }
  }, [draft, options.clientVersion, options.sink, options.surface]);

  const fallback = useCallback(() => {
    const sink = new GithubFallbackSink({
      repositoryUrl: options.githubRepositoryUrl,
      template: 'feature_request.md',
      surface: options.surface,
      clientVersion: options.clientVersion,
    });
    void sink.submit(
      buildEnvelopeFromDraft(draft, {
        clientVersion: options.clientVersion,
        surface: options.surface,
        openedAtMs: Date.now() - 2000,
      }),
    );
  }, [draft, options.clientVersion, options.githubRepositoryUrl, options.surface]);

  return {
    open,
    category,
    message,
    setOpen,
    setCategory,
    setMessage,
    submit,
    fallback,
    result,
    busy,
    validationError: validateFeedbackDraft(draft),
  };
}

/** Re-export so a test or wrapper can patch `draft` updates. */
export function applyDraftUpdate(prev: FeedbackDraft, next: Partial<FeedbackDraft>): FeedbackDraft {
  return { ...prev, ...next };
}
