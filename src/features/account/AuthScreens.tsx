'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';

import { BrandMark } from '@/features/shell/BrandMark';
import { isDesktop } from '@/desktop/bridge';
import { cn } from '@/lib/cn';
import { useAccount } from '@/stores/account-store';
import { cloudConfigProblem } from '@/sync/cloud/supabase-client';

import {
  safeNext,
  sendPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
} from './auth-actions';

// ---------------------------------------------------------------------------
// Layout

function AuthFrame({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-surface-0 px-4 py-10 text-primary sm:justify-center sm:py-16">
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2.5 text-[15px] font-semibold text-primary"
          aria-label="Kingfisher home"
        >
          <BrandMark className="h-7 w-7" />
          <span>Kingfisher</span>
        </Link>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
        {lede && <p className="mt-2 text-sm leading-relaxed text-secondary">{lede}</p>}
        <div className="mt-7">{children}</div>
        {footer && (
          <div className="mt-8 border-t border-line-subtle pt-5 text-sm text-secondary">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  hint,
  required = true,
  minLength,
}: {
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const password = type === 'password';
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={password && shown ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(
            'h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface-1 px-3 text-[15px] text-primary outline-none transition-colors',
            'placeholder:text-tertiary focus:border-accent focus:ring-2 focus:ring-accent-muted',
            password && 'pr-16',
          )}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShown((value) => !value)}
            className="absolute inset-y-0 right-1 my-1 rounded-[var(--radius-control)] px-2.5 text-xs font-medium text-secondary hover:bg-surface-3 hover:text-primary"
            aria-label={shown ? 'Hide password' : 'Show password'}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-tertiary">
          {hint}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 text-[15px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-[var(--radius-control)] border px-3 py-2.5 text-sm leading-relaxed',
        tone === 'error' && 'border-negative/40 bg-negative/8 text-primary',
        tone === 'success' && 'border-positive/40 bg-positive/8 text-primary',
        tone === 'info' && 'border-line bg-surface-2 text-secondary',
      )}
    >
      {children}
    </p>
  );
}

function GoogleMark() {
  // The Google "G", drawn in its four brand colours as Google's sign-in guidelines require.
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function GoogleButton({ next, label }: { next: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = typeof window !== 'undefined' && isDesktop();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy || desktop}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await signInWithGoogle(next);
          if (!result.ok) {
            setError(result.message);
            setBusy(false);
          }
        }}
        className="inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface-1 px-4 text-[15px] font-medium text-primary transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? 'Opening Google…' : label}
      </button>
      {desktop && (
        <p className="text-xs text-tertiary">
          Google sign-in works on kingfisherchess.app. In the Mac app, use your email and password.
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-tertiary" aria-hidden>
      <span className="h-px flex-1 bg-line-subtle" />
      or
      <span className="h-px flex-1 bg-line-subtle" />
    </div>
  );
}

function Unconfigured() {
  return (
    <AuthFrame
      title="Accounts are not set up here"
      lede="This build of Kingfisher has no account service configured. Everything still works, and your work is saved on this device."
    >
      <Link href="/analysis" className="text-sm font-medium text-accent hover:underline">
        Open the Studio
      </Link>
    </AuthFrame>
  );
}

/** Redirects a signed-in visitor away from the sign-in forms. */
function useSignedInRedirect(next: string) {
  const router = useRouter();
  const status = useAccount((state) => state.status);
  useEffect(() => {
    if (status === 'signed-in') router.replace(next);
  }, [status, next, router]);
  return status;
}

// ---------------------------------------------------------------------------
// Screens

