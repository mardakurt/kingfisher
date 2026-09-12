import { describe, expect, it } from 'vitest';

import { CRASH_LOOP_LIMIT, KILL_LIMIT, RevivalBudget, WINDOW_MS } from './revival.mjs';

const T0 = 1_000_000;
const killed = { code: null, signal: 'SIGKILL' };
const crashed = { code: null, signal: 'SIGSEGV' };
const failed = { code: 1, signal: null };

describe('the revival budget', () => {
  it('restarts a healthy service every time it is killed from outside', () => {
    // The packaged fault walk: four SIGKILLs in fifty seconds, straight after launch.
    const budget = new RevivalBudget();
    budget.started(T0);
    for (const at of [2_000, 17_000, 21_000, 50_000]) {
      const decision = budget.decide(killed, T0 + at);
      expect(decision.restart, `kill at +${at / 1000} s`).toBe(true);
      budget.started(T0 + at);
    }
  });

  it('still bounds external kills, so a process that kills on sight cannot make the shell spin', () => {
    const budget = new RevivalBudget();
    budget.started(T0);
    let now = T0;
    for (let i = 0; i < KILL_LIMIT; i += 1) {
      now += 1_000;
      expect(budget.decide(killed, now).restart).toBe(true);
      budget.started(now);
    }
    const refused = budget.decide(killed, now + 1_000);
    expect(refused.restart).toBe(false);
    expect(refused.detail).toMatch(/killed 10 times in five minutes/);
  });

  it('stops restarting a service that crashes within seconds of every start', () => {
    const budget = new RevivalBudget();
    budget.started(T0);
    let now = T0;
    for (let i = 0; i < CRASH_LOOP_LIMIT; i += 1) {
      now += 2_000;
      expect(budget.decide(crashed, now).restart).toBe(true);
      budget.started(now);
    }
    const refused = budget.decide(crashed, now + 2_000);
    expect(refused.restart).toBe(false);
    expect(refused.detail).toMatch(/3 crash-loop restarts in five minutes/);
  });

  it('does not count a crash after a long healthy run as a loop, and forgets earlier ones', () => {
    const budget = new RevivalBudget();
    budget.started(T0);
    budget.decide(failed, T0 + 1_000);
    budget.started(T0 + 1_000);
    budget.decide(failed, T0 + 2_000);
    budget.started(T0 + 2_000);
    // An hour of service, then an exit code: a fresh incident.
    const later = budget.decide(failed, T0 + 3_600_000);
    expect(later.restart).toBe(true);
    budget.started(T0 + 3_600_000);
    // The two early crashes no longer count against it.
    for (let i = 1; i <= CRASH_LOOP_LIMIT; i += 1) {
      const at = T0 + 3_600_000 + i * 1_000;
      expect(budget.decide(crashed, at).restart).toBe(true);
      budget.started(at);
    }
  });

  it('keeps kills and crashes on separate budgets', () => {
    const budget = new RevivalBudget();
    budget.started(T0);
    let now = T0;
    for (let i = 0; i < CRASH_LOOP_LIMIT; i += 1) {
      now += 1_000;
      budget.decide(crashed, now);
      budget.started(now);
    }
    // The crash budget is spent; a kill is still restarted.
    expect(budget.decide(killed, now + 1_000).restart).toBe(true);
  });

  it('forgets everything outside the five-minute window', () => {
    const budget = new RevivalBudget();
    budget.started(T0);
    let now = T0;
    for (let i = 0; i < KILL_LIMIT; i += 1) {
      now += 100;
      budget.decide(killed, now);
      budget.started(now);
    }
    expect(budget.decide(killed, now + 100).restart).toBe(false);
    expect(budget.decide(killed, now + WINDOW_MS + 1).restart).toBe(true);
  });
});
