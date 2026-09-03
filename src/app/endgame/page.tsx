import { EndgameWorkspace } from '@/features/endgame/EndgameWorkspace';
import { AppShell } from '@/features/shell/AppShell';

export default function EndgamePage() {
  return (
    <AppShell>
      <EndgameWorkspace />
    </AppShell>
  );
}
