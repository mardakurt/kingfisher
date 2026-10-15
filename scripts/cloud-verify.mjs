#!/usr/bin/env node
/**
 * Live check of a real Supabase project's account boundary.
 *
 * `src/sync/cloud/rls.test.ts` proves the migration in a local Postgres. This
 * proves the *deployed* project: that the migration was applied, that
 * PostgREST exposes what the application calls and nothing to `anon`, and
 * that one account cannot read, change, delete or plant another's rows —
 * through the same HTTP API and publishable key the browser uses.
 *
 * It creates two throwaway, pre-confirmed users with the secret key, runs
 * every check as them with the publishable key, and deletes them (through
 * the application's own `delete_my_account`, which is checked too). The
 * secret key is read from the environment of the shell that runs this and
 * is never written anywhere.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   SUPABASE_SECRET_KEY=sb_secret_... \
 *   npm run cloud:verify
 */

import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishable || !secret) {
  console.error(
    'Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (see docs/operations/supabase-setup.md).',
  );
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK' : 'XX'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const HASH = (n) => String(n).repeat(64).slice(0, 64);
const password = `verify-${randomUUID()}`;
const created = [];

async function makeUser(label) {
  const email = `kingfisher-verify-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create ${label}: ${error.message}`);
  created.push(data.user.id);
  const client = createClient(url, publishable, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`could not sign in ${label}: ${signedIn.error.message}`);
  return { id: data.user.id, client };
}

try {
  const anon = createClient(url, publishable, options);
  const anonRead = await anon.from('user_records').select('*');
  check(
    'anonymous caller reads nothing',
    Boolean(anonRead.error) || (anonRead.data ?? []).length === 0,
    anonRead.error?.message ?? `${anonRead.data?.length ?? 0} rows`,
  );
  const anonPush = await anon.rpc('push_user_records', { changes: [] });
  check('anonymous caller cannot push', Boolean(anonPush.error), anonPush.error?.message);

  const alice = await makeUser('a');
  const bob = await makeUser('b');

  const profile = await alice.client.from('profiles').select('id');
  check(
    'sign-up created a profile visible to its owner only',
    !profile.error && profile.data?.length === 1 && profile.data[0].id === alice.id,
  );

  const pushed = await alice.client.rpc('push_user_records', {
    changes: [
      {
        store: 'studies',
        key: 'verify-study',
        value: { id: 'verify-study', title: 'A' },
        hash: HASH(1),
        base: 0,
        device: 'verify',
      },
    ],
  });
  check(
    'owner can push',
    !pushed.error && pushed.data?.[0]?.status === 'applied',
    pushed.error?.message ?? pushed.data?.[0]?.status,
  );

  const stale = await alice.client.rpc('push_user_records', {
    changes: [
      {
        store: 'studies',
        key: 'verify-study',
        value: { id: 'verify-study', title: 'B' },
        hash: HASH(2),
        base: 0,
        device: 'verify',
      },
    ],
  });
  check('a stale base is a conflict, not an overwrite', stale.data?.[0]?.status === 'conflict');

  const own = await alice.client.from('user_records').select('record_key');
  check('owner reads their row', own.data?.length === 1);

  const peek = await bob.client.from('user_records').select('*').eq('user_id', alice.id);
  check('another account reads none of it', !peek.error && peek.data?.length === 0);

  const tamper = await bob.client
    .from('user_records')
    .update({ value: { id: 'x' } })
    .eq('user_id', alice.id)
    .select();
  check('another account changes none of it', (tamper.data ?? []).length === 0);

  const remove = await bob.client.from('user_records').delete().eq('user_id', alice.id).select();
  check('another account deletes none of it', (remove.data ?? []).length === 0);

  const plant = await bob.client.from('user_records').insert({
    user_id: alice.id,
    store: 'studies',
    record_key: 'planted',
    value: { id: 'planted' },
    content_hash: HASH(3),
  });
  check('another account cannot plant a row in it', Boolean(plant.error), plant.error?.message);

  const still = await alice.client
    .from('user_records')
    .select('value')
    .eq('record_key', 'verify-study');
  check('the owner’s row is intact', still.data?.[0]?.value?.title === 'A');

  for (const user of [alice, bob]) {
    const gone = await user.client.rpc('delete_my_account');
    check(
      `delete_my_account removes ${user === alice ? 'the first' : 'the second'} account`,
      !gone.error,
      gone.error?.message,
    );
  }
  const leftovers = await admin
    .from('user_records')
    .select('user_id')
    .in('user_id', [alice.id, bob.id]);
  check('no rows survive account deletion', (leftovers.data ?? []).length === 0);
  created.length = 0;
} catch (error) {
  check(
    'verification ran to the end',
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

const failed = results.filter((result) => !result.ok).length;
console.log(
  `\n${results.length - failed}/${results.length} checks passed against ${new URL(url).host}.`,
);
process.exit(failed === 0 ? 0 : 1);
