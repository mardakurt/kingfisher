/**
 * The shutdown contract, tested against real processes.
 *
 * This suite forks actual Node children rather than mocking `child_process`,
 * because every claim it makes is about what an operating system does: that a
 * signal was delivered, that a handler ran, that a process that ignores the
 * signal is escalated, and that a child notices its parent going away. A mock
 * would assert that `kill` was called, which is the one thing nobody doubts.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Service, freePort, waitForHttp } from './services.mjs';

const workspace = mkdtempSync(path.join(tmpdir(), 'kingfisher-desktop-'));

const script = (name, source) => {
  const file = path.join(workspace, name);
  writeFileSync(file, source);
  return file;
};

/** A server that answers a health check and exits cleanly on SIGTERM. */
const WELL_BEHAVED = `
import { createServer } from 'node:http';
const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
server.listen(Number(process.env.PORT), '127.0.0.1');
const bye = () => { server.close(() => process.exit(0)); };
process.on('SIGTERM', bye);
process.on('SIGINT', bye);
if (typeof process.send === 'function') process.on('disconnect', bye);
`;

/**
 * One that refuses to die. The escalation case.
 *
 * It ignores SIGTERM and holds an interval, which is the whole point — and
 * which also means that a test run interrupted between `start()` and `stop()`
 * leaves it running for ever, reparented to init, with no signal that will
 * end it. Phase 20 found one of these that had been up for a day. The
 * self-destruct is not part of what is being tested: `stop({ graceMs: 300 })`
 * resolves in well under a second, so this only ever fires when the test that
 * owns the process is no longer there to stop it.
 */
const STUBBORN = `
import { createServer } from 'node:http';
const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
setTimeout(() => process.exit(0), 60_000);
`;

/** One that fails on boot, the way a missing file or a taken port does. */
const BROKEN = `
console.error('could not open the collection');
process.exit(3);
`;

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('a desktop service', () => {
  it('is ready only once it answers, and stops on SIGTERM', async () => {
    const port = await freePort();
    const service = new Service({
      name: 'test server',
      entry: script('good.mjs', WELL_BEHAVED),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
    });
    await service.start();
    expect(service.running).toBe(true);
    const { pid } = service;
    expect(await waitForHttp(`http://127.0.0.1:${port}/health`)).toBe(200);

    const result = await service.stop();
    expect(result).toEqual({ stopped: true, escalated: false });
    expect(alive(pid)).toBe(false);
  });

  /*
    The case the grace period exists for.

    A process that ignores SIGTERM must still be gone when `stop()` resolves,
    and `escalated` must say so — a shell that reports a clean shutdown it did
    not get is worse than one that admits it forced the issue.
  */
  it('escalates a service that ignores the signal, and says it did', async () => {
    const port = await freePort();
    const service = new Service({
      name: 'stubborn server',
      entry: script('stubborn.mjs', STUBBORN),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
    });
    await service.start();
    const { pid } = service;

    const result = await service.stop({ graceMs: 300 });
    expect(result).toEqual({ stopped: true, escalated: true });
    expect(alive(pid)).toBe(false);
  });

  /*
    A start that fails should fail *now*, naming the cause.

    Racing the health check against the child's own exit is what turns "the
    companion could not open its data directory" into that sentence, instead
    of a thirty-second wait ending in "timed out", which describes the symptom
    of every possible cause.
  */
  it('fails immediately when the service dies before it is ready', async () => {
    const port = await freePort();
    const service = new Service({
      name: 'broken server',
      entry: script('broken.mjs', BROKEN),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
    });
    const started = Date.now();
    await expect(service.start()).rejects.toThrow(/exited before it was ready \(3\)/);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(service.log.join(' ')).toContain('could not open the collection');
  });

  it('knows a child killed by a signal from outside is gone', async () => {
    // A companion that crashes, or is `kill -9`ed, exits with a signal and no
    // exit code. `running` read `exitCode === null` as alive, so Diagnostics
    // reported a dead companion as running. Found by the fault-injecting walk.
    const port = await freePort();
    const service = new Service({
      name: 'test server',
      entry: script('good.mjs', WELL_BEHAVED),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
    });
    await service.start();
    expect(service.running).toBe(true);
    process.kill(service.pid, 'SIGKILL');
    const deadline = Date.now() + 5_000;
    while (alive(service.pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 100));
    expect(service.running).toBe(false);
    expect(service.log.at(-1)).toMatch(/exited: SIGKILL/);
    // And stopping it afterwards is a no-op, not a second kill.
    expect(await service.stop()).toEqual({ stopped: true, escalated: false });
  });

  it('reports an exit it did not ask for, and stays quiet about one it did', async () => {
    const port = await freePort();
    const seen = [];
    const service = new Service({
      name: 'test server',
      entry: script('good.mjs', WELL_BEHAVED),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
      onUnexpectedExit: (exit) => seen.push(exit),
    });
    await service.start();
    process.kill(service.pid, 'SIGKILL');
    const deadline = Date.now() + 5_000;
    while (seen.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    expect(seen).toEqual([{ code: null, signal: 'SIGKILL' }]);
    // Started again on the same port — what a revival is — and stopped on purpose.
    await service.start();
    expect(service.running).toBe(true);
    await service.stop();
    await new Promise((r) => setTimeout(r, 100));
    expect(seen).toHaveLength(1);
  });

  it('stopping something already stopped is not an error', async () => {
    const port = await freePort();
    const service = new Service({
      name: 'test server',
      entry: script('good2.mjs', WELL_BEHAVED),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
    });
    await service.start();
    await service.stop();
    await expect(service.stop()).resolves.toEqual({ stopped: true, escalated: false });
  });
});

describe('the parent-death watchdog', () => {
  /*
    The orphan case the IPC channel exists for.

    A shell that quits sends SIGTERM. A shell that is *killed* sends nothing,
    and the companion spawns engines detached — in their own process groups, so
    that stopping one stops its helpers, which is exactly the property that
    lets them outlive a parent nobody told to stop. So the child watches the
    channel instead of only the signal, and this asserts the channel is opened
    and that closing it is enough.
  */
  it('ends a forked child when the channel to it closes', async () => {
    const port = await freePort();
    const service = new Service({
      name: 'watched server',
      entry: script('watched.mjs', WELL_BEHAVED),
      healthUrl: `http://127.0.0.1:${port}/health`,
      env: { PORT: String(port) },
    });
    await service.start();
    const { pid } = service;
    expect(alive(pid)).toBe(true);

    // Simulate the shell disappearing without a signal: close the channel and
    // leave the process alone.
    service.disconnectForTest();

    for (let i = 0; i < 60 && alive(pid); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(alive(pid)).toBe(false);
  });
});

describe('free ports', () => {
  it('hands back a port nothing is listening on, twice over', async () => {
    const [a, b] = await Promise.all([freePort(), freePort()]);
    expect(a).toBeGreaterThan(1024);
    expect(b).toBeGreaterThan(1024);
    expect(a).not.toBe(b);
  });
});

describe('waiting for a service', () => {
  it('times out rather than waiting for ever', async () => {
    const port = await freePort();
    await expect(
      waitForHttp(`http://127.0.0.1:${port}/health`, { timeoutMs: 250, intervalMs: 25 }),
    ).rejects.toThrow(/Timed out/);
  });
});
