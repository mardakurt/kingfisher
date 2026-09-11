import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectFeedbackTechnicalInfo, formatTechnicalPreview } from './feedback-technical';

describe('collectFeedbackTechnicalInfo', () => {
  let originalWindow: unknown;
  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('collects the documented non-chess fields', async () => {
    (globalThis as { window?: unknown }).window = {
      navigator: { userAgent: 'test/ua', language: 'en', onLine: true },
      innerWidth: 1024,
      innerHeight: 768,
      crossOriginIsolated: true,
      indexedDB: {},
    };
    const info = await collectFeedbackTechnicalInfo({ clientVersion: '1.0.0', surface: 'web' });
    expect(info.appVersion).toBe('1.0.0');
    expect(info.surface).toBe('web');
    expect(typeof info.userAgent).toBe('string');
    expect(typeof info.viewport).toBe('string');
    expect(typeof info.online).toBe('string');
    expect(typeof info.timestamp).toBe('string');
  });

  it('never carries chess content', async () => {
    const info = await collectFeedbackTechnicalInfo({ clientVersion: '1.0.0', surface: 'web' });
    const keys = Object.keys(info).join(',');
    expect(keys).not.toMatch(/game|study|note|repertoire|training|pgn|lichess.?token/i);
    expect(keys).not.toMatch(/path/i);
  });

  it('returns an empty object in a non-DOM environment', async () => {
    const originalWindow = globalThis.window;
    /* Force the non-browser branch. */
    (globalThis as { window?: unknown }).window = undefined;
    try {
      const info = await collectFeedbackTechnicalInfo({ clientVersion: '1.0.0', surface: 'web' });
      expect(info).toEqual({});
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

describe('formatTechnicalPreview', () => {
  it('renders one key per line in insertion order', () => {
    const text = formatTechnicalPreview({ a: '1', b: '2' });
    expect(text).toBe('a: 1\nb: 2');
  });
});
