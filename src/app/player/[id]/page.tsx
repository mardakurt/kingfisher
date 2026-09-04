import { PlayerWorkspace } from '@/features/player/PlayerWorkspace';
import { AppShell } from '@/features/shell/AppShell';

/**
 * A profile exists for every name in the collection.
 *
 * The route parameter is the canonical player key, which the database already
 * stores on every game — so no record has to be created before a player can be
 * looked at, and a link from a game list is one `encodeURIComponent` away.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PlayerWorkspace playerId={decodeURIComponent(id)} />
    </AppShell>
  );
}
