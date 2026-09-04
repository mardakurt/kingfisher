import { PlayersWorkspace } from '@/features/player/PlayersWorkspace';
import { AppShell } from '@/features/shell/AppShell';

/**
 * Browsing every player the installed reference sources know, plus the
 * historical roster. Distinct from `/player/[id]`, which is one person.
 */
export default function PlayersPage() {
  return (
    <AppShell>
      <PlayersWorkspace />
    </AppShell>
  );
}
