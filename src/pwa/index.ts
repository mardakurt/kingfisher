/**
 * Public entry point for the Kingfisher PWA module.
 *
 *   - `registerStudioWorker()` registers the service worker. Idempotent.
 *   - `subscribeUpdate()` and `getUpdateState()` expose the
 *     "update ready" flag the update banner reads.
 *   - `applyUpdate()` asks the new worker to take over.
 *   - `subscribeInstall()` and `promptInstall()` handle the
 *     `beforeinstallprompt` event.
 *
 * The marketing origin is a no-op. The studio origin registers the
 * worker. The install prompt is gated to the studio origin too.
 */

export { isStudioDocument, studioHostFor } from './host';
export {
  registerStudioWorker,
  applyUpdate,
  subscribeUpdate,
  getUpdateState,
  getRegistration,
  type RegistrationOutcome,
  type UpdateState,
} from './register';
export {
  beginListening as beginInstallListening,
  subscribe as subscribeInstall,
  getState as getInstallState,
  promptInstall,
  type InstallPromptState,
} from './install-prompt';
export { describePwaState, type PwaDiagnosticState } from './diagnostics';
export { PwaInstallCard } from './PwaInstallCard';
export { PwaUpdateBanner } from './PwaUpdateBanner';
export { PwaDiagnostic } from './PwaDiagnostic';
export { PwaBootstrap } from './PwaBootstrap';
