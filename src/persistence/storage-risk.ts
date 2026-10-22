/**
 * Whether to tell a person that their browser may delete their work.
 *
 * Safari, and every browser on an iPhone or iPad (they are all WebKit),
 * removes a website's stored data after seven days of use without a visit
 * to it — WebKit's tracking prevention applies to every script-writable
 * store, IndexedDB included — unless the site has been added to the Home
 * Screen or the Dock. For Kingfisher in a browser that store is the work
 * itself. Chromium and Firefox keep it unless the disk runs short, and the
 * request for persistent storage made at the first save covers that; this
 * covers the case that request cannot.
 *
 * Said once, to someone with work to lose, and again a month after it was
 * dismissed — not on every visit, and never to an installed app, the Mac
 * application, an account that keeps a copy, or storage already persistent.
 */

export interface StorageRiskInput {
  readonly userAgent: string;
  /** Touch points, which tell an iPad (it reports itself as a Mac) apart. */
  readonly maxTouchPoints: number;
  /** Launched from the Home Screen or the Dock. */
  readonly standalone: boolean;
  readonly desktopApp: boolean;
  readonly persistent: boolean;
  readonly signedIn: boolean;
  readonly hasWork: boolean;
  readonly dismissedAt: number | null;
  readonly now: number;
}

export const STORAGE_RISK_DISMISSAL_MS = 30 * 24 * 60 * 60 * 1000;

/** WebKit with tracking prevention: Safari anywhere, any browser on iOS or iPadOS. */
export function isWebKitWithStorageCap(userAgent: string, maxTouchPoints: number): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) return true;
  return (
    /Safari\//.test(userAgent) &&
    !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|Android|Firefox/.test(userAgent)
  );
}

export function shouldWarnStorageRisk(input: StorageRiskInput): boolean {
  if (input.desktopApp || input.standalone || input.persistent || input.signedIn) return false;
  if (!input.hasWork) return false;
  if (!isWebKitWithStorageCap(input.userAgent, input.maxTouchPoints)) return false;
  return input.dismissedAt === null || input.now - input.dismissedAt > STORAGE_RISK_DISMISSAL_MS;
}

/** What to tell the person to do, in the words of the device they are on. */
export function installInstruction(userAgent: string, maxTouchPoints: number): string {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios ? 'Share → Add to Home Screen' : 'File → Add to Dock (Safari 17 or later)';
}
