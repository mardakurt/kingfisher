// @vitest-environment jsdom
/**
 * The status-bar backup is the button offered when a write has failed.
 * Settings → Export passes the portable preference record; this button has
 * to pass the same object, or an empty machine restored from the file comes
 * back at the defaults.
 */
import 'fake-indexeddb/auto';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

import { downloadWorkspaceBackup } from './backup';
import { resetRepositorySingletonForTests } from './repositories';
import { StoragePersistenceStatus } from './StoragePersistenceStatus';
import { getWriteTracker, resetWriteTrackerForTests } from './write-tracker';
import { DEFAULT_PREFERENCES, usePreferences } from '@/stores/preferences-store';
import { portablePreferences } from '@/stores/portable-preferences';

const blobs: Blob[] = [];

beforeEach(() => {
  blobs.length = 0;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  URL.createObjectURL = ((blob: Blob) => {
    blobs.push(blob);
    return 'blob:kingfisher-backup';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  resetRepositorySingletonForTests();
  resetWriteTrackerForTests();
  usePreferences.setState({
    ...DEFAULT_PREFERENCES,
    engineThreads: 6,
    engineHashMb: 128,
    lichessToken: 'secret-lichess-token',
  });
});

afterEach(() => {
  usePreferences.setState({ ...DEFAULT_PREFERENCES });
  resetWriteTrackerForTests();
  resetRepositorySingletonForTests();
});

describe('the downloaded backup', () => {
  it('contains the preference record it was given', async () => {
    const preferences = portablePreferences(usePreferences.getState());
    const result = await downloadWorkspaceBackup({ preferences });
    expect(result.ok).toBe(true);
    const document = JSON.parse(await blobs[0]!.text()) as {
      preferences: Record<string, unknown>;
    };
    expect(document.preferences).toEqual(preferences);
    expect(document.preferences.engineThreads).toBe(6);
    expect(document.preferences.engineHashMb).toBe(128);
    expect(document.preferences).not.toHaveProperty('lichessToken');
  });

  it('is what the status bar downloads after a failed write', async () => {
    getWriteTracker().begin('chapter').release(false);

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<StoragePersistenceStatus />);
      });
      const status = container.querySelector('button');
      expect(status?.textContent).toContain('Save failed');
      await act(async () => {
        status?.click();
      });
      const download = [...container.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Download backup'),
      );
      expect(download?.textContent).toContain('Download backup before retrying');
      await act(async () => {
        download?.click();
      });
      await vi.waitFor(() => {
        expect(blobs.length).toBeGreaterThan(0);
      });

      const document = JSON.parse(await blobs[0]!.text()) as {
        preferences: Record<string, unknown>;
      };
      expect(document.preferences).toEqual(portablePreferences(usePreferences.getState()));
      expect(document.preferences.engineThreads).toBe(6);
      expect(document.preferences).not.toHaveProperty('lichessToken');
    } finally {
      await act(async () => root.unmount());
    }
  });
});
