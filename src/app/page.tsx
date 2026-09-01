import { redirect } from 'next/navigation';

/** The application opens into the analysis workspace, not a landing page. */
export default function Home() {
  redirect('/analysis');
}
