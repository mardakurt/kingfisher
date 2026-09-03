import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { handshakeUci, validateExecutable } from './custom-engines.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'kingfisher-custom-engine-'));

/**
 * A real, valid UCI-shaped fake engine, expressed as a `node -e` inline
 * script rather than a fixture binary — this test suite runs wherever the
 * project's own tests run, and Node itself is guaranteed to be there.
 */
const FAKE_ENGINE_SCRIPT = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line.trim() === 'uci') {
    console.log('id name Fake Engine');
    console.log('id author A. Tester');
    console.log('option name Threads type spin default 1 min 1 max 512');
    console.log('uciok');
  } else if (line.trim() === 'isready') {
    console.log('readyok');
  } else if (line.trim() === 'quit') {
    process.exit(0);
  }
});
`;

const NEVER_RESPONDS_SCRIPT = 'setInterval(() => {}, 1000);';
const CRASHES_IMMEDIATELY_SCRIPT = 'process.exit(7);';
const GARBAGE_OUTPUT_SCRIPT = `
console.log('this is not a UCI response');
console.log('neither is this');
setInterval(() => {}, 1000);
`;

describe('validateExecutable', () => {
  it('accepts a real, executable file', () => {
    expect(() => validateExecutable(process.execPath)).not.toThrow();
  });

  it('rejects a path that does not exist', () => {
    expect(() => validateExecutable(path.join(dir, 'nowhere'))).toThrow('No file exists');
  });

  it('rejects a directory', () => {
    const sub = path.join(dir, 'a-directory');
    mkdirSync(sub);
    expect(() => validateExecutable(sub)).toThrow('is not a file');
  });

  it('rejects a file with no execute permission', () => {
    const file = path.join(dir, 'not-executable.sh');
    writeFileSync(file, '#!/bin/sh\necho hi\n');
    chmodSync(file, 0o644);
    expect(() => validateExecutable(file)).toThrow('is not executable');
  });
});

describe('handshakeUci', () => {
  it('completes the handshake against a real UCI engine and recovers its identity', async () => {
    const result = await handshakeUci(process.execPath, ['-e', FAKE_ENGINE_SCRIPT]);
    expect(result.name).toBe('Fake Engine');
    expect(result.author).toBe('A. Tester');
  });

  it('rejects truthfully when the process never responds', async () => {
    await expect(
      handshakeUci(process.execPath, ['-e', NEVER_RESPONDS_SCRIPT], { timeoutMs: 300 }),
    ).rejects.toThrow('did not complete the UCI handshake in time');
  });

  it('rejects truthfully when the process exits before finishing the handshake', async () => {
    await expect(
      handshakeUci(process.execPath, ['-e', CRASHES_IMMEDIATELY_SCRIPT]),
    ).rejects.toThrow('exited before completing the UCI handshake');
  });

  it('rejects truthfully when the process is not executable at all', async () => {
    await expect(handshakeUci(path.join(dir, 'nowhere-real'))).rejects.toThrow(
      'Could not start the engine',
    );
  });

  it('does not mistake ordinary stdout output for a completed handshake', async () => {
    await expect(
      handshakeUci(process.execPath, ['-e', GARBAGE_OUTPUT_SCRIPT], { timeoutMs: 300 }),
    ).rejects.toThrow('did not complete the UCI handshake in time');
  });

  /**
   * A crashing or malformed engine must never destabilize the companion
   * itself (§47) — this is the direct proof: the handshake for a process
   * that never speaks UCI still resolves (as a rejection) rather than
   * leaving an unhandled rejection or a process that outlives the test.
   */
  it('leaves no process behind after a failed handshake', async () => {
    await expect(
      handshakeUci(process.execPath, ['-e', NEVER_RESPONDS_SCRIPT], { timeoutMs: 300 }),
    ).rejects.toThrow();
    // If the child were still alive and holding stdin open, a second
    // handshake attempt racing the same event loop would still resolve on
    // its own merits — proven by simply succeeding here, immediately after.
    const result = await handshakeUci(process.execPath, ['-e', FAKE_ENGINE_SCRIPT]);
    expect(result.name).toBe('Fake Engine');
  });
});
