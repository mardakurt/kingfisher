'use client';

/**
 * Finishing a Lichess sign-in.
 *
 * Three outcomes and all three are said out loud: connected, cancelled, or
 * failed with the reason Lichess gave. The one thing this must never do is
 * leave somebody on a blank page wondering whether it worked — which is what a
 * silent redirect back to the app would do when the exchange failed.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { BrandMark } from '@/features/shell/BrandMark';
import { Button } from '@/components/ui/Button';
import { Check, Warning } from '@/components/icons';
import {
  exchangeCode,
  LichessAuthError,
  readCallback,
  takePkceRequest,
} from '@/database/providers/lichess-pkce';
import { usePreferences } from '@/stores/preferences-store';

type State =
  | { readonly kind: 'working' }
  | { readonly kind: 'done'; readonly account: string }
  | { readonly kind: 'failed'; readonly message: string; readonly remedy?: string };

export function LichessCallback() {
  const router = useRouter();
  const setPreference = usePreferences((state) => state.set);
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        // Consumed here, before anything can be retried: an authorization code
        // is single-use and the verifier must not outlive it.
        const { code, request } = readCallback(params, takePkceRequest());
        const token = await exchangeCode(code, request);

        /*
          This page's whole job is to never leave somebody wondering whether
          the sign-in worked, and a fetch with no deadline does exactly that:
          a stalled connection here left "Connecting…" on screen for ever,
          with no error path able to run. Eight seconds, matching the other
          Lichess calls, and then it says so.
        */
        const response = await fetch('https://lichess.org/api/account', {
          signal: AbortSignal.timeout(8_000),
          headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new LichessAuthError(
            `Lichess issued a token but would not identify the account (HTTP ${response.status}).`,
            'Try connecting again.',
          );
        }
        const account = (await response.json()) as { username?: unknown };
        const username = typeof account.username === 'string' ? account.username : 'your account';

        if (!live) return;
        setPreference('lichessToken', token.accessToken);
        setPreference('rememberLichessToken', true);
        setPreference('lichessUsername', username);
        setState({ kind: 'done', account: username });
      } catch (error) {
        if (!live) return;
        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : 'The sign-in could not be completed.',
          ...(error instanceof LichessAuthError && error.remedy ? { remedy: error.remedy } : {}),
        });
      } finally {
        // The code and state are removed from the address bar either way, so a
        // reload cannot replay a consumed code or leave one in history.
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [setPreference]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-0 p-6">
      <div className="w-full max-w-md rounded-[6px] border border-line bg-surface-1 p-6 text-center">
        <BrandMark className="mx-auto h-10 w-10 text-accent" />
        {state.kind === 'working' ? (
          <>
            <h1 className="mt-4 text-base font-semibold text-primary">Finishing the sign-in…</h1>
            <p className="mt-1 text-xs text-tertiary">
              Exchanging the authorization code with Lichess. Nothing is sent anywhere else.
            </p>
          </>
        ) : state.kind === 'done' ? (
          <>
            <Check className="mx-auto mt-4 h-6 w-6 text-success" />
            <h1 className="mt-2 text-base font-semibold text-primary">
              Connected as {state.account}
            </h1>
            <p className="mt-1 text-xs text-tertiary">
              The token is stored in this browser only. Disconnect at any time in Settings →
              Accounts, which also revokes it with Lichess.
            </p>
            <Button variant="accent" className="mt-4" onClick={() => router.push('/analysis')}>
              Back to Kingfisher
            </Button>
          </>
        ) : (
          <>
            <Warning className="mx-auto mt-4 h-6 w-6 text-caution" />
            <h1 className="mt-2 text-base font-semibold text-primary">Not connected</h1>
            <p className="mt-1 text-xs text-secondary">{state.message}</p>
            {state.remedy ? <p className="mt-1 text-xs text-tertiary">{state.remedy}</p> : null}
            <Button className="mt-4" onClick={() => router.push('/analysis')}>
              Back to Kingfisher
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
