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
  /**
   * The machine, from the process that is on it.
   *
   * A renderer cannot find this out. `navigator.userAgent` is frozen and
   * describes Chromium; on Apple silicon it still reports "Intel Mac OS X", so
   * an M-series Mac and a 2019 Intel Mac produce identical bug reports — and
   * they are not the same bug report the moment a native engine is involved,
   * because the arm64 and x64 builds are different downloads.
   */
  readonly platform: { readonly os: string; readonly arch: string; readonly release: string };
  /** Where the shell's own log is, so Diagnostics can name it and open it. */
  readonly logPath: string | null;
  readonly packaged: boolean;
  /**
   * The build, not just the version. Two `1.0.0`s from different commits are
   * different programs; `channel` says whether this is a signed release, a
   * current-master preview from the landing, or a developer's own build.
   * Absent from a shell built before the identity existed.
   */
  readonly build?: {
    readonly version: string;
    readonly number: number | null;
    readonly commit: string | null;
    readonly channel: 'stable' | 'preview' | 'dev';
    readonly dirty: boolean;
    readonly label: string;
  };
  readonly web: { readonly running: boolean; readonly pid: number | null; readonly url: string };
  readonly companion: {
    readonly running: boolean;
    readonly pid: number | null;
    readonly url: string;
    readonly log: readonly string[];
  };
  /**
   * What launch cost, stage by stage, in milliseconds from process start.
   *
   * Kept in the product rather than in a benchmark script because a launch
   * regression is invisible otherwise: it is the one measurement nobody takes
   * until somebody complains, and by then it is several changes old.
   */
  readonly startup?: readonly { readonly stage: string; readonly at: number }[];
}

/**
 * Where the operating system's own window buttons are, and what they cost.
 *
 * Present only on macOS, where the shell hides the title bar and the three
 * traffic lights are drawn over the top-left of the web contents. `trafficLight`
 * is what macOS paints; `safe` is the rectangle the application must leave
 * empty, which is the same thing plus a gutter.
 *
 * Null on Windows and Linux — those shells keep a real title bar — and absent
 * altogether in a browser, which is what stops the web build from growing a
 * spacer for a control it does not have.
 */
export interface WindowChrome {
  readonly kind: 'mac-hidden-titlebar';
  readonly trafficLight: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly safe: { readonly width: number; readonly height: number };
}

export interface DesktopBridge {
  readonly platform: 'desktop';
  readonly os: string;
  readonly version: string | null;
  readonly windowChrome: WindowChrome | null;
  readonly companion: { readonly url: string | null; readonly token: string | null };
  openPgn(): Promise<DesktopChoice>;
  openDatabase(): Promise<DesktopChoice>;
  chooseDirectory(options?: { title?: string }): Promise<DesktopChoice>;
  chooseFile(options?: { title?: string; extensions?: readonly string[] }): Promise<DesktopChoice>;
  pathForFile(file: File): string | null;
  openPaths(paths: readonly string[]): Promise<{ opened: number }>;
  recentDocuments(): Promise<readonly DesktopDocument[]>;
  diagnostics(): Promise<DesktopDiagnostics>;
  /**
   * Start the companion again after it has died. The shell reuses the same
   * port and token, so the pairing the renderer already holds keeps working.
   * Absent from a shell built before Phase 46.
   */
  readonly restartCompanion?: () => Promise<{
    readonly restarted: boolean;
    readonly running: boolean;
    readonly error?: string | null;
  }>;
  /**
   * Reveal the shell's log in the Finder.
   *
   * Reveal rather than read: the renderer never gets file contents over the
   * bridge, which is the same rule as everywhere else here — everything
   * readable was chosen in a dialog or dropped on the window. Handing a support
   * log to the operating system's file browser gets the user to it without
   * `readFile(path)` existing at all.
   */
  openLogs(): Promise<boolean>;
  onOpenDocument(listener: (document: DesktopDocument) => void): () => void;
  onShowDiagnostics(listener: () => void): () => void;
  onShowSettings(listener: () => void): () => void;
  /**
   * Phase 35: the renderer-facing surface of the desktop update service.
   *
   * The renderer never makes the HTTPS request to GitHub, never sees the
   * manifest, and never sees the asset URL. The main process owns the
   * network, the download, the SHA-256 verification and the dialog. The
   * three calls the renderer needs are:
   *
   *   - `updateStatus()` to read the current verdict when a Settings
   *      panel mounts, so it does not start at *idle* if a check has
   *      already been run;
   *   - `subscribeUpdates(listener)` to receive every verdict the main
   *      process emits, including the progress events while a download
   *      is running;
   *   - `showUpdateDialog()` to open the small native dialog from a
   *      control in the application (Settings, command palette).
   *
   * The check itself is **manual** — it runs only because the user
   * clicked the macOS menu item, the Settings button, or the command
   * palette entry. There is no auto-update and no background poller.
   */
  updateStatus(): Promise<unknown>;
  subscribeUpdates(listener: (verdict: unknown) => void): () => void;
  showUpdateDialog(): void;
  /**
   * Phase 37: a single IPC channel the main process uses to ask the
   * renderer whether its authored writes are committed, before it
   * replaces the running app. The handler is registered once on
   * mount; the main process is single-flight on the install side.
   *
   * The handler must answer with a `SaveBarrierResponse` shape
   * (see `save-barrier-handler.ts`):
   *   - `{ ok: true }` when no in-flight write is open;
   *   - `{ ok: false, reason: 'pending-writes' | 'write-failed' }`
   *     otherwise.
   *
   * A handler that throws is treated as `write-failed` by the
   * main process — the install is refused. The renderer's preload
   * already wraps the registered function in a try/catch; the
   * renderer's handler module does its own too.
   */
  onSaveBarrierRequest(
    listener: (requestId: string) => Promise<{
      ok: boolean;
      reason?: 'pending-writes' | 'write-failed';
      detail?: string;
    }>,
  ): () => void;
  /**
   * Phase 37: acknowledge that the user has seen a "Kingfisher was
   * updated" notice. The main process records this in
   * `userData/kingfisher-update-state.json` so the next launch can
   * tell the difference between "new version, first launch" and
   * "same version, normal launch".
   *
   * The version argument is the application's current version, so
   * the main process can compare it to the last acknowledged one
   * before sending the `kingfisher:update-installed` event in the
   * first place. The renderer never has to invent that comparison.
   */
  acknowledgeUpdate(version: string): Promise<void>;
  /**
   * Phase 37: subscribe to the one-shot "this app was just
   * installed over a previous version" event. The main process
   * sends it on the first did-finish-load of a build that is
   * strictly newer than the one the user has acknowledged. The
   * renderer is responsible for showing the notice and for
   * calling `acknowledgeUpdate(version)` once the user has seen
   * it.
   */
  onUpdateInstalled(
    listener: (payload: { version: string; previousVersion: string | null }) => void,
  ): () => void;
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

/**
 * The window chrome this Kingfisher has to work around, or null.
 *
 * Null is the answer in a browser and on every platform whose shell keeps a
 * real title bar, and callers must treat it as "reserve nothing" rather than as
 * a missing value to substitute a default for. A default would be a second
 * source of truth for the one rectangle two processes have to agree about.
 */
export function windowChrome(): WindowChrome | null {
  return desktop()?.windowChrome ?? null;
}
