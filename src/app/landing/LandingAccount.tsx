'use client';

import { useEffect } from 'react';

import { useAccount } from '@/stores/account-store';

/**
 * Sign in, or the account, beside "Open Studio" — only where accounts exist.
 *
 * On a build without an account service this renders nothing, so the
 * public landing does not offer a sign-in that leads to "not set up here".
 * It is one of the page's two client components; the rest stays server-rendered.
 */
export function LandingAccount() {
  const status = useAccount((state) => state.status);
  useEffect(() => useAccount.getState().init(), []);
  if (status === 'signed-in') {
    return (
      <a className="nav-account" href="/account">
        Account
      </a>
    );
  }
  if (status === 'signed-out') {
    return (
      <a className="nav-account" href="/sign-in?next=/analysis">
        Sign in
      </a>
    );
  }
  return null;
}
