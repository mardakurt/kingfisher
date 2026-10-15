/**
 * Sign-in, sign-up and recovery, as plain functions over the Supabase client.
 *
 * Kept apart from the components so the redirect rules — where Supabase sends
 * a person back to after Google or an email link — are stated once, and so
 * every error reaches the person in Kingfisher's words rather than as a
 * provider's error code.
 */

import type { AuthError } from '@supabase/supabase-js';

import { isDesktop } from '@/desktop/bridge';
import { publicUrl } from '@/release/public-urls';
import { getCloudClient } from '@/sync/cloud/supabase-client';

export type AuthResult =
  | { readonly ok: true; readonly message?: string }
  | { readonly ok: false; readonly message: string };

/**
 * Where an email link or an OAuth redirect lands.
 *
 * In a browser, back to this origin. In the Mac application the origin is a
 * loopback address that the person's mail client would open in their browser,
 * not in Kingfisher; so links point at the public site instead, which is also
 * the address the Supabase project allows.
 */
export function authRedirect(path: string): string {
  const origin =
    isDesktop() || typeof window === 'undefined'
      ? new URL(publicUrl.studio).origin
      : window.location.origin;
  return `${origin}${path}`;
}

/** Only same-site paths are honoured as a destination after sign-in. */
export function safeNext(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return fallback;
  return value;
}

export function describeAuthError(
  error: AuthError | Error | { message: string; code?: string } | null,
): string {
  if (!error) return 'Something went wrong. Try again.';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = error.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'That email and password do not match an account.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Confirm your email first — the link is in the message we sent you.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'weak_password' || /password should be/i.test(message)) {
    return 'Choose a longer password: at least 8 characters.';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    /rate limit/i.test(message)
  ) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (code === 'same_password') return 'The new password must differ from the current one.';
  if (/fetch|network/i.test(message))
    return 'Kingfisher could not reach the account service. Check your connection.';
  return message || 'Something went wrong. Try again.';
}

const unavailable: AuthResult = {
  ok: false,
  message: 'Accounts are not set up in this build of Kingfisher.',
};

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const client = getCloudClient();
  if (!client) return unavailable;
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, message: describeAuthError(error) } : { ok: true };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  next: string,
): Promise<AuthResult & { readonly confirm?: boolean }> {
  const client = getCloudClient();
  if (!client) return unavailable;
  if (password.length < 8)
    return { ok: false, message: 'Choose a longer password: at least 8 characters.' };
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authRedirect(`/auth/callback?next=${encodeURIComponent(next)}`) },
  });
  if (error) return { ok: false, message: describeAuthError(error) };
  /*
    With confirmation on, Supabase answers an existing address exactly as it
    answers a new one (no session, an obfuscated user with no identities), so
    nobody can test which emails have accounts. Kingfisher says the same thing
    in both cases for the same reason.
  */
  if (!data.session)
    return {
      ok: true,
      confirm: true,
      message: 'Check your email to confirm your address, then sign in.',
    };
  return { ok: true };
}

export async function signInWithGoogle(next: string): Promise<AuthResult> {
  const client = getCloudClient();
  if (!client) return unavailable;
  if (isDesktop()) {
    return {
      ok: false,
      message:
        'Google sign-in is available on kingfisherchess.app. In the Mac app, use your email and password.',
    };
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirect(`/auth/callback?next=${encodeURIComponent(next)}`) },
  });
  return error ? { ok: false, message: describeAuthError(error) } : { ok: true };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const client = getCloudClient();
  if (!client) return unavailable;
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authRedirect('/auth/update-password'),
  });
  if (error) return { ok: false, message: describeAuthError(error) };
  // Supabase answers the same whether or not the address has an account, and so does this.
  return { ok: true, message: 'If an account uses that address, a reset link is on its way.' };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const client = getCloudClient();
  if (!client) return unavailable;
  if (password.length < 8)
    return { ok: false, message: 'Choose a longer password: at least 8 characters.' };
  const { error } = await client.auth.updateUser({ password });
  return error
    ? { ok: false, message: describeAuthError(error) }
    : { ok: true, message: 'Your password has been changed.' };
}

export async function updateDisplayName(name: string): Promise<AuthResult> {
  const client = getCloudClient();
  if (!client) return unavailable;
  const trimmed = name.trim().slice(0, 120);
  const { data: user } = await client.auth.getUser();
  if (!user.user) return { ok: false, message: 'Sign in first.' };
  const { error } = await client.auth.updateUser({ data: { full_name: trimmed || null } });
  if (error) return { ok: false, message: describeAuthError(error) };
  await client
    .from('profiles')
    .update({ display_name: trimmed || null, updated_at: new Date().toISOString() })
    .eq('id', user.user.id);
  return { ok: true, message: 'Saved.' };
}
