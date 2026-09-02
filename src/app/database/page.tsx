import { redirect } from 'next/navigation';

export default function LegacyDatabasePage() {
  redirect('/databases');
}
