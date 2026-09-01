import { GamesWorkspace } from '@/features/games/GamesWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function GamesPage() {
  return (
    <AppShell>
      <GamesWorkspace />
    </AppShell>
  );
}
