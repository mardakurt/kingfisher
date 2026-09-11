/**
 * The feedback schema is shared between the renderer (which
 * builds and validates a payload before sending) and the
 * server route (which validates it again, with the renderer
 * validation a UX nicety rather than a security boundary).
 *
 * Schema is intentionally narrow:
 *
 *   - `category` is a closed enum. Anything outside it is
 *     refused at the route.
 *   - `message` is bounded (4000 characters). A first user
 *     never legitimately needs more, and the bound is what
 *     keeps a hostile submission from being expensive to
 *     receive.
 *   - `currentFen` is opt-in. The renderer collects it only
 *     when the user explicitly opts in, and the route treats
 *     it as a free string the user typed.
 *   - `includeTechnical` is opt-in. When true, the route
 *     accepts a `technicalInfo` block; when false, the route
 *     rejects `technicalInfo` as a privacy violation.
 *   - `clientVersion`, `surface` are server-attached
 *     provenance. The renderer fills `clientVersion` from
 *     the version constant; `surface` is what the route
 *     decides from headers (`web`, `pwa`, `desktop`).
 *
 * The schema deliberately does NOT carry:
 *
 *   - arbitrary HTML
 *   - arbitrary metadata maps
 *   - URLs
 *   - attachments
 *   - filesystem paths
 *
 * A first user typing "the explorer is showing the wrong
 * source" needs `category` and `message` and a way to attach
 * the current FEN. Anything else is a surface for abuse.
 */

export const FEEDBACK_CATEGORIES = [
  'broken',
  'data-issue',
  'confusing',
  'improvement',
  'general',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Readonly<Record<FeedbackCategory, string>> = {
  broken: 'Something is broken',
  'data-issue': 'Chess / data issue',
  confusing: 'Confusing or difficult to use',
  improvement: 'Feature / improvement idea',
  general: 'General feedback',
};

export const FEEDBACK_MAX_MESSAGE = 4000;
export const FEEDBACK_MAX_FEN = 200;
export const FEEDBACK_MAX_TECHNICAL_KEYS = 64;
export const FEEDBACK_MAX_TECHNICAL_STRING = 2000;

export interface FeedbackDraft {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly currentFen?: string;
  readonly includeTechnical: boolean;
  readonly technicalInfo?: Record<string, string>;
}

export interface FeedbackEnvelope {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly currentFen?: string;
  readonly includeTechnical: boolean;
  readonly technicalInfo?: Record<string, string>;
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
}

export type FeedbackSurface = 'web' | 'pwa' | 'desktop';

export type FeedbackResult =
  | { readonly ok: true; readonly reference: string }
  | {
      readonly ok: false;
      readonly code:
        'unavailable' | 'rejected' | 'rate-limited' | 'too-large' | 'network' | 'timeout';
      readonly message: string;
    };

/**
 * Renderer-side validation. The route validates again; this is
 * for UX only — surfacing errors before the user clicks Send
 * rather than after.
 */
export function validateFeedbackDraft(draft: FeedbackDraft): string | null {
  if (!FEEDBACK_CATEGORIES.includes(draft.category)) {
    return 'Pick a category.';
  }
  const message = draft.message.trim();
  if (message.length === 0) {
    return 'Tell us what is on your mind.';
  }
  if (message.length > FEEDBACK_MAX_MESSAGE) {
    return `Keep the message under ${FEEDBACK_MAX_MESSAGE} characters.`;
  }
  if (draft.currentFen && draft.currentFen.length > FEEDBACK_MAX_FEN) {
    return 'The current position is too long.';
  }
  if (draft.includeTechnical) {
    if (!draft.technicalInfo) {
      return 'Technical information is enabled but missing.';
    }
    const keys = Object.keys(draft.technicalInfo);
    if (keys.length > FEEDBACK_MAX_TECHNICAL_KEYS) {
      return 'Technical information has too many fields.';
    }
    for (const key of keys) {
      const value = draft.technicalInfo[key];
      if (typeof value !== 'string') {
        return 'Technical information has non-string values.';
      }
      if (value.length > FEEDBACK_MAX_TECHNICAL_STRING) {
        return `Technical information: ${key} is too long.`;
      }
    }
  } else if (draft.technicalInfo) {
    return 'Technical information is attached but the toggle is off.';
  }
  return null;
}
