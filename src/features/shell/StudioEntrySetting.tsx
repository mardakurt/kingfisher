'use client';

/**
 * The landing-page choice, from inside the Studio.
 *
 * "Open the Studio straight away next time" is offered on the landing to a
 * returning browser (`app/landing/StudioEntry.tsx`), and until Phase 72 the
 * only place to undo it was `/?stay` — an address the person had to
 * remember. And the landing's own checkbox appears only where this browser
 * has already visited the Studio, so on a device where the Studio runs as an
 * installed web app (its own storage, apart from the browser's) the landing
 * never showed it at all. The choice is a fact about this browser, kept in
 * `localStorage`, so it belongs where every other fact about this browser is
 * set: Settings. Same key, same rule (`studio-entry.ts`), read through
 * `useSyncExternalStore` so a change on the landing in another tab shows
 * here too.
 *
 * Not shown in the Mac application: its window opens on the Studio and never
 * loads the landing, so there is nothing to skip.
 */

import { useSyncExternalStore } from 'react';

import { Toggle } from '@/components/ui/Toggle';
import { isDesktop } from '@/desktop/bridge';
import { publicUrl } from '@/release/public-urls';

import { autoOpenStudio, setAutoOpenStudio, STAY_PARAM } from './studio-entry';

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
const read = () => autoOpenStudio(storage());

export function StudioEntrySetting() {
  const on = useSyncExternalStore(subscribe, read, () => false);
  // Hidden in the desktop shell, which never loads the landing.
  if (isDesktop()) return null;
  const landing = publicUrl.landing;
  return (
    <div className="flex items-start justify-between gap-4" data-studio-entry-setting>
      <div className="min-w-0">
        <div className="text-xs text-primary">Skip the landing page</div>
        <p className="mt-0.5 text-2xs leading-relaxed text-tertiary">
          Open the Studio straight away when this browser visits{' '}
          <span className="font-mono text-[11px]">{landing.replace(/^https?:\/\//, '')}</span>. The
          choice is kept in this browser only. With it on, the landing is still one address away:{' '}
          <span className="font-mono text-[11px]">{`/?${STAY_PARAM}`}</span>.
        </p>
      </div>
      <Toggle
        label="Skip the landing page and open the Studio straight away"
        checked={on}
        onChange={(value) => {
          setAutoOpenStudio(storage(), value);
          listeners.forEach((listener) => listener());
        }}
      />
    </div>
  );
}
