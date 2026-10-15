/**
 * The account boundary, executed by Postgres.
 *
 * Every assertion here runs the real migration in a real Postgres (PGlite),
 * as the role and with the JWT claims Supabase's PostgREST would use. A
 * policy that let one account read, change or delete another's row fails
 * one of these. Each was checked against a deliberately broken policy
 * (`using (true)`) while writing it; see the "a test that cannot fail" rule
 * in AGENTS.md.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSupabaseHarness, type SupabaseHarness } from './test-support/pglite-supabase';

const ALICE = '00000000-0000-4000-8000-00000000a11c';
const BOB = '00000000-0000-4000-8000-000000000b0b';
const HASH_1 = '1'.repeat(64);
const HASH_2 = '2'.repeat(64);
const HASH_3 = '3'.repeat(64);

const alice = { role: 'authenticated', sub: ALICE } as const;
const bob = { role: 'authenticated', sub: BOB } as const;
const anon = { role: 'anon' } as const;

type PushResult = {
  store: string;
  key: string;
  status: 'applied' | 'unchanged' | 'conflict' | 'absent';
  revision?: number;
  seq?: number;
  value?: unknown;
};

let harness: SupabaseHarness;

async function push(
  caller: typeof alice | typeof bob,
  changes: readonly Record<string, unknown>[],
): Promise<PushResult[]> {
  return harness.as(caller, async (tx) => {
    const result = await tx.query<{ push_user_records: PushResult[] }>(
      'select public.push_user_records($1::jsonb)',
      [JSON.stringify(changes)],
    );
    return result.rows[0]!.push_user_records;
  });
}

beforeAll(async () => {
  harness = await startSupabaseHarness();
  await harness.createUser(ALICE, { full_name: 'Alice Analyst' });
  await harness.createUser(BOB);
  await push(alice, [
    {
      store: 'studies',
      key: 'study-a',
      value: { id: 'study-a', title: 'Najdorf' },
      hash: HASH_1,
      base: 0,
    },
  ]);
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

describe('profiles', () => {
  it('is created on sign-up with the name the provider supplied', async () => {
    const rows = await harness.as(alice, (tx) =>
      tx.query<{ display_name: string | null }>('select display_name from public.profiles'),
    );
    expect(rows.rows).toEqual([{ display_name: 'Alice Analyst' }]);
  });

  it('shows each account only its own profile', async () => {
    const rows = await harness.as(bob, (tx) =>
      tx.query<{ id: string }>('select id from public.profiles'),
    );
    expect(rows.rows.map((row) => row.id)).toEqual([BOB]);
  });

  it('refuses an update to somebody else’s profile', async () => {
    const changed = await harness.as(bob, (tx) =>
      tx.query(`update public.profiles set display_name = 'hijacked' where id = $1`, [ALICE]),
    );
    expect(changed.affectedRows).toBe(0);
  });
});

describe('user_records isolation', () => {
  it('lets the owner read their own record', async () => {
    const rows = await harness.as(alice, (tx) =>
      tx.query<{ record_key: string }>('select record_key from public.user_records'),
    );
    expect(rows.rows.map((row) => row.record_key)).toEqual(['study-a']);
  });

  it('shows another account nothing, even asking by owner id', async () => {
    const rows = await harness.as(bob, (tx) =>
      tx.query('select * from public.user_records where user_id = $1', [ALICE]),
    );
    expect(rows.rows).toEqual([]);
  });

  it('lets another account neither update nor delete the row', async () => {
    const updated = await harness.as(bob, (tx) =>
      tx.query(`update public.user_records set value = '{"id":"x"}' where user_id = $1`, [ALICE]),
    );
    const deleted = await harness.as(bob, (tx) =>
      tx.query('delete from public.user_records where user_id = $1', [ALICE]),
    );
    expect(updated.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);
    const still = await harness.as(alice, (tx) =>
      tx.query<{ value: { title: string } }>('select value from public.user_records'),
    );
    expect(still.rows[0]!.value.title).toBe('Najdorf');
  });

  it('refuses a row inserted in somebody else’s name', async () => {
    await expect(
      harness.as(bob, (tx) =>
        tx.query(
          `insert into public.user_records (user_id, store, record_key, value, content_hash)
           values ($1, 'studies', 'planted', '{"id":"planted"}', $2)`,
          [ALICE, HASH_1],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses to move a row to another owner', async () => {
    await expect(
      harness.as(alice, (tx) =>
        tx.query('update public.user_records set user_id = $1 where record_key = $2', [
          BOB,
          'study-a',
        ]),
      ),
    ).rejects.toThrow();
  });

  it('gives the anonymous role nothing at all', async () => {
    await expect(
      harness.as(anon, (tx) => tx.query('select * from public.user_records')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      harness.as(anon, (tx) => tx.query(`select public.push_user_records('[]'::jsonb)`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      harness.as(anon, (tx) => tx.query('select * from public.profiles')),
    ).rejects.toThrow(/permission denied/);
  });

  it('keeps one account’s push away from another’s record with the same key', async () => {
    const result = await push(bob, [
      {
        store: 'studies',
        key: 'study-a',
        value: { id: 'study-a', title: 'Bob' },
        hash: HASH_2,
        base: 0,
      },
    ]);
    expect(result[0]).toMatchObject({ status: 'applied', revision: 1 });
    const aliceRow = await harness.as(alice, (tx) =>
      tx.query<{ value: { title: string } }>(
        `select value from public.user_records where record_key = 'study-a'`,
      ),
    );
    expect(aliceRow.rows.map((row) => row.value.title)).toEqual(['Najdorf']);
  });
});

describe('push_user_records', () => {
  it('applies a change made on the revision the client last saw', async () => {
    const [first] = await push(alice, [
      { store: 'repertoires', key: 'rep-1', value: { id: 'rep-1', n: 1 }, hash: HASH_1, base: 0 },
    ]);
    expect(first).toMatchObject({ status: 'applied', revision: 1 });
    const [second] = await push(alice, [
      { store: 'repertoires', key: 'rep-1', value: { id: 'rep-1', n: 2 }, hash: HASH_2, base: 1 },
    ]);
    expect(second).toMatchObject({ status: 'applied', revision: 2 });
    expect(second!.seq).toBeGreaterThan(first!.seq!);
  });

  it('returns the server row, and writes nothing, when the base is stale', async () => {
    const [stale] = await push(alice, [
      { store: 'repertoires', key: 'rep-1', value: { id: 'rep-1', n: 99 }, hash: HASH_3, base: 1 },
    ]);
    expect(stale).toMatchObject({ status: 'conflict', revision: 2, value: { id: 'rep-1', n: 2 } });
  });

  it('treats a retried push of identical content as unchanged, not a conflict', async () => {
    const [retry] = await push(alice, [
      { store: 'repertoires', key: 'rep-1', value: { id: 'rep-1', n: 2 }, hash: HASH_2, base: 1 },
    ]);
    expect(retry).toMatchObject({ status: 'unchanged', revision: 2 });
  });

  it('records a delete as a tombstone that a later pull can see', async () => {
    const [deleted] = await push(alice, [
      { store: 'repertoires', key: 'rep-1', value: null, hash: HASH_1, base: 2 },
    ]);
    expect(deleted).toMatchObject({ status: 'applied', revision: 3 });
    const row = await harness.as(alice, (tx) =>
      tx.query<{ value: unknown; deleted_at: string | null }>(
        `select value, deleted_at from public.user_records where record_key = 'rep-1'`,
      ),
    );
    expect(row.rows[0]!.value).toBeNull();
    expect(row.rows[0]!.deleted_at).not.toBeNull();
  });

  it('does not invent a tombstone for a record the server never had', async () => {
    const [absent] = await push(alice, [
      { store: 'studies', key: 'never-synced', value: null, hash: HASH_1, base: 0 },
    ]);
    expect(absent!.status).toBe('absent');
  });

  it('ignores a client-supplied revision written directly', async () => {
    await harness.as(alice, (tx) =>
      tx.query(`update public.user_records set revision = 1000 where record_key = 'study-a'`),
    );
    const row = await harness.as(alice, (tx) =>
      tx.query<{ revision: number }>(
        `select revision from public.user_records where record_key = 'study-a'`,
      ),
    );
    expect(Number(row.rows[0]!.revision)).toBe(2);
  });

  it('refuses malformed input', async () => {
    await expect(
      push(alice, [{ store: '../etc', key: 'x', value: {}, hash: HASH_1, base: 0 }]),
    ).rejects.toThrow();
    await expect(
      push(alice, [{ store: 'studies', key: 'x', value: {}, hash: 'nothex', base: 0 }]),
    ).rejects.toThrow();
    await expect(
      push(
        alice,
        Array.from({ length: 201 }, (_, index) => ({
          store: 's',
          key: `k${index}`,
          value: {},
          hash: HASH_1,
          base: 0,
        })),
      ),
    ).rejects.toThrow(/at most 200/);
  });
});

describe('delete_my_account', () => {
  it('removes the caller’s account and rows, and only the caller’s', async () => {
    await harness.as(bob, (tx) => tx.query('select public.delete_my_account()'));
    const bobRows = await harness.db.query(`select 1 from public.user_records where user_id = $1`, [
      BOB,
    ]);
    const aliceRows = await harness.db.query(
      `select 1 from public.user_records where user_id = $1`,
      [ALICE],
    );
    const users = await harness.db.query<{ id: string }>('select id from auth.users');
    expect(bobRows.rows).toHaveLength(0);
    expect(aliceRows.rows.length).toBeGreaterThan(0);
    expect(users.rows.map((row) => row.id)).toEqual([ALICE]);
  });

  it('cannot be called anonymously', async () => {
    await expect(
      harness.as(anon, (tx) => tx.query('select public.delete_my_account()')),
    ).rejects.toThrow(/permission denied/);
  });
});
