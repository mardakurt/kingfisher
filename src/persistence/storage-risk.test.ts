import { describe, expect, it } from 'vitest';

import {
  installInstruction,
  isWebKitWithStorageCap,
  shouldWarnStorageRisk,
  STORAGE_RISK_DISMISSAL_MS,
  type StorageRiskInput,
} from './storage-risk';

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

const base: StorageRiskInput = {
  userAgent: SAFARI_MAC,
  maxTouchPoints: 0,
  standalone: false,
  desktopApp: false,
  persistent: false,
  signedIn: false,
  hasWork: true,
  dismissedAt: null,
  now: 1_000_000_000_000,
};

describe('the browser that may delete a site’s data', () => {
  it('is Safari, and every browser on an iPhone or iPad', () => {
    expect(isWebKitWithStorageCap(SAFARI_MAC, 0)).toBe(true);
    expect(isWebKitWithStorageCap(CHROME_IPHONE, 5)).toBe(true);
    // An iPad asks for the desktop site as a Mac; its touch points give it away.
    expect(isWebKitWithStorageCap(SAFARI_MAC.replace('Version/18.0 ', ''), 5)).toBe(true);
  });

  it('is not Chrome, Edge, Firefox or Android', () => {
    for (const agent of [CHROME_MAC, EDGE, FIREFOX, ANDROID]) {
      expect(isWebKitWithStorageCap(agent, 0), agent).toBe(false);
    }
  });
});

describe('telling a person their work may be deleted', () => {
  it('happens in Safari, to someone with work and nothing keeping it', () => {
    expect(shouldWarnStorageRisk(base)).toBe(true);
  });

  it('does not happen where the work is already safe', () => {
    expect(shouldWarnStorageRisk({ ...base, standalone: true })).toBe(false);
    expect(shouldWarnStorageRisk({ ...base, desktopApp: true })).toBe(false);
    expect(shouldWarnStorageRisk({ ...base, persistent: true })).toBe(false);
    expect(shouldWarnStorageRisk({ ...base, signedIn: true })).toBe(false);
    expect(shouldWarnStorageRisk({ ...base, userAgent: CHROME_MAC })).toBe(false);
  });

  it('waits for work to lose, and a month after it was dismissed', () => {
    expect(shouldWarnStorageRisk({ ...base, hasWork: false })).toBe(false);
    expect(shouldWarnStorageRisk({ ...base, dismissedAt: base.now - 1000 })).toBe(false);
    expect(
      shouldWarnStorageRisk({ ...base, dismissedAt: base.now - STORAGE_RISK_DISMISSAL_MS - 1 }),
    ).toBe(true);
  });

  it('names the step for the device', () => {
    expect(installInstruction(CHROME_IPHONE, 5)).toMatch(/Home Screen/);
    expect(installInstruction(SAFARI_MAC, 0)).toMatch(/Dock/);
  });
});
