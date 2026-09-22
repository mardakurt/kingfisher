import type { Metadata } from 'next';

import { AppShell } from '@/features/shell/AppShell';
import { SeasonWorkspace } from '@/features/season/SeasonWorkspace';

/**
 * `/season` — a named set of your games joined into one report.
 *
 * The URL is the season: `/season?set=90`, `/season?event=Club%20Open`,
 * `/season?site=Lichess`, `/season?opening=C50`. The picker writes to the
 * URL, so a season can be linked, reloaded and walked back through.
 *
 * See `docs/design/season.md` for the design and §6 of
 * `docs/product/market-research.md` for the brief.
 */

export const metadata: Metadata = {
  title: 'Season',
};

export default function SeasonPage() {
  return (
    <AppShell>
      <SeasonWorkspace />
    </AppShell>
  );
}
