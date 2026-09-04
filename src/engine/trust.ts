/**
 * What running an engine actually means, stated in the words that are true.
 *
 * There are three ways an engine gets into Kingfisher and they do not carry
 * the same risk. Blurring them — as "sandboxed engine" would — is the kind of
 * claim that reads well and is false, so this file writes each one down
 * precisely and the UI shows it beside the engine it describes.
 *
 * The claim Kingfisher deliberately does **not** make is that a native engine
 * is sandboxed. It is not. macOS, Linux and Windows all offer isolation
 * facilities, and none of them can be applied uniformly, from a Node process,
 * to an arbitrary downloaded binary, without either failing on some platforms
 * or degrading the engine. A badge that says "Sandboxed" and means "we checked
 * the SHA-256" is worse than no badge.
 */

export type EngineTrust = 'browser' | 'managed' | 'custom';

export interface TrustLevel {
  readonly id: EngineTrust;
  /** The short label a row shows. Never the word "sandboxed" for a native engine. */
  readonly label: string;
  readonly summary: string;
  /** Exactly what is enforced, in the order it happens. */
  readonly guarantees: readonly string[];
  /** What is *not* enforced. As important as the guarantees, and shown too. */
  readonly limits: readonly string[];
}

export const TRUST_LEVELS: Readonly<Record<EngineTrust, TrustLevel>> = {
  browser: {
    id: 'browser',
    label: 'Sandboxed in the browser',
    summary:
      'Runs as WebAssembly in a dedicated Web Worker. The browser’s own sandbox is the boundary — ' +
      'the same one that contains every other page you open.',
    guarantees: [
      'No access to the page: a Worker has no document, no DOM and no window.',
      'No access to Kingfisher’s state except the UCI lines passed through its message port.',
      'No filesystem and no network beyond what the page itself is allowed.',
      'Terminating the Worker stops the search and frees its memory immediately.',
    ],
    limits: [
      'Slower than the same engine built natively: one thread, and WebAssembly rather than machine code.',
      'Limited by the browser’s memory budget for the tab.',
    ],
  },
  managed: {
    id: 'managed',
    label: 'Verified, runs as you',
    summary:
      'A native program Kingfisher downloaded from the engine project’s own release page and ' +
      'checked before running. It runs with the same operating-system permissions as any other ' +
      'application you launch. It is not sandboxed, and Kingfisher does not claim it is.',
    guarantees: [
      'Downloaded only from the URL recorded in the catalogue, which is the project’s own release.',
      'SHA-256 checked against a digest committed to this repository; a mismatch installs nothing.',
      'Started with an argument array, never through a shell, so nothing can be interpreted as shell syntax.',
      'Requests name a registry key, never a path: no request can start a binary that was not installed.',
      'Proven to speak UCI and to find a move before it is registered at all.',
      'Killed on `quit`, and SIGKILLed shortly after if it ignores it; at most four run at once.',
    ],
    limits: [
      'It is a native process with your user account’s permissions: your files, your network.',
      'The recorded digest proves the download is byte-identical to what this project fetched once. ' +
        'It is not a signature, and no chess engine project publishes signed digests today.',
      'The companion must be running, because a browser cannot start a process.',
    ],
  },
  custom: {
    id: 'custom',
    label: 'Your own program',
    summary:
      'An executable you chose from your own disk. Custom native engines are programs you decide ' +
      'to run, and they have the same operating-system permissions as other applications you launch.',
    guarantees: [
      'Confirmed to be a real executable file before anything is started.',
      'Proven to complete a UCI handshake before it is given a registry key.',
      'Started with an argument array, never through a shell.',
      'Stopped and cleaned up exactly like a managed engine.',
    ],
    limits: [
      'Kingfisher knows nothing about where it came from and checks no digest — you chose it.',
      'It runs with your user account’s permissions.',
      'Its licence is whatever its author says; Kingfisher records "unknown" rather than guessing.',
    ],
  },
};

export const trustOf = (transport: 'worker' | 'native', custom: boolean): EngineTrust =>
  transport === 'worker' ? 'browser' : custom ? 'custom' : 'managed';
