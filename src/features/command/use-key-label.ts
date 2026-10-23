'use client';

/**
 * The key an action is bound to now, as the palette and the menus print it.
 *
 * Every hint beside a menu item or a command used to be a string written by
 * hand next to it, and they drifted: "Move variation up" was labelled ⇧P in
 * two places for as long as its key had been ⇧↑, and a key the person rebound
 * went on showing the old one. Reading the binding from the same table the
 * handler resolves against makes a printed key necessarily the real one.
 */

import { useCallback, useMemo } from 'react';

import { useShortcuts } from '@/stores/shortcuts-store';

import { formatBinding } from './bindings';
import { DEFAULT_BINDINGS } from './shortcuts';

export function useKeyLabel(): (action: string) => string | undefined {
  const overrides = useShortcuts((state) => state.overrides);
  const bindings = useMemo(() => ({ ...DEFAULT_BINDINGS, ...overrides }), [overrides]);
  return useCallback(
    (action: string) => {
      const binding = bindings[action];
      return binding ? formatBinding(binding) : undefined;
    },
    [bindings],
  );
}
