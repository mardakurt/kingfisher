'use client';

/**
 * What running inside the application window changes.
 *
 * Three things, and no more:
 *
 *  1. **The companion is already paired.** On the web a person copies a URL
 *     and a token out of a terminal. Here the shell started the companion, so
 *     it knows both and hands them over — and this writes them into the same
 *     preference the Settings field writes, so every consumer downstream is
 *     unchanged and there is no second configuration path to keep in step.
 *
 *  2. **Documents arrive from outside.** A PGN double-clicked in the Finder, or
 *     dropped on the window, or chosen from File → Open. All three reach the
 *     shell, and the shell sends them here.
 *
 *  3. **A collection can be opened by path.** The companion's `attach` route
 *     refuses anything that is not already a Kingfisher collection, so the
 *     failure a user is most likely to hit — picking the wrong file — comes
 *     back as a sentence they can act on.
 *
 * Everything else about Kingfisher is identical in both, which is the point.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { CompanionClient } from '@/companion/client';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { desktop, type DesktopDocument } from './bridge';
import { installSaveBarrierHandler } from './save-barrier-handler';

export function useDesktopIntegration(): void {
  const setPreference = usePreferences((state) => state.set);
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();

  /*
    Pairing.

    Written through the preference rather than around it, so that Settings
    shows what is actually in use and a desktop session is not a special case
    anywhere below this line. Guarded on the value already being right, because
    this store persists and writing an identical value on every mount would
    churn `localStorage` on a page that reloads often.
  */
  useEffect(() => {
    const bridge = desktop();
    const url = bridge?.companion.url;
    const token = bridge?.companion.token;
    if (!url || !token) return;
    const preferences = usePreferences.getState();
    if (preferences.companionUrl !== url) setPreference('companionUrl', url);
    if (preferences.companionToken !== token) setPreference('companionToken', token);
  }, [setPreference]);

  /*
    Documents.

    A PGN is loaded onto the board through the same `loadPgn` the import dialog
    uses — the desktop adds a way in, never a second implementation. A database
    is handed to the companion, and the source list refreshes itself from the
    status query rather than being told, so the explorer picks it up the same
    way it picks up a collection created in the application.
  */
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;

    const open = async (document: DesktopDocument) => {
      if (document.kind === 'pgn') {
        if (typeof document.text !== 'string') return;
        const result = useAnalysis.getState().loadPgn(document.text);
        if (!result.ok) {
          notify({
            tone: 'error',
            message: `${document.name} could not be read`,
            detail: result.error.message,
          });
          return;
        }
        notify({
          tone: 'success',
          message: `Opened ${document.name}`,
          detail:
            result.value.games > 1
              ? `${result.value.games} games; the first is on the board.`
              : undefined,
        });
        return;
      }

      const { companionUrl, companionToken } = usePreferences.getState();
      if (!companionUrl || !companionToken) {
        notify({
          tone: 'error',
          message: `${document.name} could not be opened`,
          detail: 'The companion is not running, and a SQLite collection is read through it.',
        });
        return;
      }
      try {
        const attached = await new CompanionClient({
          url: companionUrl,
          token: companionToken,
        }).attachDatabase(document.path);
        await queryClient.invalidateQueries({ queryKey: ['companion', 'status'] });
        notify({
          tone: 'success',
          message: `Opened ${attached.name}`,
          detail: `${attached.games.toLocaleString('en-GB')} games. It is in the source list now.`,
        });
      } catch (error) {
        notify({
          tone: 'error',
          message: `${document.name} could not be opened`,
          detail: error instanceof Error ? error.message : undefined,
        });
      }
    };

    return bridge.onOpenDocument((document) => {
      void open(document);
    });
  }, [notify, queryClient]);

  /*
    Files dropped on the window.

    The browser already accepts a dropped PGN through the import dialog; what
    it cannot do is open a *database* that way, because a dropped file in a
    page is content and not a path. `pathForFile` is the shell turning the drop
    back into the choice the user actually made.
  */
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    const swallow = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      const paths = files
        .map((file) => bridge.pathForFile(file))
        .filter((p): p is string => Boolean(p));
      if (paths.length === 0) return;
      event.preventDefault();
      void bridge.openPaths(paths);
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', drop);
    };
  }, []);

  /** The shell's Diagnostics menu item opens the settings section that has them. */
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    return bridge.onShowDiagnostics(() => {
      useUi.getState().openSettingsAt('companion');
    });
  }, []);

  /**
   * The shell's Settings… menu item (and the macOS `Cmd+,` accelerator)
   * opens the settings dialog. The web build has no menu and no
   * listener, which is the point of the bridge: this only happens
   * when the shell is in front of the application.
   */
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    return bridge.onShowSettings(() => {
      useUi.getState().setSettingsOpen(true);
    });
  }, []);

  /**
   * Full screen, as one attribute on the root.
   *
   * The shell reports the window's own `enter-full-screen` and
   * `leave-full-screen`; this writes `data-fullscreen` and nothing else. The
   * geometry lives in CSS — `globals.css` collapses `--titlebar-safe-w` and
   * `--titlebar-safe-h` to zero under that attribute — so the sidebar header,
   * the corner marker and the band all move in the same frame without any of
   * them knowing why. Off the desktop there is no bridge, no attribute, and
   * the rule never applies.
   */
  useEffect(() => {
    const bridge = desktop();
    if (!bridge || typeof bridge.onFullscreenChange !== 'function') return;
    const root = document.documentElement;
    const off = bridge.onFullscreenChange((fullscreen) => {
      if (fullscreen) root.dataset.fullscreen = 'true';
      else delete root.dataset.fullscreen;
    });
    return () => {
      off();
      delete root.dataset.fullscreen;
    };
  }, []);

  /**
   * Phase 37: install the save-barrier handler. The main process
   * asks the renderer to confirm that all authored writes are
   * committed before installing an update. The handler is wired
   * once, on mount, and the unsubscribe it returns is the
   * "uninstall" function. The hook itself is mounted for the
   * whole life of the application, so a no-op teardown is fine,
   * but the explicit return is here in case a future test
   * wants to assert the wire-up without the lifetime.
   */
  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;
    return installSaveBarrierHandler(bridge);
  }, []);
}
