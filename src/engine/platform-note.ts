/**
 * What the engine selector says after a native engine's name.
 *
 * One rule, pure, unit-tested, used by every place that lists engines. The
 * note answers the only question a person choosing an engine has: *can I
 * run this here, and if not, where?* Three facts decide it — where the page
 * is served from (`reach`), which operating system the browser is on
 * (`family`), and where the engine publishes builds (`platforms`).
 *
 * The rule exists because the previous notes were true and misleading at
 * once. On a Mac the Windows-only engines said "Windows only", which read as
 * "buy a Windows machine and you will have them"; on a Windows machine every
 * native engine said "Mac app only", which read as a sales pitch. Neither is
 * a path a person on the public site can take — no engine runs in a browser,
 * and there is no Kingfisher for Windows — so on the public site the note
 * says what is true *for that person*: on a Mac, that the Mac application
 * runs it; anywhere else, that it is not available in the browser.
 */

import type { CompanionReach } from '@/companion/reach';

import { publishedPlatformWords } from './registry';

export type PlatformFamily = 'darwin' | 'win32' | 'linux';

export interface EngineNoteInput {
  /** `transport === 'native'`; a browser engine gets no note. */
  readonly native: boolean;
  /** Companion platform ids the engine publishes for; absent means anywhere. */
  readonly platforms?: readonly string[];
  /** The operating system the browser runs on, once known. */
  readonly family: PlatformFamily | null;
  /** Where the page is served from — see `companion/reach.ts`. */
  readonly reach: CompanionReach;
  /** A companion is answering. */
  readonly paired: boolean;
  /** The companion reports this engine installed. */
  readonly installed: boolean;
}

const publishedFor = (platforms: readonly string[] | undefined, family: PlatformFamily | null) =>
  platforms === undefined ||
  family === null ||
  platforms.some((id) => id === family || id.startsWith(`${family}-`));

export function engineNote(input: EngineNoteInput): string {
  if (!input.native) return '';
  if (input.paired) return input.installed ? '' : ' — not installed';
  const hereFamily = input.family;
  if (input.reach === 'remote') {
    // The public site: no companion can answer it, whatever the machine.
    if (hereFamily === 'darwin' && publishedFor(input.platforms, 'darwin'))
      return ' — Mac app only';
    return ' — not available in the browser';
  }
  // The Mac application, or a checkout on localhost: a companion can run it,
  // if the engine is published for this machine at all.
  if (!publishedFor(input.platforms, hereFamily)) {
    return ` — ${publishedPlatformWords(input.platforms)} only`;
  }
  return ' — needs the companion';
}

/** The browser's operating-system family, in the registry's terms; null on the server. */
export function browserPlatformFamily(): PlatformFamily | null {
  if (typeof navigator === 'undefined') return null;
  const agent = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(agent)) return 'darwin';
  if (/Windows/.test(agent)) return 'win32';
  if (/Linux/.test(agent)) return 'linux';
  return null;
}
