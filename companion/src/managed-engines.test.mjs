import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ManagedEngines } from './managed-engines.mjs';
import { PathRegistry } from './security.mjs';

/**
 * Installing an engine is the one place the companion downloads something and
 * then runs it. What has to hold is that neither of those happens unless the
 * bytes match a digest recorded in the repository — so these tests are about
 * refusal, and about leaving nothing behind when a refusal happens.
 *
 * The download itself is stubbed through `globalThis.fetch`. Downloading a
 * real 57 MB engine in a unit test would test GitHub, not this file.
 */

const CATALOGUE = [
  {
    id: 'fake-engine',
    name: 'Fake Engine',
    family: 'alphabeta',
    kind: 'binary',
    version: '1.0',
    license: 'GPL-3.0-or-later',
    source: 'https://example.invalid/fake',
    notes: 'A fixture.',
    assets: {
      'test-arch': { url: 'https://example.invalid/fake-engine', file: 'fake' },
    },
  },
  {
    id: 'other-arch-only',
    name: 'Elsewhere Only',
    family: 'alphabeta',
    kind: 'binary',
    license: 'GPL-3.0-or-later',
    source: 'https://example.invalid/other',
    notes: 'A fixture with no build here.',
    assets: { 'some-other-arch': { url: 'https://example.invalid/other', file: 'other' } },
  },
];

const BODY = Buffer.from('#!/bin/sh\nexit 0\n');
// sha256 of BODY, computed here so the fixture cannot drift from the bytes.
const DIGEST = createHash('sha256').update(BODY).digest('hex');

function harness({ digests }) {
  const root = mkdtempSync(path.join(tmpdir(), 'kingfisher-managed-'));
  const registry = new PathRegistry();
  const managed = new ManagedEngines({
    catalogue: CATALOGUE,
    digests,
    platform: 'test-arch',
    engineDir: path.join(root, 'engines'),
    recordFile: path.join(root, 'managed-engines.json'),
    registry,
  });
  return { root, registry, managed };
}

const expectEqual = (actual, expected, message) => expect(actual, message).toBe(expected);
const expectMatch = (actual, pattern) => expect(String(actual)).toMatch(pattern);
const expectRejects = (run, pattern) => expect(run()).rejects.toThrow(pattern);

describe('installing a managed engine', () => {
  it('lists what this platform can install, and says why when it cannot', () => {
    const { managed } = harness({ digests: { 'https://example.invalid/fake-engine': DIGEST } });
    const rows = managed.list();
    const fake = rows.find((row) => row.id === 'fake-engine');
    const other = rows.find((row) => row.id === 'other-arch-only');

    expectEqual(fake.available, true);
    expectEqual(fake.sha256, DIGEST);
    expectEqual(fake.installed, false);

    expectEqual(other.available, false);
    expectMatch(other.unavailableReason, /No test-arch build is published/);
  });

  it('refuses an asset with no recorded digest, and downloads nothing', async () => {
    const { managed, root } = harness({ digests: {} });
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return new Response(BODY);
    };

    await expectRejects(() => managed.install('fake-engine'), /no recorded digest/i);
    expectEqual(fetched, false, 'nothing should be fetched without a digest to check it against');
    expectEqual(existsSync(path.join(root, 'engines', 'fake-engine')), false);
  });

  it('refuses a download whose digest does not match, and leaves nothing on disk', async () => {
    const { managed, root } = harness({
      digests: { 'https://example.invalid/fake-engine': 'a'.repeat(64) },
    });
    globalThis.fetch = async () => new Response(BODY);

    await expectRejects(() => managed.install('fake-engine'), /does not match its recorded digest/);
    expectEqual(existsSync(path.join(root, 'engines', 'fake-engine')), false);
    expectEqual(managed.status('fake-engine').installed, false);
  });

  it('refuses a download that fails, without registering anything', async () => {
    const { managed, registry } = harness({
      digests: { 'https://example.invalid/fake-engine': DIGEST },
    });
    globalThis.fetch = async () => new Response('nope', { status: 404 });

    await expectRejects(() => managed.install('fake-engine'), /HTTP 404/);
    expectEqual(registry.has('fake-engine'), false);
  });

  /**
   * The case that found a real bug.
   *
   * A downloaded file that is executable but is not an engine exits the
   * instant it starts, and the write of `uci` then lands on a closed pipe.
   * Node reports that as an `EPIPE` on the *stream* rather than to the caller,
   * so without a listener it is unhandled and takes the process down — the
   * companion crashing on exactly the input its verification exists to reject.
   * It reproduced on Linux in CI and not on macOS, which is what a race looks
   * like.
   */
  it('deletes a binary that downloads and verifies but does not speak UCI', async () => {
    const { managed, root, registry } = harness({
      digests: { 'https://example.invalid/fake-engine': DIGEST },
    });
    globalThis.fetch = async () => new Response(BODY);

    // BODY is a shell script that exits immediately: a real executable that is
    // not an engine, which is exactly the case the UCI check exists for.
    await expectRejects(() => managed.install('fake-engine'), /UCI check|could not find a move/i);
    expectEqual(existsSync(path.join(root, 'engines', 'fake-engine')), false);
    expectEqual(registry.has('fake-engine'), false);
  });

  it('drops a recorded engine whose binary has since disappeared', () => {
    const { managed, root, registry } = harness({ digests: {} });
    mkdirSync(root, { recursive: true });
    writeFileSync(
      path.join(root, 'managed-engines.json'),
      JSON.stringify({
        version: 1,
        engines: [{ id: 'fake-engine', name: 'Fake', binary: path.join(root, 'gone') }],
      }),
    );

    managed.load();
    expectEqual(registry.has('fake-engine'), false);
    expectEqual(managed.status('fake-engine').installed, false);
  });

  it('re-registers an engine whose binary is still there', () => {
    const { managed, root, registry } = harness({ digests: {} });
    const binary = path.join(root, 'fake');
    writeFileSync(binary, BODY);
    writeFileSync(
      path.join(root, 'managed-engines.json'),
      JSON.stringify({
        version: 1,
        engines: [{ id: 'fake-engine', name: 'Fake', binary, license: 'GPL-3.0-or-later' }],
      }),
    );

    managed.load();
    expectEqual(registry.has('fake-engine'), true);
    expectEqual(registry.resolve('fake-engine').path, binary);
    expectEqual(
      readFileSync(path.join(root, 'managed-engines.json'), 'utf8').includes('fake'),
      true,
    );
  });
});
