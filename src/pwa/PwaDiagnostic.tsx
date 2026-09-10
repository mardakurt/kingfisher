'use client';

/**
 * A compact PWA status row for the Support Information panel.
 *
 * Renders inside the studio's Diagnostics section. On the marketing
 * origin the diagnostic is empty, because the marketing origin
 * does not register a service worker.
 */

import { useEffect, useState } from 'react';

import { DiagnosticGroup, DiagnosticLine } from './DiagnosticGroup';

import { isStudioDocument } from './host';
import { describePwaState, type PwaDiagnosticState } from './diagnostics';

export function PwaDiagnostic() {
  // The first render of the diagnostic row can be empty if the
  // service worker has not finished registering; the effect below
  // populates the row and re-reads once after a short delay to
  // catch the case where registration finishes after the panel
  // is opened.
  const [state, setState] = useState<PwaDiagnosticState | null>(() =>
    typeof window === 'undefined' || !isStudioDocument() ? null : describePwaState(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStudioDocument()) return;
    const t = setTimeout(() => setState(describePwaState()), 250);
    return () => clearTimeout(t);
  }, []);

  if (!state) return null;

  return (
    <DiagnosticGroup title="Installable web app">
      <DiagnosticLine
        name="Installed as application"
        status={state.installed ? 'Yes' : 'No'}
        detail={
          state.installed
            ? 'Running as a standalone window for this origin.'
            : 'Use the address-bar install button, or the Install card above.'
        }
        ok={state.installed}
      />
      <DiagnosticLine
        name="Service worker"
        status={state.controllerUrl ? 'Active' : 'Not yet active'}
        detail={
          state.controllerUrl
            ? state.controllerUrl
            : state.available
              ? 'Worker registered; waiting for first navigation.'
              : 'Worker not supported by this browser.'
        }
        ok={Boolean(state.controllerUrl)}
      />
      <DiagnosticLine
        name="Scope"
        status={state.scope ? state.scope : '—'}
        detail="Same-origin storage. Studies, Repertoire and reference cache are shared with the browser tab."
        ok={Boolean(state.scope)}
      />
    </DiagnosticGroup>
  );
}

// Re-export the diagnostic group helpers so callers do not need to
// know where they live. They are defined in the Settings dialog
// module today; this import path is the contract for "the same
// row format the rest of Diagnostics uses". If the diagnostic row
// format ever moves, this re-export is the only path that needs to
// change.
export { DiagnosticGroup, DiagnosticLine } from './DiagnosticGroup';
