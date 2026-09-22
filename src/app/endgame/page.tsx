import { EndgameWorkspace } from '@/features/endgame/EndgameWorkspace';
import { AppShell } from '@/features/shell/AppShell';
import { ENDGAME_CATEGORIES, type EndgameCategory } from '@/persistence/domain';

export default async function EndgamePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly category?: string | readonly string[] }>;
}) {
  const value = (await searchParams).category;
  const initialCategory =
    typeof value === 'string' && ENDGAME_CATEGORIES.includes(value as EndgameCategory)
      ? (value as EndgameCategory)
      : 'all';
  return (
    <AppShell>
      <EndgameWorkspace initialCategory={initialCategory} />
    </AppShell>
  );
}
