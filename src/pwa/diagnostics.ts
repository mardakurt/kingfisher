/**
 * PWA diagnostics summary for the Support Information panel.
 *
 * The diagnostic report that ships with Kingfisher has always
 * included "which version, which build, which platform". With
 * PWA capability comes a second axis: "is this a normal tab, an
 * installed PWA, or a desktop shell?". The summary is short, does
 * not include fingerprinting material beyond what the
 * application already records, and is safe to paste into a bug
 * report.
 */

import { isStudioDocument } from './host';

export interface PwaDiagnosticState {
  readonly available: boolean;
  readonly installed: boolean;
  readonly standalone: boolean;
  readonly scope: string;
  readonly scriptUrl: string;
  readonly controllerUrl: string;
}

export function describePwaState(): PwaDiagnosticState {
  if (typeof navigator === 'undefined') {
    return {
      available: false,
      installed: false,
      standalone: false,
      scope: '',
      scriptUrl: '',
      controllerUrl: '',
    };
  }
  const swApi = navigator.serviceWorker;
  const available = typeof swApi !== 'undefined';
  const reg = available ? swApi.controller : null;
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false);
  const installed =
    standalone ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return {
    available,
    installed,
    standalone,
    scope: isStudioDocument() ? '/' : '',
    scriptUrl: isStudioDocument() ? '/sw.js' : '',
    controllerUrl: reg?.scriptURL ?? '',
  };
}
