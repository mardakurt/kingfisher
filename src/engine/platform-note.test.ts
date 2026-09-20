import { describe, expect, it } from 'vitest';

import { engineNote } from './platform-note';

const lc0 = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];
const berserk = ['win32-x64'];

describe('what the selector says after a native engine', () => {
  it('a browser engine gets no note anywhere', () => {
    expect(
      engineNote({
        native: false,
        family: 'win32',
        reach: 'remote',
        paired: false,
        installed: false,
      }),
    ).toBe('');
  });

  it('on the public site from a Mac: the Mac app runs it — never "Windows only"', () => {
    const base = {
      native: true,
      family: 'darwin' as const,
      reach: 'remote' as const,
      paired: false,
      installed: false,
    };
    expect(engineNote({ ...base, platforms: lc0 })).toBe(' — Mac app only');
    expect(engineNote({ ...base, platforms: berserk })).toBe(' — not available in the browser');
  });

  it('on the public site from Windows or Linux: not available in the browser — never "Mac app only"', () => {
    for (const family of ['win32', 'linux'] as const) {
      const base = {
        native: true,
        family,
        reach: 'remote' as const,
        paired: false,
        installed: false,
      };
      expect(engineNote({ ...base, platforms: lc0 })).toBe(' — not available in the browser');
      expect(engineNote({ ...base, platforms: berserk })).toBe(' — not available in the browser');
    }
  });

  it('before the browser has said what it runs on, the public site promises the least', () => {
    expect(
      engineNote({
        native: true,
        platforms: lc0,
        family: null,
        reach: 'remote',
        paired: false,
        installed: false,
      }),
    ).toBe(' — not available in the browser');
  });

  it('where a companion can answer, the note is about the companion or the platform', () => {
    for (const reach of ['desktop', 'checkout'] as const) {
      const base = {
        native: true,
        family: 'darwin' as const,
        reach,
        paired: false,
        installed: false,
      };
      expect(engineNote({ ...base, platforms: lc0 })).toBe(' — needs the companion');
      expect(engineNote({ ...base, platforms: berserk })).toBe(' — Windows only');
    }
  });

  it('with a companion answering, only installation matters', () => {
    const base = {
      native: true,
      platforms: lc0,
      family: 'darwin' as const,
      reach: 'desktop' as const,
      paired: true,
    };
    expect(engineNote({ ...base, installed: true })).toBe('');
    expect(engineNote({ ...base, installed: false })).toBe(' — not installed');
  });
});
