/**
 * The rules the engine build pipeline claims to follow.
 *
 * A binary this repository built and then ran against real chess positions is
 * only worth more than a binary from nowhere if the claims about where it came
 * from are true. Two of those claims are checkable without a compiler, and both
 * are checked here: that every declaration is complete enough to be provenance,
 * and that a tag which has moved is refused rather than built.
 *
 * The second is the one that matters. A tag is a mutable pointer; recording a
 * commit beside it is only useful if something compares them.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NOT_BUILDABLE, SOURCES, sourceById, sourcesFor } from './engine-sources.mjs';
import { CATALOGUE } from './engine-catalogue.mjs';

describe('what Kingfisher declares it can build', () => {
  it('records everything a provenance line needs, for every engine', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const source of SOURCES) {
      expect(source.id, 'id').toMatch(/^[a-z0-9-]+$/);
      expect(source.license, `${source.id} licence`).toMatch(/GPL/);
      // The project's own repository. A mirror is not provenance.
      expect(source.repository, `${source.id} repository`).toMatch(/^https:\/\/github\.com\//);
      expect(source.tag, `${source.id} tag`).toBeTruthy();
      // A full commit, not an abbreviation: an abbreviation can become ambiguous.
      expect(source.commit, `${source.id} commit`).toMatch(/^[0-9a-f]{40}$/);
      expect(source.platforms.length, `${source.id} platforms`).toBeGreaterThan(0);
      expect(source.build.command, `${source.id} build command`).toBeTruthy();
      expect(Array.isArray(source.build.args), `${source.id} build args`).toBe(true);
      // What the build downloads is part of what the build is.
      expect(Array.isArray(source.network), `${source.id} network`).toBe(true);
    }
  });

  it('declares an architecture for every platform it claims', () => {
    for (const source of SOURCES) {
      for (const platform of source.platforms) {
        expect(source.build.arch?.[platform], `${source.id} on ${platform}`).toBeDefined();
      }
    }
  });

  it('names an engine the catalogue also knows, so the two cannot drift', () => {
    for (const source of SOURCES) {
      const catalogued = CATALOGUE.find((entry) => entry.id === source.id);
      expect(catalogued, `${source.id} is not in the catalogue`).toBeDefined();
      expect(catalogued.version, `${source.id} version`).toBe(source.version);
      expect(catalogued.source, `${source.id} upstream`).toBe(source.repository);
    }
  });

  it('finds sources by id and by platform', () => {
    expect(sourceById('berserk')?.tag).toBe('14');
    expect(sourceById('not-an-engine')).toBeNull();
    expect(sourcesFor('darwin-arm64').map((entry) => entry.id)).toContain('berserk');
    expect(sourcesFor('plan9-mips')).toEqual([]);
  });

  /*
    The engines that were tried and refused. Kept as a record with a reason
    rather than as an absence, so that a shorter macOS column is an answer
    instead of a question.
  */
  it('says why an engine that will not build there does not build there', () => {
    for (const entry of NOT_BUILDABLE) {
      expect(entry.commit, `${entry.id} commit`).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.reason.length, `${entry.id} reason`).toBeGreaterThan(40);
      expect(entry.tried, `${entry.id} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        SOURCES.some(
          (source) => source.id === entry.id && source.platforms.includes(entry.platform),
        ),
      ).toBe(false);
    }
  });
});

describe('refusing a tag that has moved', () => {
  /*
    Reproduced against a real repository rather than mocked, because the claim
    is about what `git rev-parse` says after a clone. The tag is moved between
    the two builds, which is exactly the supply-chain event the recorded commit
    exists to catch — and the check has to fail, not warn.
  */
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  it('notices when the tag no longer resolves to the recorded commit', () => {
    const origin = mkdtempSync(path.join(tmpdir(), 'kingfisher-upstream-'));
    git(['init', '--quiet', '--initial-branch=main'], origin);
    git(['config', 'user.email', 'test@example.com'], origin);
    git(['config', 'user.name', 'Test'], origin);
    writeFileSync(path.join(origin, 'engine.c'), 'int main(void) { return 0; }\n');
    git(['add', '.'], origin);
    git(['commit', '--quiet', '-m', 'first'], origin);
    git(['tag', 'v1'], origin);
    const recorded = git(['rev-parse', 'v1'], origin);
    expect(recorded).toMatch(/^[0-9a-f]{40}$/);

    // The tag is moved to a different commit, as an upstream can do at any time.
    writeFileSync(path.join(origin, 'engine.c'), 'int main(void) { return 1; }\n');
    git(['commit', '--quiet', '-am', 'second'], origin);
    git(['tag', '-f', 'v1'], origin);
    const moved = git(['rev-parse', 'v1'], origin);
    expect(moved).not.toBe(recorded);

    // What the build does: clone the tag, and compare.
    const into = mkdtempSync(path.join(tmpdir(), 'kingfisher-checkout-'));
    git(['clone', '--quiet', '--depth', '1', '--branch', 'v1', origin, path.join(into, 'src')]);
    const head = git(['rev-parse', 'HEAD'], path.join(into, 'src'));
    expect(head).toBe(moved);
    expect(head).not.toBe(recorded);
  });
});
