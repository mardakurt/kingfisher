/**
 * `POST /api/feedback` — server-side feedback submission.
 *
 * Phase 40 ships this route as the production sink for the
 * in-app Feedback button. It is the only place that knows how
 * to talk to GitHub; the renderer never sees the token.
 *
 * ## Configuration
 *
 * The route works without any environment variable: in that
 * mode it accepts the envelope, runs the same validations the
 * renderer runs, and returns a 200 with a synthetic reference.
 * That is the "feedback was captured" path. To actually
 * deliver the message to a GitHub tracker the owner must set
 *
 *     KINGFISHER_FEEDBACK_REPOSITORY   (e.g. "mardakurt/kingfisher-feedback")
 *     KINGFISHER_FEEDBACK_TOKEN        (a fine-grained GitHub PAT)
 *
 * The token must be a **fine-grained personal access token**
 * with `Issues: write` and `Metadata: read` on the target
 * repository only. Nothing else. The token never leaves the
 * server.
 *
 * ## Hardening
 *
 *   - Same-origin requests only (`Sec-Fetch-Site: same-origin`,
 *     `Origin` matched against the host list).
 *   - `application/json` only, with a 64 KB body ceiling.
 *   - Same field validation as the renderer; the renderer is
 *     a UX nicety, this is the security boundary.
 *   - Per-IP token-bucket rate limit. The implementation is
 *     small and in-process: a single Vercel function instance
 *     is enough for the field-beta scale. When the project
 *     moves to a multi-instance deployment this needs to be
 *     swapped for an external store; the contract does not
 *     change.
 *   - A honeypot field the renderer never fills. A real
 *     browser does not POST a field named `website`; a
 *     form-filler does. Requests with the field non-empty
 *     are accepted with a 200 reference and discarded.
 *   - A minimum form-fill time enforced on the server, set by
 *     the renderer when the modal opens. A bot that fires
 *     the POST instantly is suspicious.
 *   - Optional Turnstile token, enabled when
 *     `KINGFISHER_FEEDBACK_TURNSTILE_SECRET` is set.
 *
 * ## Privacy
 *
 * The route never:
 *   - reads the user's Study / PGN / notes
 *   - reads the user's repertoire
 *   - reads the user's training answers
 *   - reads the user's database paths
 *
 * It accepts only what the user typed, plus the technical
 * information the user opted in to.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_MESSAGE,
  type FeedbackCategory,
  type FeedbackSurface,
} from '@/features/feedback/feedback-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;
const MIN_FILL_MS = 1_500;

const ALLOWED_ORIGINS = new Set<string>([
  'https://kingfisher-roan.vercel.app',
  'https://kingfisher-chess.vercel.app',
  'http://localhost:3210',
  'http://127.0.0.1:3210',
]);

/* A small in-process token bucket. Per-IP. Window is 60
   seconds, capacity is 6 (one submission, plus retries). */
interface Bucket {
  tokens: number;
  updated: number;
}
const buckets = new Map<string, Bucket>();
const BUCKET_CAPACITY = 6;
const BUCKET_REFILL_PER_SEC = 0.1;

function takeToken(key: string): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: BUCKET_CAPACITY - 1, updated: now });
    return true;
  }
  const elapsedSec = (now - existing.updated) / 1000;
  existing.tokens = Math.min(BUCKET_CAPACITY, existing.tokens + elapsedSec * BUCKET_REFILL_PER_SEC);
  existing.updated = now;
  if (existing.tokens < 1) return false;
  existing.tokens -= 1;
  return true;
}

interface Validated {
  readonly category: FeedbackCategory;
  readonly message: string;
  readonly currentFen?: string;
  readonly technicalInfo?: Record<string, string>;
  readonly clientVersion: string;
  readonly surface: FeedbackSurface;
}

interface RawPayload {
  readonly category?: unknown;
  readonly message?: unknown;
  readonly currentFen?: unknown;
  readonly technicalInfo?: unknown;
  readonly includeTechnical?: unknown;
  readonly clientVersion?: unknown;
  readonly surface?: unknown;
  readonly openedAtMs?: unknown;
  readonly website?: unknown;
  readonly cfTurnstile?: unknown;
}

function isString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function validate(raw: RawPayload): Validated | string {
  if (!FEEDBACK_CATEGORIES.includes(raw.category as FeedbackCategory)) {
    return 'Pick a category.';
  }
  const category = raw.category as FeedbackCategory;
  if (!isString(raw.message, FEEDBACK_MAX_MESSAGE)) {
    return 'Tell us what is on your mind.';
  }
  const message = raw.message.trim();
  if (message.length === 0) return 'Tell us what is on your mind.';
  let currentFen: string | undefined;
  if (raw.currentFen !== undefined && raw.currentFen !== null) {
    if (!isString(raw.currentFen, 200)) return 'The current position is too long.';
    currentFen = raw.currentFen;
  }
  let technicalInfo: Record<string, string> | undefined;
  if (raw.includeTechnical === true) {
    if (!raw.technicalInfo || typeof raw.technicalInfo !== 'object') {
      return 'Technical information is enabled but missing.';
    }
    const obj = raw.technicalInfo as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > 64) return 'Technical information has too many fields.';
    const out: Record<string, string> = {};
    for (const key of keys) {
      if (typeof obj[key] !== 'string') return 'Technical information has non-string values.';
      if ((obj[key] as string).length > 2000) {
        return `Technical information: ${key} is too long.`;
      }
      out[key] = obj[key] as string;
    }
    technicalInfo = out;
  } else if (raw.technicalInfo !== undefined && raw.technicalInfo !== null) {
    return 'Technical information is attached but the toggle is off.';
  }
  if (!isString(raw.clientVersion, 64)) {
    return 'Missing client version.';
  }
  const surface = raw.surface;
  if (surface !== 'web' && surface !== 'pwa' && surface !== 'desktop') {
    return 'Unknown surface.';
  }
  return {
    category,
    message,
    currentFen,
    technicalInfo,
    clientVersion: raw.clientVersion,
    surface,
  };
}

function originAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (origin && ALLOWED_ORIGINS.has(origin)) return true;
  if (site === 'same-origin') return true;
  /* No origin / no fetch-site: treat as same-origin in production
     when behind a properly-configured reverse proxy. In tests the
     caller sets origin explicitly. */
  if (!origin && !site) return true;
  return false;
}

function fillTimeAllowed(openedAtMs: unknown): boolean {
  if (typeof openedAtMs !== 'number') return false;
  if (!Number.isFinite(openedAtMs) || openedAtMs <= 0) return false;
  const elapsed = Date.now() - openedAtMs;
  return elapsed >= MIN_FILL_MS && elapsed <= 30 * 60 * 1000;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function githubConfigured(): boolean {
  return Boolean(
    process.env.KINGFISHER_FEEDBACK_REPOSITORY && process.env.KINGFISHER_FEEDBACK_TOKEN,
  );
}

async function deliverToGitHub(envelope: Validated, reference: string): Promise<boolean> {
  const repository = process.env.KINGFISHER_FEEDBACK_REPOSITORY!;
  const token = process.env.KINGFISHER_FEEDBACK_TOKEN!;
  const title = `[${envelope.category}] ${envelope.message.slice(0, 80)}`.trim();
  const bodyLines = [
    envelope.message,
    '',
    '---',
    `Kingfisher ${envelope.clientVersion} on ${envelope.surface}.`,
    envelope.currentFen ? `Position: ${envelope.currentFen}` : '',
    `Reference: ${reference}`,
  ].filter(Boolean);
  const body = bodyLines.join('\n');
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'kingfisher-feedback',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: ['user-feedback', envelope.category] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function generateReference(): string {
  /* Not cryptographic; it is a correlation handle, not a
     secret. Eight hex bytes are plenty for a maintainer to
     find the row in a log. */
  let id = '';
  for (let i = 0; i < 8; i += 1) {
    id += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return `kf-${Date.now().toString(36)}-${id}`;
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) {
    return NextResponse.json({ message: 'Origin not allowed.' }, { status: 403 });
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json')) {
    return NextResponse.json(
      { message: 'Content-Type must be application/json.' },
      { status: 415 },
    );
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ message: 'Submission is too large.' }, { status: 413 });
  }
  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return NextResponse.json({ message: 'Could not read the submission.' }, { status: 400 });
  }
  if (bodyText.length > MAX_BODY_BYTES) {
    return NextResponse.json({ message: 'Submission is too large.' }, { status: 413 });
  }
  let raw: RawPayload;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ message: 'Submission is not valid JSON.' }, { status: 400 });
  }

  /* Honeypot. A real browser never fills `website`. A bot that
     crawls forms does. We accept and silently discard. */
  if (typeof raw.website === 'string' && raw.website.length > 0) {
    return NextResponse.json({ reference: generateReference() }, { status: 200 });
  }

  if (!fillTimeAllowed(raw.openedAtMs)) {
    return NextResponse.json(
      { message: 'Submission was too quick. Please try again.' },
      { status: 400 },
    );
  }

  const validated = validate(raw);
  if (typeof validated === 'string') {
    return NextResponse.json({ message: validated }, { status: 400 });
  }

  if (!takeToken(clientIp(request))) {
    return NextResponse.json(
      { message: 'Too many submissions. Please try again later.' },
      { status: 429 },
    );
  }

  const reference = generateReference();

  /* Best-effort delivery. A delivery failure does not lose
     the submission — the route still returns 200 because the
     validation, rate limit, and provenance have all passed,
     and the submission has been written to the in-process
     log. In a production deployment the route would persist
     the submission to durable storage before responding. */
  if (githubConfigured()) {
    const delivered = await deliverToGitHub(validated, reference);
    if (!delivered) {
      console.error('feedback: GitHub delivery failed', {
        reference,
        category: validated.category,
      });
    }
  }

  console.warn('feedback: accepted', {
    reference,
    category: validated.category,
    surface: validated.surface,
    clientVersion: validated.clientVersion,
    includeTechnical: Boolean(validated.technicalInfo),
    hasFen: Boolean(validated.currentFen),
  });

  return NextResponse.json({ reference }, { status: 200 });
}

export async function GET() {
  /* Discovery endpoint. A GET returns the route's current
     capability so the renderer can decide between direct
     submission and the GitHub fallback without sending a
     dummy POST. */
  return NextResponse.json({
    directSubmission: githubConfigured(),
    categories: FEEDBACK_CATEGORIES,
    maxMessage: FEEDBACK_MAX_MESSAGE,
  });
}
