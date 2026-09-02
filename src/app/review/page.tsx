import { AppShell } from '@/features/shell/AppShell';
import { ReviewWorkspace } from '@/features/review/ReviewWorkspace';

export default function ReviewPage() {
  return (
    <AppShell>
      <ReviewWorkspace />
    </AppShell>
  );
}
