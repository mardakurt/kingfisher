/**
 * The engine isolation, tested against a real process where it can be.
 *
 * The pure parts — the environment allowlist, the ceiling arithmetic, the
 * clamp — are checked directly. The two claims that a unit test could assert
 * falsely are checked by spawning something and looking at what it saw: an
 * engine that is handed a secret cannot be proved not to have been by
 * inspecting the function that builds the environment, because the function is
 * not what `spawn` is called with.
 *
 * The stand-in engine is a Node script rather than a chess engine, so this
 * suite runs on a machine with no engines installed — which is every CI runner.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EngineHost } from './engines.mjs';
import {
  clampCommand,
  engineEnvironment,
  GROUP_TERMINATION,
  MAX_LINE,
  resourceCeiling,
  truncatePending,
} from './engine-sandbox.mjs';

describe('the environment an engine is given', () => {
  const source = {
    PATH: '/usr/bin',
    HOME: '/home/player',
    TMPDIR: '/tmp',
    LICHESS_TOKEN: 'lip_secret',
    AWS_SECRET_ACCESS_KEY: 'secret',
    KINGFISHER_ARCHIVE_CACHE: '/data/archives',
    GITHUB_TOKEN: 'ghp_secret',
  };

  it('passes only what a process needs to start', () => {
    expect(engineEnvironment(source, {}, 'linux')).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/player',
      TMPDIR: '/tmp',
    });
  });

  it('passes nothing that looks like a credential', () => {
    const env = engineEnvironment(source, {}, 'linux');
    for (const name of ['LICHESS_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN']) {
      expect(env).not.toHaveProperty(name);
    }
    expect(Object.values(env)).not.toContain('lip_secret');
  });

  it('does not pass Kingfisher its own configuration either', () => {
    // Not a secret, and still none of an engine's business. The allowlist is
    // an allowlist, not a filter on names that look dangerous.
    expect(engineEnvironment(source, {}, 'linux')).not.toHaveProperty('KINGFISHER_ARCHIVE_CACHE');
  });

  it('passes the paths an engine is configured with', () => {
    const env = engineEnvironment(source, { SyzygyPath: '/tb', LC0_WEIGHTS: '/nets/big' }, 'linux');
    expect(env.SyzygyPath).toBe('/tb');
    expect(env.LC0_WEIGHTS).toBe('/nets/big');
  });

  it('lets configuration override an inherited variable', () => {
    expect(engineEnvironment(source, { TMPDIR: '/engine-scratch' }, 'linux').TMPDIR).toBe(
      '/engine-scratch',
    );
  });

  it('matches Windows names case-insensitively, as Windows does', () => {
    const windows = { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', Secret: 'no' };
    const env = engineEnvironment(windows, {}, 'win32');
    expect(env.PATH).toBe('C:\\Windows');
    expect(env.SystemRoot).toBe('C:\\Windows');
    expect(env).not.toHaveProperty('Secret');
  });

  it('omits a variable that is absent rather than setting it empty', () => {
    // An empty PATH is not the same as an inherited one, and an engine that
    // reads one would behave differently from one that reads neither.
    expect(engineEnvironment({ HOME: '/h' }, {}, 'linux')).toEqual({ HOME: '/h' });
  });
});

describe('the resource ceiling', () => {
  it('divides the machine between the sessions that may run at once', () => {
    expect(resourceCeiling({ sessions: 4, cores: 16, memoryBytes: 32 * 1024 ** 3 })).toEqual({
      threads: 4,
      hashMb: 2048,
    });
  });

  it('gives one session the whole share', () => {
    expect(resourceCeiling({ sessions: 1, cores: 8, memoryBytes: 16 * 1024 ** 3 })).toEqual({
      threads: 8,
      hashMb: 4096,
    });
  });

  it('never falls below one thread and a workable table', () => {
    // Two cores split four ways is half a thread, which is not a number an
    // engine accepts. The floor is what makes the ceiling usable.
    const tiny = resourceCeiling({ sessions: 4, cores: 2, memoryBytes: 128 * 1024 ** 2 });
    expect(tiny.threads).toBe(1);
    expect(tiny.hashMb).toBe(16);
  });

  it('leaves three quarters of memory to everything else', () => {
    // The browser, the companion and the operating system are all still
    // running. An engine that swaps searches more slowly than one that does not.
    const ceiling = resourceCeiling({ sessions: 1, cores: 8, memoryBytes: 16 * 1024 ** 3 });
    expect(ceiling.hashMb).toBeLessThan((16 * 1024) / 2);
  });
});

describe('clamping what an engine is asked for', () => {
  const ceiling = { threads: 4, hashMb: 2048 };

  it('lowers a thread count past the ceiling, and says what was asked for', () => {
    expect(clampCommand('setoption name Threads value 64', ceiling)).toEqual({
      line: 'setoption name Threads value 4',
      clamped: { option: 'Threads', requested: 64, allowed: 4 },
    });
  });

  it('lowers a hash size past the ceiling', () => {
    // 32 GB is inside what Stockfish 19 accepts and outside what most machines
    // have.
    expect(clampCommand('setoption name Hash value 33554432', ceiling).line).toBe(
      'setoption name Hash value 2048',
    );
  });

  it('leaves a request within the ceiling exactly as it was', () => {
    for (const line of ['setoption name Threads value 2', 'setoption name Hash value 512']) {
      expect(clampCommand(line, ceiling)).toEqual({ line, clamped: null });
    }
  });

  it('leaves every other option untouched', () => {
    // A ceiling on resources, not a filter on configuration.
    for (const line of [
      'setoption name MultiPV value 5',
      'setoption name SyzygyPath value /tb',
      'setoption name UCI_Chess960 value true',
      'setoption name Skill Level value 3',
    ]) {
      expect(clampCommand(line, ceiling)).toEqual({ line, clamped: null });
    }
  });

  it('leaves a command that is not setoption alone', () => {
    for (const line of ['go depth 30', 'position startpos moves e2e4', 'uci', 'stop']) {
      expect(clampCommand(line, ceiling)).toEqual({ line, clamped: null });
    }
  });

  it('matches the option name however it is capitalised', () => {
    expect(clampCommand('setoption name threads value 99', ceiling).clamped).toMatchObject({
      allowed: 4,
    });
    expect(clampCommand('SETOPTION NAME Hash VALUE 99999', ceiling).clamped).toMatchObject({
      allowed: 2048,
    });
  });

  it('does not clamp a value it cannot read as a number', () => {
    expect(clampCommand('setoption name Threads value plenty', ceiling).clamped).toBeNull();
  });
});

describe('a line that never ends', () => {
  it('holds a partial line until its newline', () => {
    expect(truncatePending('info depth 2', MAX_LINE)).toEqual({
      pending: 'info depth 2',
      overflowed: false,
    });
  });

  it('discards one that has grown past any real UCI line', () => {
    expect(truncatePending('x'.repeat(MAX_LINE + 1), MAX_LINE)).toEqual({
      pending: '',
      overflowed: true,
    });
  });
});

describe('a running engine', () => {
  let directory;
  let host;

  /** A stand-in engine: a Node script, so this runs where no engine is installed. */
  const install = (body) => {
    const script = path.join(directory, 'fake-engine.mjs');
    writeFileSync(script, body);
    return {
      resolve: () => ({
        path: process.execPath,
        args: [script],
        cwd: directory,
      }),
    };
  };

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-sandbox-'));
  });
  afterEach(() => {
    host?.stopAll();
    rmSync(directory, { recursive: true, force: true });
  });

  /** Poll until a pid is gone, or give up and let the assertion report it. */
  const waitUntilGone = async (pid, timeoutMs = 4000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  const collect = (session, until, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const lines = [];
      const timer = setTimeout(
        () => reject(new Error(`timed out; saw ${JSON.stringify(lines)}`)),
        timeoutMs,
      );
      const stop = host.subscribe(session.id, (line) => {
        if (line === null) return;
        lines.push(line);
        if (until(line, lines)) {
          clearTimeout(timer);
          stop();
          resolve(lines);
        }
      });
    });

  it('cannot see a secret the companion has', async () => {
    /*
      The claim this suite exists for, and the one a unit test on
      `engineEnvironment` cannot make: what `spawn` was actually called with.
      The stand-in prints its own environment back.
    */
    process.env.KINGFISHER_TEST_SECRET = 'do-not-leak';
    try {
      host = new EngineHost(
        install('console.log("env " + JSON.stringify(process.env));\nprocess.stdin.resume();\n'),
      );
      const session = host.start('fake');
      const lines = await collect(session, (line) => line.startsWith('env '));
      const env = JSON.parse(lines.find((line) => line.startsWith('env ')).slice(4));
      expect(env).not.toHaveProperty('KINGFISHER_TEST_SECRET');
      expect(JSON.stringify(env)).not.toContain('do-not-leak');
    } finally {
      delete process.env.KINGFISHER_TEST_SECRET;
    }
  });

  it('takes its children with it when it is stopped', async () => {
    if (GROUP_TERMINATION !== 'process-group') return;
    /*
      The claim, stated as behaviour rather than as a process-group id: an
      engine that started a helper must not leave it running. Before engines
      were spawned detached and signalled as a group, `child.kill()` ended the
      engine and the helper kept the core it was holding.

      The stand-in spawns a grandchild that does nothing but stay alive, and
      reports its pid. After the session is stopped, that pid must be gone.
    */
    host = new EngineHost(
      install(
        [
          "import { spawn } from 'node:child_process';",
          "const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {",
          "  stdio: 'ignore',",
          '});',
          'console.log("helper " + helper.pid);',
          'process.stdin.resume();',
        ].join('\n'),
      ),
    );
    const session = host.start('fake');
    const lines = await collect(session, (line) => line.startsWith('helper '));
    const helperPid = Number(lines.find((line) => line.startsWith('helper ')).split(' ')[1]);
    expect(Number.isInteger(helperPid)).toBe(true);
    // Alive before the stop, or the test proves nothing.
    expect(() => process.kill(helperPid, 0)).not.toThrow();

    host.stop(session.id);
    await waitUntilGone(helperPid);
    expect(() => process.kill(helperPid, 0)).toThrow();
  });

  it('clamps a thread request and says so in the session output', async () => {
    host = new EngineHost(
      install('process.stdin.on("data", (d) => console.log("got " + String(d).trim()));\n'),
      { ceiling: { threads: 2, hashMb: 64 } },
    );
    const session = host.start('fake');
    host.send(session.id, 'setoption name Threads value 128');
    const lines = await collect(session, (line) => line.startsWith('got '));
    // Reported to the reader, and the engine really did receive the lower number.
    expect(lines.some((line) => line.startsWith('#limit Threads 128'))).toBe(true);
    expect(lines).toContain('got setoption name Threads value 2');
    expect(host.list()[0]?.clamped).toEqual([{ option: 'Threads', requested: 128, allowed: 2 }]);
  });

  it('sends an unclamped command through unchanged', async () => {
    host = new EngineHost(
      install('process.stdin.on("data", (d) => console.log("got " + String(d).trim()));\n'),
      { ceiling: { threads: 8, hashMb: 1024 } },
    );
    const session = host.start('fake');
    host.send(session.id, 'go depth 30');
    const lines = await collect(session, (line) => line.startsWith('got '));
    expect(lines).toContain('got go depth 30');
    expect(lines.some((line) => line.startsWith('#limit'))).toBe(false);
  });

  it('discards a line with no end, instead of growing until the companion dies', async () => {
    host = new EngineHost(
      install(`process.stdout.write('x'.repeat(${MAX_LINE + 1024}));\nprocess.stdin.resume();\n`),
    );
    const session = host.start('fake');
    const lines = await collect(session, (line) => line.startsWith('#error'));
    expect(lines.some((line) => line.includes('longer than 64 kB'))).toBe(true);
  });

  it('publishes the ceiling it is enforcing', () => {
    host = new EngineHost(install('process.stdin.resume();\n'), {
      ceiling: { threads: 3, hashMb: 512 },
    });
    expect(host.ceiling).toEqual({ threads: 3, hashMb: 512 });
  });
});
