/**
 * A real Postgres with just enough of Supabase around it to run Kingfisher's
 * migrations and exercise their security as Supabase would.
 *
 * PGlite is Postgres compiled to WebAssembly, so the policies, the triggers
 * and the PL/pgSQL functions here are executed by the same engine the hosted
 * project runs — not re-implemented in a fake. What is emulated is the part
 * Supabase adds around Postgres: the `anon` and `authenticated` roles, an
 * `auth.users` table, and `auth.uid()`, which on Supabase reads the `sub`
 * claim PostgREST places in `request.jwt.claims` for each request. `as()`
 * does exactly that, inside a transaction, under the role PostgREST would
 * use — so a test that passes here passed through RLS, not around it.
 *
 * The migration files are read from `supabase/migrations/` in order, the
 * same files `supabase db push` applies.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite, type Transaction } from '@electric-sql/pglite';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const SUPABASE_PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      coalesce(
        current_setting('request.jwt.claim.sub', true),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      ),
      ''
    )::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export type Caller =
  { readonly role: 'anon' } | { readonly role: 'authenticated'; readonly sub: string };

export interface SupabaseHarness {
  readonly db: PGlite;
  /** Create an auth user, as sign-up would. Fires the profile trigger. */
  createUser(id: string, metadata?: Record<string, unknown>): Promise<void>;
  /** Run `work` as `caller`, the way PostgREST runs a request. */
  as<T>(caller: Caller, work: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function startSupabaseHarness(): Promise<SupabaseHarness> {
  const db = new PGlite();
  await db.exec(SUPABASE_PRELUDE);
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }

  return {
    db,
    async createUser(id, metadata = {}) {
      await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [
        id,
        JSON.stringify(metadata),
      ]);
    },
    as(caller, work) {
      return db.transaction(async (tx) => {
        const claims =
          caller.role === 'authenticated'
            ? { sub: caller.sub, role: caller.role }
            : { role: 'anon' };
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify(claims),
        ]);
        await tx.exec(`set local role ${caller.role}`);
        return work(tx);
      });
    },
    close: () => db.close(),
  };
}
