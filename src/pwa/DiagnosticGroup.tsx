/**
 * Re-export of the diagnostic-row components used by both
 * `SettingsDialog` and the PWA panel. Lives in the PWA module so
 * the PWA diagnostic row can match the rest of the Diagnostics
 * section without re-implementing the visual style.
 */

export { DiagnosticGroup, DiagnosticLine } from '@/features/shell/DiagnosticGroup';
