'use client';

/**
 * One engine, or two.
 *
 * The comparison is not a different kind of panel — it is the engine panel with
 * a second opinion in it — so it lives behind a switch here rather than taking
 * a tab of its own in a strip that already had too many.
 */

import { useState } from 'react';

import { Segmented } from '@/components/ui/Tabs';

import { EngineComparison } from './EngineComparison';
import { EnginePanel } from './EnginePanel';

type View = 'single' | 'compare';

export function EnginePanelHost() {
  const [view, setView] = useState<View>('single');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line-subtle px-2.5 py-1.5">
        <Segmented
          items={[
            { id: 'single' as const, label: 'One engine' },
            { id: 'compare' as const, label: 'Two engines' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <div className="min-h-0 flex-1">
        {view === 'single' ? <EnginePanel /> : <EngineComparison />}
      </div>
    </div>
  );
}
