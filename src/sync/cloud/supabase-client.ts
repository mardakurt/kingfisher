/**
 * The one Supabase client, or `null` when this build has no project.
 *
 * Accounts are optional twice over: a person need not sign in, and a build
 * need not be configured. A checkout without `NEXT_PUBLIC_SUPABASE_URL` and a
 * publishable key is a complete local-first Kingfisher whose account pages
 * say accounts are not set up here — never a broken sign-in form.
 *
 * Only the publishable key may reach the browser. It grants nothing by
 * itself: every table refuses `anon`, and Row Level Security admits a signed
 * in user to their own rows only (`supabase/migrations/`). A service-role or
 * secret key would bypass all of that, so one that has been put in a public
 * variable by mistake is refused here rather than used.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CloudConfig {
  readonly url: string;
  readonly publishableKey: string;
}

/** Why a configuration was refused, for the account page to say. */
export type CloudConfigProblem = 'missing' | 'secret-key' | 'invalid-url';

export function readCloudConfig(
  env: Readonly<Record<string, string | undefined>> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
): { readonly config: CloudConfig } | { readonly problem: CloudConfigProblem } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''
  ).trim();
  if (!url || !key) return { problem: 'missing' };
  if (isSecretKey(key)) return { problem: 'secret-key' };
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !local) return { problem: 'invalid-url' };
  } catch {
    return { problem: 'invalid-url' };
  }
  return { config: { url: url.replace(/\/+$/, ''), publishableKey: key } };
}

/** A key that must never be in a browser: the new secret format, or a legacy JWT for `service_role`. */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: unknown;
    };
    return payload.role === 'service_role' || payload.role === 'supabase_admin';
  } catch {
    return false;
  }
}

let client: Promise<SupabaseClient | null> | undefined;

/**
 * Development and browser-test builds only: a page may name its own project
 * before the client starts, so the Playwright suite can run the real
 * supabase-js against a stubbed transport without configuring every other
 * suite as signed-out-but-configured. `NODE_ENV` is inlined at build time, so
 * a production bundle contains neither the branch nor the global's name.
 */
function developmentOverride(): Record<string, string | undefined> | null {
  if (process.env.NODE_ENV === 'production') return null;
  const override = (window as { __kingfisherCloudConfig?: { url?: string; key?: string } })
    .__kingfisherCloudConfig;
  if (!override) return null;
  return {
    NEXT_PUBLIC_SUPABASE_URL: override.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: override.key,
  };
}

/**
 * The client, loaded on first use.
 *
 * supabase-js is imported dynamically: a build with no account service, and
 * every page before anybody signs in, pays nothing for it. The configuration
 * check is synchronous (`cloudConfigProblem`) so screens can decide what to
 * show without waiting for the library.
 */
export function getCloudClient(): Promise<SupabaseClient | null> {
  if (client !== undefined) return client;
  if (typeof window === 'undefined') return Promise.resolve(null);
  const override = developmentOverride();
  const read = override ? readCloudConfig(override) : readCloudConfig();
  if ('problem' in read) {
    if (read.problem === 'secret-key') {
      console.error(
        'Kingfisher refused a Supabase secret key in a public variable. Use the publishable key.',
      );
    }
    client = Promise.resolve(null);
    return client;
  }
  const { url, publishableKey } = read.config;
  client = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, publishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'kingfisher.auth',
      },
    }),
  );
  return client;
}

export function cloudConfigProblem(): CloudConfigProblem | null {
  const override = typeof window === 'undefined' ? null : developmentOverride();
  const read = override ? readCloudConfig(override) : readCloudConfig();
  return 'problem' in read ? read.problem : null;
}
