/**
 * Work that must go on with the window closed (Phase 85).
 *
 * A deep analysis runs in the page. The Mac convention — closing the window
 * does not quit — kept the application in the Dock but destroyed the page, and
 * the run with it. So while the renderer reports background work, closing the
 * window hides it instead: the page and its engine keep going, the Dock icon
 * brings the window back, and Quit still quits (the run is saved after every
 * position and resumes on the next launch). While work is reported the shell
 * also holds a `prevent-app-suspension` power-save blocker, so App Nap does
 * not throttle a hidden window's search; the machine may still sleep, which is
 * the person's choice, and the run resumes after it.
 *
 * Pure apart from the `powerSaveBlocker` it is handed.
 */

/** What the renderer may send: a boolean and a short label, nothing else. */
export function normaliseWork(payload) {
  if (!payload || typeof payload !== 'object') return { active: false, label: '' };
  const active = payload.active === true;
  const label = typeof payload.label === 'string' ? payload.label.slice(0, 80) : '';
  return { active, label: active ? label || 'Background work' : '' };
}

/**
 * `onIdle` is called when reported work ends: a window hidden because work was
 * running is then closed, as the person asked when they closed it — without
 * it, the window stayed hidden after the run finished, the application never
 * quit on its own, and a harness quitting "by closing the window" waited
 * forever (Phase 85, desktop:restart).
 */
export function createBackgroundWork({
  powerSaveBlocker,
  log = () => undefined,
  onIdle = () => undefined,
}) {
  let label = null;
  let blocker = null;
  return {
    set(payload) {
      const work = normaliseWork(payload);
      if (work.active) {
        if (label === null) log('work', `background work started: ${work.label}`);
        label = work.label;
        if (blocker === null || !powerSaveBlocker.isStarted(blocker)) {
          blocker = powerSaveBlocker.start('prevent-app-suspension');
        }
      } else {
        const ended = label !== null;
        if (ended) log('work', `background work ended: ${label}`);
        label = null;
        if (blocker !== null && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
        blocker = null;
        if (ended) onIdle();
      }
    },
    /** The work being done, or null. */
    label: () => label,
    /** For the window's `close`: hide rather than close while work goes on, unless quitting. */
    shouldHide: (quitting) => label !== null && !quitting,
  };
}
