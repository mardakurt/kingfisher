/**
 * The build identity, for the diagnostic report.
 *
 * Read from environment variables the build sets rather than from
 * `package.json`, so importing this into client code does not pull the whole
 * manifest into the bundle. `next.config.ts` injects the manifest's version;
 * CI may override it.
 *
 * The fallback is deliberately not a version number. It used to be the literal
 * `'0.1.0'`, and because nothing ever set the variable, that literal *was* the
 * version every diagnostic report claimed — a stale constant that stayed
 * plausible while being wrong. "unknown" is worth more than a confident lie,
 * and `version.test.ts` fails if the injection ever stops working.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown';

/** Set by CI from the checked-out SHA; absent in a local build. */
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? undefined;
