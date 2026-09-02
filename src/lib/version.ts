/**
 * The build identity, for the diagnostic report.
 *
 * Read from environment variables that the build sets rather than from
 * `package.json`, so importing this into client code does not pull the whole
 * manifest into the bundle. Both fall back to something honest: a report that
 * says "unknown" is more useful than one that confidently states a stale
 * version.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0';

/** Set by CI from the checked-out SHA; absent in a local build. */
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? undefined;
