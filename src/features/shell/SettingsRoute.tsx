'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useUi } from '@/stores/ui-store';

/**
 * Makes Settings a real deep link while keeping the dialog as the single
 * settings surface. Closing a directly opened dialog returns to Analysis.
 */
export function SettingsRoute() {
  const router = useRouter();
  const settingsOpen = useUi((state) => state.settingsOpen);
  const setSettingsOpen = useUi((state) => state.setSettingsOpen);
  const hasRenderedOpen = useRef(false);

  useEffect(() => {
    setSettingsOpen(true);

    return () => setSettingsOpen(false);
  }, [setSettingsOpen]);

  useEffect(() => {
    if (settingsOpen) {
      hasRenderedOpen.current = true;
    } else if (hasRenderedOpen.current) {
      router.replace('/analysis');
    }
  }, [router, settingsOpen]);

  return <div className="flex min-h-0 flex-1 bg-surface-0" aria-hidden />;
}
