import { describe, expect, it } from 'vitest';
import { compatibleAsset, cpuFeatures } from './cpu.mjs';
import { CATALOGUE } from '../../scripts/engine-catalogue.mjs';

describe('safe engine CPU selection', () => {
  it('refuses an AVX2-only artifact on an unverified CPU', () => {
    const entry = CATALOGUE.find((entry) => entry.id === 'obsidian');
    expect(compatibleAsset(entry, 'win32-x64', [])).toBeNull();
    expect(compatibleAsset(entry, 'win32-x64', ['avx2'])?.file).toBe('obsidian.exe');
  });
  it('requires every declared feature, not just AVX2', () => {
    const entry = CATALOGUE.find((entry) => entry.id === 'stormphrax');
    expect(compatibleAsset(entry, 'linux-x64', ['avx2'])).toBeNull();
    expect(compatibleAsset(entry, 'linux-x64', ['avx2', 'bmi2'])).not.toBeNull();
  });
  it('offers portable x64 builds and never substitutes a different platform', () => {
    const entry = CATALOGUE.find((entry) => entry.id === 'plentychess');
    expect(compatibleAsset(entry, 'linux-x64', [])?.url).toContain('linux-generic');
    expect(compatibleAsset(entry, 'darwin-x64', [])).toBeNull();
    expect(cpuFeatures('unknown-platform', 'x64')).toEqual([]);
  });
  it('selects a specialized alternative only when every feature is proven', () => {
    const generic = { file: 'generic', alternatives: [{ file: 'fast', requires: ['avx2'] }] };
    const entry = { assets: { 'test-x64': generic } };
    expect(compatibleAsset(entry, 'test-x64', []).file).toBe('generic');
    expect(compatibleAsset(entry, 'test-x64', ['avx2']).file).toBe('fast');
  });
});
