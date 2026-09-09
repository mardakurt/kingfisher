# Optional account sync architecture

> The decision document for the cross-device, opt-in cloud layer
> Kingfisher gains in Phase 28. The brief calls for evaluation; this
> ADR records the candidates and the chosen direction.

## Status

**Proposed**, not yet implemented. The application remains
local-first and account-free by default. This ADR is the design
record for what would be built if the owner authorises Phase 28 to
proceed.

## Context

Kingfisher is local-first. Studies, Repertoire, Training,
Preparation, Opening Files, Notes, and Preferences live in
IndexedDB on the user's device. A user who closes the laptop and
returns tomorrow sees their work; a user who switches device or
browser does not.

Phase 28 asks: what architecture should a *purely optional*
cross-device sync layer follow?

The constraints are:

- **No signup wall.** Local-first is the default. Sync is opt-in.
- **Local writes must continue.** The cloud is a replica; the
  source of truth is the user's machine.
- **No silent data loss.** If a user enables sync and the network
  drops, edits must queue and drain on reconnect.
- **No multi-GB clouds.** Sync covers user-authored metadata. Reference
  packs stay device-local.
- **Privacy matters.** Every byte uploaded should be one the user
  explicitly asked to upload.

## Options evaluated

### Option 1 — Supabase Auth + Postgres + RLS

**Strengths.** Postgres Row Level Security is enforced at the
database, not the application. The browser only needs the public
URL and the publishable anon key. Email magic-link auth is built
in and removes the need for any home-grown password handling.
Postgres has good support for tombstoning, revision columns, and
server-side timestamps. Supabase ships row-level backups and a
dashboard for free.

**Weaknesses.** Vendor lock-in to Supabase's specific Postgres
extensions and realtime features. Real-time channels are an extra
cost in some plans. Magic-link auth requires an email provider.

**Migration difficulty.** Low. A future move to a self-hosted
Postgres is a dump-and-load plus a small middleware rewrite of
the four query functions.

### Option 2 — Firebase Auth + Firestore

**Strengths.** Firestore's document model fits authored data with
shaped subcollections (e.g. a Study with chapters). Real-time
listeners are built-in.

**Weaknesses.** NoSQL document model is awkward for queries that
join across "tables" (a Repertoire cross-referenced with a Study).
Security rules are easier to write wrongly than Postgres RLS, and
a misconfigured rule is silent data leakage. Vendor lock-in is
stronger — Firestore queries are not portable. Pricing per
document read is expensive on a feature-heavy app.

**Migration difficulty.** High. Firestore queries are not portable
to a relational store without a data model rewrite.

### Option 3 — Custom Vercel/Postgres + own auth

**Strengths.** No vendor lock-in; full control over the data model.

**Weaknesses.** Custom auth means rolling our own password reset,
session refresh, MFA, and rate-limiting. The brief explicitly
forbids home-grown authentication. Verifying the security of a
custom auth implementation is significantly more work than
auditing a vendor's.

**Migration difficulty.** Trivial if started that way; not an
argument for choosing it.

## Decision

**Supabase Auth + Postgres + Row Level Security.**

Rationale:

1. The brief is explicit: "Do NOT build a custom authentication
   system from scratch." Both Supabase and Firebase satisfy this.
2. Postgres RLS is enforced at the database; the application
   cannot accidentally authorise the wrong row even if a
   developer makes a mistake. Firestore rules are configurable but
   easier to mis-author.
3. Email magic-link auth is the brief's preferred first method;
   Supabase ships it.
4. Migration difficulty is low. A future move to a self-hosted
   Postgres is straightforward.

### Authorisation rules (proposed)

Every sync table has:

- A `user_id uuid` column linked to `auth.users`.
- A Row Level Security policy that restricts `SELECT`, `INSERT`,
  `UPDATE`, `DELETE` to rows where `auth.uid() = user_id`.
- An explicit `WITH CHECK` clause so an `UPDATE` cannot move a
  row to another user's ownership.
- A test in `supabase/tests/` that asserts another user's row is
  inaccessible even when the JWT is present.

The browser bundle contains only:

- `NEXT_PUBLIC_SUPABASE_URL` — the project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the publishable key.

