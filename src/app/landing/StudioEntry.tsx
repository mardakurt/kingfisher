'use client';

/**
 * The one piece of the landing that knows who is looking at it.
 *
 * The page is otherwise static and identical for everyone — which is right
 * for a first visit and for a crawler, and wrong for the player who opens
 * the address every morning to get to their repertoire. This component
 * reads what the Studio left in this browser (`studio-entry.ts`) after the
 * page has painted, and does one of three things:
 *
 *  - nothing, for a browser that has never opened the Studio;
 *  - shows a "continue" line under the hero's buttons, with a checkbox for
 *    opening the Studio straight away next time;
 *  - sends the browser to the Studio at once, when that box was ticked and
 *    the URL does not say `?stay`.
 *
 * The line has a reserved height whether or not it is shown, so a returning
 * visitor's page does not jump when the script arrives. The redirect uses
 * `location.replace` so the landing does not stay in the history as a page
 * the back button lands on and immediately leaves again.
 */

import { useEffect, useSyncExternalStore, type JSX } from 'react';

import { landingEntryFor, setAutoOpenStudio, STAY_PARAM } from '@/features/shell/studio-entry';

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

/*
  The browser's storage is an external system, so it is read through
  `useSyncExternalStore`: the server snapshot is the first visit (which is
  what the server renders for everyone), the client snapshot is the rule's
  answer for this browser, and a write from the checkbox — or from the
  Studio in another tab — is what tells React to read again.
*/
type Snapshot = 'first-visit' | 'returning' | 'returning-auto' | 'open-studio';

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
const notify = () => listeners.forEach((listener) => listener());
const read = (): Snapshot => {
  const entry = landingEntryFor(storage(), window.location.search);
  if (entry.kind === 'returning') return entry.autoOpen ? 'returning-auto' : 'returning';
  return entry.kind;
};
/*
  Whether to leave is decided once, from what storage held when the page
  loaded, and remembered: React reads a snapshot more than once per render
  and expects the same answer each time. Ticking the box is a choice about
  next time — the person is on the landing and stays on it, with the box
  shown ticked, until they visit again — so a later read that says
  "open-studio" is reported as "returning-auto".
*/
let onLoad: Snapshot | null = null;
const snapshot = (): Snapshot => {
  onLoad ??= read();
  if (onLoad === 'open-studio') return 'open-studio';
  const now = read();
  return now === 'open-studio' ? 'returning-auto' : now;
};
const serverSnapshot = (): Snapshot => 'first-visit';

export function StudioEntry({ studioUrl }: { readonly studioUrl: string }): JSX.Element {
  const entry = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (entry === 'open-studio') window.location.replace(studioUrl);
  }, [entry, studioUrl]);

  if (entry !== 'returning' && entry !== 'returning-auto') {
    return <div className="hero-return" aria-hidden="true" />;
  }
  const autoOpen = entry === 'returning-auto';

  return (
    <div className="hero-return" data-studio-entry="returning">
      <a className="hero-return-link" href={studioUrl} rel="noopener">
        Continue in Studio
        <span aria-hidden="true"> →</span>
      </a>
      <label className="hero-return-choice">
        <input
          type="checkbox"
          checked={autoOpen}
          onChange={(event) => {
            setAutoOpenStudio(storage(), event.target.checked);
            notify();
          }}
        />
        <span>
          Open the Studio straight away next time
          {autoOpen ? (
            <>
              {' '}
              <span className="hero-return-note">
                (this page stays at <code>/?{STAY_PARAM}</code>)
              </span>
            </>
          ) : null}
        </span>
      </label>
    </div>
  );
}
