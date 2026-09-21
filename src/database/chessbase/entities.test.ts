import { describe, expect, it } from 'vitest';

import { playerName, readPlayers, readSources } from './entities';
import { fixtureBytes } from './fixtures';

/** An entity file of the documented shape, with one record marked deleted. */
function playerFile(
  records: readonly { last: string; first: string; deleted?: boolean }[],
): Uint8Array {
  const RECORD = 9 + 58;
  const out = new Uint8Array(32 + records.length * RECORD);
  const view = new DataView(out.buffer);
  view.setInt32(0, records.length, true);
  view.setInt32(4, 0, true);
  view.setInt32(8, 1234567890, true);
  view.setInt32(12, 58, true);
  view.setInt32(16, -1, true);
  view.setInt32(20, records.filter((r) => !r.deleted).length, true);
  view.setInt32(24, 4, true);
  records.forEach((record, index) => {
    const at = 32 + index * RECORD;
    view.setInt32(at, record.deleted ? -999 : -1, true);
    view.setInt32(at + 4, -1, true);
    out.set(new TextEncoder().encode(record.last), at + 9);
    out.set(new TextEncoder().encode(record.first), at + 9 + 30);
    view.setUint32(at + 9 + 50, 3, true);
  });
  return out;
}

describe('entity files', () => {
  it('reads players by id and formats them the PGN way', () => {
    const table = readPlayers(
      playerFile([
        { last: 'Carlsen', first: 'Magnus' },
        { last: 'Anand', first: '' },
      ]),
    );
    expect(table.count).toBe(2);
    expect(playerName(table.records[0])).toBe('Carlsen, Magnus');
    expect(playerName(table.records[1])).toBe('Anand');
    expect(table.records[0]).toMatchObject({ games: 3 });
  });

  it('keeps a deleted record as a hole so later ids still line up', () => {
    const table = readPlayers(
      playerFile([
        { last: 'Gone', first: 'X', deleted: true },
        { last: 'Here', first: 'Y' },
      ]),
    );
    expect(table.records[0]).toBeNull();
    expect(playerName(table.records[1])).toBe('Here, Y');
    expect(playerName(table.records[0])).toBe('');
  });

  it('reads nothing from a file whose record size is not the documented one', () => {
    const file = playerFile([{ last: 'A', first: 'B' }]);
    new DataView(file.buffer).setInt32(12, 60, true);
    expect(readPlayers(file).records).toEqual([]);
  });

  it('reads the sources of a database ChessBase wrote, with their dates', () => {
    const sources = readSources(fixtureBytes('world-ch/World-ch.cbs'));
    expect(sources.records[0]).toMatchObject({ name: 'MainBase' });
    expect(sources.records.some((source) => source?.name === 'CBM 176')).toBe(true);
  });
});