Never the `service_role` key. A grep over the compiled client
output is part of the CI pipeline (`scripts/security-scan.mjs`).

### Synced domains (proposed)

| Domain | Why | Why not |
| --- | --- | --- |
| Studies | Authored, small, frequently edited | — |
| Study chapters | Owned by a Study | — |
| Repertoire decisions | Authored, central to the app | — |
| Training sets + scheduler state | Authored | — |
| Preparation sessions | Authored | — |
| Opening Files | Authored | — |
| Review / decision journal | Authored | — |
| Notes | Authored | — |
| Preferences (theme, recent windows, …) | Carried between devices | — |

### What does NOT sync

- Reference packs (Elite OTB, Recent Theory, High-Rated Online).
  These are immutable, multi-hundred-megabyte archives; the
  destination device downloads its own copy if wanted.
- Engine binaries and tablebases. GPL, multi-gigabyte, device-local.
- Personal SQLite / En Croissant databases. The user's own
  collection; explicit per-collection export only.
- The Lichess API token, the assistant API key, the companion
  token. Sync metadata may *flag* "Lichess connected", never the
  secret itself.

### Conflict policy (proposed)

Optimistic revision check on every uploaded row. Each synced row
carries an integer `revision`. The cloud side stores the highest
`revision` it has accepted per `id`. An upload with a
`revision` lower than the cloud-side high water mark is treated
as a conflict:

- The cloud returns the higher-revision row.
- The client surfaces both side by side: "Study 'Najdorf prep' —
  conflict copy from MacBook" alongside the local version.
- The user picks which survives; the loser is tombstoned.

The brief asks for "practical conflict strategy". A CRDT is not
justified at the current data volumes.

### Tombstoning (proposed)

Cross-device delete uses a `deleted_at` timestamp rather than
`DELETE`. A row with `deleted_at IS NOT NULL` is invisible to
queries but is preserved for `30` days so an offline device that
deletes locally and reconnects after `31` days does not have
its deletion silently undone by a server-side replay.

### First-login flow (proposed)

The brief is explicit: "DO NOT replace their local work with an
empty cloud account." On first sign-in, the application must
detect local authored content and offer:

> Existing work found on this device.
> Sync this work to your account?
> [ Sync my work ]   [ Not now ]

Sync my work uploads the local content as `revision: 1` and
records the upload in a sync journal so subsequent updates use
the correct base.

### Sign-out flow (proposed)

Sign-out is not destructive. Local work stays on the device. The
sign-out action is explicit, with a confirmation: "Keep local
work on this device" is the default.

### Account deletion (proposed)

The application offers an account-deletion path. Deletion is
real: a server-side worker deletes every row owned by the user
across every sync table. Local work is preserved unless the user
explicitly asks for it to be removed.

## Consequences

Positive:

- A user who enables sync gets continuity across devices.
- A user who does not enable sync is unaffected.
- RLS makes a cross-user read/write impossible to ship by accident.

Negative:

- A new vendor in the stack.
- A new compliance surface (Supabase DPA, EU data residency,
  privacy copy).

## What this ADR does NOT do

- It does not implement sync. Implementation requires:
  - A Supabase project (the owner creates the project).
  - A database schema migration script.
  - A sync journal in IndexedDB.
  - Wiring the existing `repositories.*` to enqueue mutations on
    mutation while signed-in.
  - A Vercel preview environment variable for the public URL and
    the publishable anon key.

Those are tasks for a future phase, gated by the owner's
authorisation to provision a Supabase project.

## Open questions

- **Email provider.** Magic-link delivery needs SMTP or
  transactional email. Supabase Auth ships with a built-in SMTP
  relay at the free tier, but production may want a dedicated
  provider. Defer.
- **Data residency.** Kingfisher is used internationally. The
  Supabase project's region is a deploy-time decision.
- **Compliance.** Whether to file Kingfisher under a privacy
  framework (GDPR, CCPA) is a legal question, not a technical
  one. Sync makes the answer non-trivial.

## References

- Phase 28 brief, parts G through V.
- Supabase Auth docs — https://supabase.com/docs/guides/auth
- Supabase RLS docs — https://supabase.com/docs/guides/auth/row-level-security