function SignInInner() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useSignedInRedirect(next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'unconfigured') return <Unconfigured />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signInWithPassword(email, password);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <AuthFrame
      title="Sign in to Kingfisher"
      lede="Your studies, repertoires and analysis, on every device you use."
      footer={
        <>
          New here?{' '}
          <Link
            href={`/sign-up${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-medium text-accent hover:underline"
          >
            Create an account
          </Link>
          . Or{' '}
          <Link href="/analysis" className="font-medium text-accent hover:underline">
            keep working without one
          </Link>{' '}
          — everything is saved on this device either way.
        </>
      }
    >
      <GoogleButton next={next} label="Continue with Google" />
      <Divider />
      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/forgot-password" className="text-accent hover:underline">
          Forgot your password?
        </Link>
      </p>
    </AuthFrame>
  );
}

function SignUpInner() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useSignedInRedirect(next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (status === 'unconfigured') return <Unconfigured />;

  if (sent) {
    return (
      <AuthFrame title="Check your email" lede={sent}>
        <Notice tone="info">
          The link confirms <strong className="font-medium text-primary">{email.trim()}</strong>. It
          may take a minute to arrive; look in spam if it does not.
        </Notice>
        <p className="mt-5 text-sm">
          <Link href="/sign-in" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </AuthFrame>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signUpWithPassword(email, password, next);
    setBusy(false);
    if (!result.ok) setError(result.message);
    else if (result.confirm) setSent(result.message ?? 'Check your email.');
  };

  return (
    <AuthFrame
      title="Create your account"
      lede="Free. Your work keeps living on this device too — an account adds a copy you can reach from anywhere."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
          . By creating one you agree to the{' '}
          <Link href="/terms" className="text-accent hover:underline">
            terms
          </Link>{' '}
          and the{' '}
          <Link href="/privacy" className="text-accent hover:underline">
            privacy policy
          </Link>
          .
        </>
      }
    >
      <GoogleButton next={next} label="Sign up with Google" />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
        />
        {error && <Notice tone="error">{error}</Notice>}
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
    </AuthFrame>
  );
}

function ForgotInner() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const status = useAccount((state) => state.status);
  if (status === 'unconfigured') return <Unconfigured />;
  return (
    <AuthFrame
      title="Reset your password"
      lede="Enter the email you signed up with and we will send a link to choose a new password."
      footer={
        <Link href="/sign-in" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setResult(await sendPasswordReset(email));
          setBusy(false);
        }}
        className="space-y-4"
      >
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        {result && <Notice tone={result.ok ? 'success' : 'error'}>{result.message}</Notice>}
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
      </form>
    </AuthFrame>
  );
}

function UpdatePasswordInner() {
  const router = useRouter();
  const status = useAccount((state) => state.status);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  if (status === 'unconfigured') return <Unconfigured />;
  if (status === 'loading') {
    return (
      <AuthFrame title="Choose a new password" lede="Checking your reset link…">
        {null}
      </AuthFrame>
    );
  }
  if (status === 'signed-out') {
    return (
      <AuthFrame
        title="This link has expired"
        lede="Reset links work once and for a limited time, in the browser you requested them from."
      >
        <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
          Send a new link
        </Link>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Choose a new password">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const outcome = await updatePassword(password);
          setResult(outcome);
          setBusy(false);
          if (outcome.ok) setTimeout(() => router.replace('/account'), 1200);
        }}
        className="space-y-4"
      >
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
        />
        {result && <Notice tone={result.ok ? 'success' : 'error'}>{result.message}</Notice>}
        <SubmitButton busy={busy}>Save password</SubmitButton>
      </form>
    </AuthFrame>
  );
}

/**
 * Where Google and email links return.
 *
 * `detectSessionInUrl` exchanges the code as the client starts; this screen
 * waits for that outcome and says what happened. A code that cannot be
 * exchanged *here* — an email link opened in a different browser than the one
 * that asked for it — still confirmed the address on the server, and the
 * person is told to sign in where they started.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useAccount((state) => state.status);
  const providerError = params.get('error_description') ?? params.get('error');
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (status === 'signed-in') router.replace(next);
  }, [status, next, router]);

  useEffect(() => {
    if (cloudConfigProblem()) return;
    // Give the automatic exchange time to finish before declaring it failed.
    const timer = setTimeout(() => setSettled(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (status === 'unconfigured') return <Unconfigured />;
  if (providerError) {
    return (
      <AuthFrame title="Sign-in did not complete" lede={providerError}>
        <Link href="/sign-in" className="text-sm font-medium text-accent hover:underline">
          Try again
        </Link>
      </AuthFrame>
    );
  }
  if (status === 'signed-out' && settled) {
    return (
      <AuthFrame
        title="Your email is confirmed"
        lede="If you started in another browser or in the Mac app, sign in there. Otherwise, sign in here."
      >
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          Sign in
        </Link>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Signing you in…" lede="One moment.">
      {null}
    </AuthFrame>
  );
}

const wrap = (Inner: () => ReactNode) =>
  function Screen() {
    return (
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    );
  };

export const SignInScreen = wrap(SignInInner);
export const SignUpScreen = wrap(SignUpInner);
export const ForgotPasswordScreen = wrap(ForgotInner);
export const UpdatePasswordScreen = wrap(UpdatePasswordInner);
export const AuthCallbackScreen = wrap(CallbackInner);
