import { LichessCallback } from '@/features/shell/LichessCallback';

/**
 * Where Lichess sends the browser back to after a sign-in.
 *
 * Its own route rather than the page the user was on, so a URL carrying
 * `?code=` can never be mistaken for an ordinary navigation and the code is
 * consumed and removed before anything else renders. Deliberately outside the
 * application shell: this page exists for two seconds and should not mount a
 * workspace, an engine or a database to do it.
 */
export default function LichessOAuthPage() {
  return <LichessCallback />;
}
