/**
 * Kingfisher's view of the desktop shell.
 *
 * The whole of the application's knowledge that it might be running inside an
 * application window is this file. Nothing else imports Electron, nothing else
 * reads `window.kingfisher`, and every feature that gains something on the
 * desktop — a native file dialog, a document opened from the Finder — asks
 * here and gets `null` in a browser.
 *
 * That shape is deliberate and it is a rule, not a preference. Kingfisher has
 * two identities, and a component that behaved differently depending on which
 * one it was in would have to be tested twice and would drift once. So the
 * desktop never changes what a feature *does*; it only changes whether an
 * extra way of reaching it exists.
 */

export interface DesktopDocument {
  readonly kind: 'pgn' | 'database';
  readonly path: string;
  readonly name: string;
  /** The file's text. Present for a PGN, absent for a database opened in place. */
  readonly text?: string;
}

export interface DesktopChoice {
  readonly canceled: boolean;
  readonly path?: string;
  readonly paths?: readonly string[];
}

export interface DesktopDiagnostics {
  readonly shell: { readonly name: string; readonly version: string; readonly chrome: string };
  readonly node: string;
  readonly packaged: boolean;
  readonly web: { readonly running: boolean; readonly pid: number | null; readonly url: string };
  readonly companion: {
    readonly running: boolean;
    readonly pid: number | null;
    readonly url: string;
    readonly log: readonly string[];
  };
}

export interface DesktopBridge {
  readonly platform: 'desktop';
  readonly os: string;
  readonly version: string | null;
  readonly companion: { readonly url: string | null; readonly token: string | null };
  openPgn(): Promise<DesktopChoice>;
  openDatabase(): Promise<DesktopChoice>;
  chooseDirectory(options?: { title?: string }): Promise<DesktopChoice>;
  chooseFile(options?: { title?: string; extensions?: readonly string[] }): Promise<DesktopChoice>;
  pathForFile(file: File): string | null;
  openPaths(paths: readonly string[]): Promise<{ opened: number }>;
  recentDocuments(): Promise<readonly DesktopDocument[]>;
  diagnostics(): Promise<DesktopDiagnostics>;
  onOpenDocument(listener: (document: DesktopDocument) => void): () => void;
  onShowDiagnostics(listener: () => void): () => void;
}

declare global {
  interface Window {
    kingfisher?: DesktopBridge;
  }
}

/**
 * The bridge, or null.
 *
 * A function rather than a constant because the module is imported during a
 * server render, where there is no `window` at all — and because a constant
 * evaluated at import time would be captured before the preload had run in at
 * least one ordering.
 */
export function desktop(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.kingfisher;
  return bridge && bridge.platform === 'desktop' ? bridge : null;
}

/** Whether this Kingfisher is the application rather than the web page. */
export const isDesktop = (): boolean => desktop() !== null;
