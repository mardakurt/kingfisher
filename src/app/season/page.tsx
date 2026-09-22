import type { Metadata } from 'next';

import { AppShell } from '@/features/shell/AppShell';
import { SeasonWorkspace } from '@/features/season/SeasonWorkspace';
import { parseNamedSet } from '@/season/named-set';

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

export default async function SeasonPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly set?: string | readonly string[];
    readonly event?: string | readonly string[];
    readonly site?: string | readonly string[];
    readonly opening?: string | readonly string[];
    readonly mixed?: string | readonly string[];
  }>;
}) {
  const predicate = parseNamedSet(await searchParams);
  return (
    <AppShell>
      <SeasonWorkspace predicate={predicate} />
    </AppShell>
  );
}
