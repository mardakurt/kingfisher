/**
 * Browser storage quota for huge pack installs.
 *
 * `navigator.storage.estimate()` is approximate on every browser, but it is
 * the only signal a player has before committing a 5 GB download. Phase 31
 * (PART AS-AT) asks for an honest warning without overpromising: the UI
 * says "estimated available" and the user is the one who decides.
 *
 * Three things this module deliberately does *not* do:
 *   - it does not block the install. A 5 GB download on a 6 GB device is
 *     a user choice, not an application choice.
 *   - it does not pretend the estimate is exact. The brief is explicit.
 *   - it does not test the size against the full quota; the storage
 *     layer will already say no if it runs out, and we want the user to
 *     see that clean failure, not a fabricated one here.
 */

export interface StorageQuotaReport {
  /** Bytes the browser estimates are still free. `undefined` if unknown. */
  readonly availableBytes: number | undefined;
  /** Bytes the browser estimates are still free, or 0 if unknown. */
  readonly safeAvailableBytes: number;
  /** Total quota the browser reports, or 0 if unknown. */
  readonly quotaBytes: number;
  /** Bytes the user has already used, or 0 if unknown. */
  readonly usageBytes: number;
  /** True when the API is unavailable (server-side, locked-down iframe). */
  readonly unsupported: boolean;
}

const ONE_MIB = 1024 * 1024;

/**
 * A rough, honest estimate of the free space the browser will give
 * Kingfisher. Returns 0 when the API is unavailable, so callers
 * compare against "do we even know?" before deciding what to render.
 */
export async function readStorageQuota(): Promise<StorageQuotaReport> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return {
      availableBytes: undefined,
      safeAvailableBytes: 0,
      quotaBytes: 0,
      usageBytes: 0,
      unsupported: true,
    };
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      availableBytes: Math.max(0, quota - usage),
      safeAvailableBytes: Math.max(0, quota - usage),
      quotaBytes: quota,
      usageBytes: usage,
      unsupported: false,
    };
  } catch {
    return {
      availableBytes: undefined,
      safeAvailableBytes: 0,
      quotaBytes: 0,
      usageBytes: 0,
      unsupported: true,
    };
  }
}

export type InstallSizeVerdict =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'fits' }
  | { readonly kind: 'tight'; readonly headroomBytes: number }
  | { readonly kind: 'overflows'; readonly shortByBytes: number };

/**
 * Decide whether an offline install of `installBytes` is likely to fit.
 *
 * The verdict uses 64 MiB of headroom as the "tight" threshold; under
 * that, the install is likely to fail when the user closes the tab or
 * the browser decides to evict its own cached files. The exact number
 * is conservative on purpose: it is better to warn early than to wait
 * for the failure deep inside the install transaction.
 */
export function verdictForInstall(
  quota: StorageQuotaReport,
  installBytes: number,
): InstallSizeVerdict {
  if (quota.unsupported || quota.availableBytes === undefined) {
    return { kind: 'unknown' };
  }
  if (installBytes > quota.availableBytes) {
    return {
      kind: 'overflows',
      shortByBytes: installBytes - quota.availableBytes,
    };
  }
  const headroom = quota.availableBytes - installBytes;
  if (headroom < 64 * ONE_MIB) {
    return { kind: 'tight', headroomBytes: headroom };
  }
  return { kind: 'fits' };
}

export function formatBytesShort(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} kB`;
  return `${bytes} B`;
}
