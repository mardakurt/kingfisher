'use client';

/**
 * Facts about the position itself.
 *
 * Structure and tablebase share a tab because they answer the same kind of
 * question — what is *true* of this board, as opposed to what an engine
 * currently believes or what a database has seen. Keeping them apart cost a
 * tab in a panel that already had too many, and the two are read together
 * anyway: an endgame's structure and its tablebase verdict are one thought.
 */

import { useState } from 'react';

import { Segmented } from '@/components/ui/Tabs';

import { FeaturesPanel } from './FeaturesPanel';
import { TablebasePanel } from './TablebasePanel';

type View = 'structure' | 'tablebase';

export function PositionPanel() {
  const [view, setView] = useState<View>('structure');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line-subtle px-2.5 py-1.5">
        <Segmented
          items={[
            { id: 'structure' as const, label: 'Structure' },
            { id: 'tablebase' as const, label: 'Tablebase' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <div className="min-h-0 flex-1">
        {view === 'structure' ? <FeaturesPanel /> : <TablebasePanel />}
      </div>
    </div>
  );
}
