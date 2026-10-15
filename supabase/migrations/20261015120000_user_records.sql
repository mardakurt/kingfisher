-- Kingfisher accounts: the cloud replica of a person's authored work.
--
-- Shape, and why it is one table rather than thirty.
--
-- Kingfisher's records are defined, validated and migrated in TypeScript
-- (`src/persistence/validation.ts`, `src/persistence/schema/migrations.ts`).
-- Every authored IndexedDB store is already a list of self-describing JSON
-- records keyed by `id`, and the portable backup proves they round-trip as
-- JSON. Mirroring thirty stores as thirty Postgres tables would give the
-- schema two owners that must be migrated in lockstep, and the first time
-- they disagreed a sync would either reject a valid record or accept an
-- invalid one. So the cloud stores each record opaquely, keyed by
-- (owner, store, key), with the metadata that sync itself needs: a server
-- revision for compare-and-swap, a server sequence for incremental pulls, a
-- content hash so an unchanged record is never re-sent, and a tombstone so a
-- delete on one device reaches the others.
--
-- Security is entirely here, never in the client: every row has an owner,
-- Row Level Security admits only that owner, and the publishable key the
-- browser holds grants nothing to an anonymous caller.

-- ---------------------------------------------------------------------------
-- Profiles: one row per account, created by trigger on sign-up.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner updates" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Records.

create sequence public.user_records_seq;

create table public.user_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- An IndexedDB store name, or a virtual store such as `preferences`.
  store text not null check (store ~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$'),
  record_key text not null check (char_length(record_key) between 1 and 512),
  -- Null exactly when the record has been deleted.
  value jsonb,
  -- SHA-256 of the client's canonical JSON, lower-case hex.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 1,
  seq bigint not null default nextval('public.user_records_seq'),
  deleted_at timestamptz,
  -- Which device last wrote the row; shown when a conflict is explained.
  device_id text check (device_id is null or char_length(device_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, store, record_key),
  constraint user_records_tombstone check ((deleted_at is null) = (value is not null)),
  -- A study chapter with a long annotated game is tens of kilobytes; eight
  -- megabytes is far past any authored record and stops one runaway client
  -- from filling the database.
  constraint user_records_value_size check (value is null or pg_column_size(value) <= 8388608)
);

create index user_records_user_seq on public.user_records (user_id, seq);

alter table public.user_records enable row level security;

create policy "user_records: owner reads" on public.user_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_records: owner inserts" on public.user_records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_records: owner updates" on public.user_records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "user_records: owner deletes" on public.user_records
  for delete to authenticated using (user_id = (select auth.uid()));

-- The server, not the client, decides revision, sequence and timestamps. A
-- client that sends its own revision cannot skip the compare-and-swap, and a
-- row can never be moved to another owner (RLS `with check` refuses that
-- too; this makes the refusal independent of the policy text).
create function public.user_records_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
  else
    if new.user_id <> old.user_id or new.store <> old.store or new.record_key <> old.record_key then
      raise exception 'a record''s owner and identity cannot change' using errcode = '42501';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  end if;
  new.seq := nextval('public.user_records_seq');
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_records_stamp
  before insert or update on public.user_records
  for each row execute function public.user_records_stamp();

-- ---------------------------------------------------------------------------
-- Push: compare-and-swap, many records per call.
--
-- Each change carries the revision the client last saw (`base`, 0 for a
-- record it has never synced). The write lands only if that is still the
-- server's revision, or if the server already holds identical content — so
-- a retried push after a lost response is a no-op rather than a conflict.
-- Anything else is returned as a conflict with the server's row, and the
-- client decides; the server never merges.
--
-- SECURITY INVOKER: the function runs as the caller, so every statement in
-- it is subject to the same RLS as a direct query. `auth.uid()` is null for
-- an anonymous caller and the function refuses before touching a row.

create function public.push_user_records(changes jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  change jsonb;
  existing public.user_records%rowtype;
  next_row public.user_records%rowtype;
  results jsonb := '[]'::jsonb;
  incoming_value jsonb;
  incoming_hash text;
  base bigint;
begin
  if owner is null then
    raise exception 'sign in to sync' using errcode = '42501';
  end if;
  if jsonb_typeof(changes) <> 'array' then
    raise exception 'changes must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(changes) > 200 then
    raise exception 'at most 200 changes per push' using errcode = '22023';
  end if;

  for change in select * from jsonb_array_elements(changes) loop
    incoming_value := change -> 'value';
    if incoming_value = 'null'::jsonb then incoming_value := null; end if;
    incoming_hash := change ->> 'hash';
    base := coalesce((change ->> 'base')::bigint, 0);

    select * into existing from public.user_records
      where user_id = owner and store = change ->> 'store' and record_key = change ->> 'key'
      for update;

    if not found then
      if incoming_value is null and base = 0 then
        -- Deleting something the server never had: nothing to record.
        results := results || jsonb_build_object(
          'store', change ->> 'store', 'key', change ->> 'key', 'status', 'absent');
        continue;
      end if;
      insert into public.user_records (user_id, store, record_key, value, content_hash, deleted_at, device_id)
      values (
        owner, change ->> 'store', change ->> 'key', incoming_value, incoming_hash,
        case when incoming_value is null then now() end, change ->> 'device')
      returning * into next_row;
      results := results || jsonb_build_object(
        'store', next_row.store, 'key', next_row.record_key, 'status', 'applied',
        'revision', next_row.revision, 'seq', next_row.seq);
    elsif existing.content_hash = incoming_hash
      and (existing.value is null) = (incoming_value is null) then
      results := results || jsonb_build_object(
        'store', existing.store, 'key', existing.record_key, 'status', 'unchanged',
        'revision', existing.revision, 'seq', existing.seq);
    elsif existing.revision = base then
      update public.user_records set
        value = incoming_value,
        content_hash = incoming_hash,
        deleted_at = case when incoming_value is null then now() end,
        device_id = change ->> 'device'
      where user_id = owner and store = existing.store and record_key = existing.record_key
      returning * into next_row;
      results := results || jsonb_build_object(
        'store', next_row.store, 'key', next_row.record_key, 'status', 'applied',
        'revision', next_row.revision, 'seq', next_row.seq);
    else
      results := results || jsonb_build_object(
        'store', existing.store, 'key', existing.record_key, 'status', 'conflict',
        'revision', existing.revision, 'seq', existing.seq, 'hash', existing.content_hash,
        'value', existing.value, 'deleted', existing.value is null, 'device', existing.device_id);
    end if;
  end loop;

  return results;
end;
$$;

revoke all on function public.push_user_records(jsonb) from public, anon;
grant execute on function public.push_user_records(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion. Removing the auth user cascades to every owned row.
-- SECURITY DEFINER because `auth.users` is not writable by `authenticated`;
-- the function deletes exactly one row, the caller's own, and nothing else.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'sign in to delete an account' using errcode = '42501';
  end if;
  delete from auth.users where id = owner;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Grants. Nothing for `anon`; the minimum for `authenticated`, with RLS doing
-- the per-row work.

revoke all on public.profiles from anon;
revoke all on public.user_records from anon;
grant select, update (display_name, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_records to authenticated;
revoke all on sequence public.user_records_seq from anon;
grant usage on sequence public.user_records_seq to authenticated;

-- Realtime: a change on one device wakes the others. The payload is never
-- trusted as data — a wake-up triggers an ordinary pull, which RLS filters.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_records;
  end if;
end;
$$;
