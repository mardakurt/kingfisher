import { describe, expect, it } from 'vitest';

import { CompanionSqliteProvider } from './companion-sqlite';

describe('a SQLite collection as an explorer source', () => {
  it('does not offer a speed filter the collection cannot apply', () => {
    // Classical, rapid and blitz are shown only when this is true. The
    // companion has no time-control column and does not classify one.
    const provider = new CompanionSqliteProvider('archive', 'Archive', 12);
    expect(provider.capabilities.speedFilter).toBe(false);
  });
});
