import { describe, expect, it } from 'vitest';

import { TRUST_LEVELS, trustOf } from './trust';

/**
 * The trust model is documentation that ships in the product, and the failure
 * mode it guards against is a comforting word appearing where it is not true.
 * These tests are therefore about *language* as much as structure: no native
 * engine may ever be described as sandboxed.
 */
describe('the engine trust model', () => {
  it('calls only the browser engine sandboxed', () => {
    expect(TRUST_LEVELS.browser.label.toLowerCase()).toContain('sandbox');
    for (const level of [TRUST_LEVELS.managed, TRUST_LEVELS.custom]) {
      expect(level.label.toLowerCase()).not.toContain('sandbox');
      // The summary may *deny* a sandbox, which is the point — but it must
      // never assert one.
      expect(level.summary).not.toMatch(/\bis sandboxed\b/i);
      expect(level.summary.toLowerCase()).toContain('permissions');
    }
  });

  it('says out loud that a managed engine is not sandboxed', () => {
    expect(TRUST_LEVELS.managed.summary).toMatch(/not sandboxed/i);
  });

  it('states limits as well as guarantees for every level', () => {
    for (const level of Object.values(TRUST_LEVELS)) {
      expect(level.guarantees.length).toBeGreaterThan(1);
      expect(level.limits.length).toBeGreaterThan(0);
      for (const line of [...level.guarantees, ...level.limits]) {
        expect(line.length).toBeGreaterThan(20);
      }
    }
  });

  it('tells a user in plain words what a custom engine can do', () => {
    const text = [TRUST_LEVELS.custom.summary, ...TRUST_LEVELS.custom.limits].join(' ');
    expect(text).toMatch(/same operating-system permissions/i);
    expect(text).toMatch(/no digest|checks no digest/i);
  });

  it('records that a digest is not a signature', () => {
    expect(TRUST_LEVELS.managed.limits.join(' ')).toMatch(/not a signature/i);
  });

  it('classifies an engine by how it got here, not by what it is called', () => {
    expect(trustOf('worker', false)).toBe('browser');
    expect(trustOf('native', false)).toBe('managed');
    expect(trustOf('native', true)).toBe('custom');
    // A worker engine cannot be custom: there is no way to add one.
    expect(trustOf('worker', true)).toBe('browser');
  });
});
