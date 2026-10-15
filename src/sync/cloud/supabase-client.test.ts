import { describe, expect, it } from 'vitest';

import { isSecretKey, readCloudConfig } from './supabase-client';

const jwt = (payload: Record<string, unknown>) =>
  `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.sig`;

describe('readCloudConfig', () => {
  it('is unconfigured, not broken, without both variables', () => {
    expect(readCloudConfig({})).toEqual({ problem: 'missing' });
    expect(readCloudConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toEqual({
      problem: 'missing',
    });
  });

  it('accepts a project URL and a publishable key', () => {
    expect(
      readCloudConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
      }),
    ).toEqual({ config: { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_123' } });
  });

  it('accepts the legacy anon key name', () => {
    const read = readCloudConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon' }),
    });
    expect('config' in read).toBe(true);
  });

  it('refuses a secret key placed in a public variable', () => {
    for (const key of ['sb_secret_abc', jwt({ role: 'service_role' })]) {
      expect(
        readCloudConfig({
          NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toEqual({ problem: 'secret-key' });
    }
  });

  it('refuses a plain-HTTP project that is not on this machine', () => {
    expect(
      readCloudConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'http://abc.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1',
      }),
    ).toEqual({ problem: 'invalid-url' });
    expect(
      'config' in
        readCloudConfig({
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1',
        }),
    ).toBe(true);
  });
});

describe('isSecretKey', () => {
  it('does not mistake a publishable or anon key for a secret', () => {
    expect(isSecretKey('sb_publishable_abc')).toBe(false);
    expect(isSecretKey(jwt({ role: 'anon' }))).toBe(false);
  });
});
