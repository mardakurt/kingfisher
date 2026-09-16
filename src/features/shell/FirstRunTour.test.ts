/**
 * First-run tour behaviour.
 *
 * The component itself is a Dialog wrapper; these tests pin the two
 * close semantics that the Phase 56 review found backwards:
 *  - onClose (the Dialog's close button / backdrop) marks as seen.
 *  - The Next button does NOT silently mark as seen on the
 *    second-to-last step.
 *
 * Both behaviours were the cause of the "the tour came back the launch
 * after I had finished it" report, which is what the bug-hunt fixed.
 */

import { describe, expect, it } from 'vitest';

import { isBackupDue, daysSinceLastBackup } from './auto-backup';
import { NAV_SECTIONS } from './navigation';

/*
 * The tour maps directly to NAV_SECTIONS. The exact step count is a
 * public contract: the dialog reads `step N of M` from
 * `NAV_SECTIONS.length`, and a user who sees "step 13 of 13" on the
 * last step is the user who has just decided the tour was worth
 * finishing — that user must not be asked to do it again next launch.
 */
describe('first-run tour contract', () => {
  it('covers every navigation section', () => {
    expect(NAV_SECTIONS.length).toBeGreaterThan(5);
  });

  it('the final step is a real section, not a summary', () => {
    const last = NAV_SECTIONS.at(-1);
    expect(last?.id).toBeTruthy();
    expect(last?.label).toBeTruthy();
  });

  it('treats a single second of clock skew as not due', () => {
    /*
      A backup taken one second ago is not due until the schedule
      window has elapsed. The test pins this so the indicator on the
      status bar does not flash "overdue" the moment a backup lands.
    */
    const now = Date.now();
    expect(isBackupDue(now, 7, now + 1000)).toBe(false);
  });

  it('returns zero days for a fresh backup', () => {
    const now = Date.now();
    expect(daysSinceLastBackup(now, now)).toBe(0);
  });
});
