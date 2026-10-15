# 2026-10-15 — accounts, sync, Describe search, and the database proposal

The report of one working session against the "major product overhaul"
brief. It says what was built, what was verified and how, what was not
done, and what needs the owner. Gate results are at the end and are the
output of commands run on the final tree.

```
branch   master
start    008fc4cc  "Point public downloads at the published, verified 1.5.2"
```

## 1. Where Kingfisher actually stood

Before changing anything: Kingfisher is 89+ phases into a ChessBase-parity
program, with eight dated ChessBase comparison documents, a parity ledger,
and 4,300+ unit and 550 browser tests. It already has analysis with native
and browser engines, studies, a position-keyed repertoire with a
maintenance inbox, preparation, an Opening Report, a boolean game-query
model with saved queries, a ChessBase `.cbh/.cbv` reader verified against
ChessBase's own output, puzzles, training, a desktop application with
Sparkle updates, and a 10-million-game companion index measured end to
end. The ChessBase research was therefore **extended, not redone**: the
existing comparisons are current to 2026-10-07, and this session re-read
the publisher facts that bear on the database question (§5).

The largest gaps the ledger itself recorded were: no continuity across
devices (**blocked**: no accounts), no large hosted corpus, and the
public-claims rules that any account work had to respect.

## 2. What changed

### Accounts and cloud sync — implemented, tested, **not yet switched on**

| Piece                                                                                                                                                                | Where                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Email/password sign-up and sign-in, Google OAuth, email confirmation, password reset, change password, display name, sign-out, account deletion                      | `src/features/account/`, `src/app/{sign-in,sign-up,forgot-password,auth,account}` |
| Session (PKCE, persistent, auto-refresh), kept in local storage, not a cookie                                                                                        | `src/sync/cloud/supabase-client.ts`                                               |
| Schema: `profiles`, `user_records`; RLS on both; nothing for `anon`; server-stamped revision and sequence; compare-and-swap `push_user_records`; `delete_my_account` | `supabase/migrations/20261015120000_user_records.sql`                             |
| Sync engine: content-hash diff, incremental pull, periodic reconcile, batching, conflict preservation                                                                | `src/sync/cloud/sync-engine.ts`                                                   |
| Per-device sync state, separate from the work and from backups                                                                                                       | `src/persistence/sync-state.ts`                                                   |
| Write notification after commit                                                                                                                                      | `src/persistence/change-feed.ts`                                                  |
| Triggers: local writes (2 s debounce), focus, network return, 60 s poll, 15 min reconcile, Realtime doorbell; retry with backoff                                     | `src/stores/account-store.ts`                                                     |
| First-sign-in question for existing local work                                                                                                                       | `src/features/account/ImportLocalWorkDialog.tsx`                                  |
| Account page: sync status, "what syncs", conflicts to review, profile, security, sign-out (keep or remove synced copies), delete                                     | `src/features/account/AccountRoute.tsx`                                           |
| Sidebar account entry with sync status                                                                                                                               | `src/features/account/SidebarAccount.tsx`                                         |
| An open chapter replaced by another device's version reloads, or reports a conflict if edited                                                                        | `cross-tab.ts` `announceChapterReplaced`, `useWorkspacePersistence.ts`            |

**What syncs:** every store in `PORTABLE_STORES` — studies and chapters
(with all variations, comments and annotations), unsaved-analysis drafts,
repertoires and their positions, training items, reviews and sets,
preparation sessions, opening files, endgame positions, pinned lines,
journal, decisions, review items, saved queries, stored engine evidence,
puzzle attempts, team records, player identities, source sets and the
rest — except two device-local job queues (`DEVICE_ONLY_STORES`), plus the
preferences that describe the person (board, pieces, theme, engine display,
explorer filters). **What does not:** imported game collections and
reference packs (large, re-importable, and in Mega's case licensed to the
person, not to Kingfisher), engines, tablebases, API tokens, and
machine-specific settings.

**Browser storage, reviewed.** IndexedDB remains the working copy — the
offline, instant, crash-safe store every feature is built on — and is no
longer the _only_ copy for a signed-in person. `localStorage` holds
preferences (synced where personal), UI state (layout, tabs, recent
filters: per device by design), the device id, and the auth session.
Nothing authoritative for a signed-in user is browser-only any more except
the deliberate exclusions above.

**Design choices worth knowing** (recorded in the ADR,
`docs/adr/00xx-optional-account-sync.md`): one opaque record table
rather than thirty mirrored tables; the server's version wins a conflict
everywhere and the losing local version is kept for the person; work
another account synced on a shared browser is never offered for upload;
tombstones are kept indefinitely.

**Not switched on:** there is no Supabase project yet.
`src/release/public-services.json` records that, SECURITY.md and the
privacy page say so, and `docs:check` refuses any page that claims
otherwise — or that stays silent about the region once it is on.

### Describe search — a ChessBase gap turned into an advantage

The Library's **Describe** bar compiles a sentence ("Carlsen as Black in
the Najdorf since 2018, rated over 2700, blitz") into the existing
`GameQuery`, shows each condition before it runs, lists words it did not
understand, and refuses phrases it cannot express exactly ("Carlsen wins"
with no colour). Deterministic and offline; vocabulary from the CC0
opening classification and the strategic-theme registry.
`src/database/query/natural.ts`.

**Defect found on the way:** re-applying any saved query dropped its
opening condition (`applyFilter` never restored it). Fixed; the browser
test fails without the fix.

### Landing

A "Coming from ChessBase?" section — the workflows a ChessBase user has,
where each lives in Kingfisher, and an explicit "not offered" for Mega
Database, Let's Check and Engine Cloud. Sign in / Account in the nav,
rendered only where an account service exists. Copy changed from "no
account" to "no account required" everywhere it appeared, consistently
with the privacy page.

The landing was **not** redesigned wholesale. Phase 84 deliberately drew
it in the Studio's own design system, with rules about claims and colour
tokens that tests enforce; the new section follows them. A visual
redesign that discards that decision should be the owner's call.

### Studio

The Account page uses the Studio's `PageHeader` (the header-controls
suite caught that a first version did not, leaving it without the command
palette and Settings). The sidebar shows who is signed in and the sync
state. **A wholesale Studio redesign was not attempted** in this session:
the Studio is a mature, heavily tested Mac-style workstation, and the
work with the highest value per risk was the account system the brief
made mandatory. See §6.

### Large database — proposal only, as asked

`docs/product/2026-10-15-global-database-proposal.md`: sources with
licences and sizes read today, a hybrid architecture (open populations as
signed, content-addressed shards on Cloudflare R2, queried by the client;
the player's own databases local; licensed data only by agreement),
storage and indexing with measured per-game figures, monthly delta
updates, a cost model (about **$1.50/month** hosted for ~100 GB, egress
free), legal analysis, and a roadmap. **Nothing was downloaded or hosted.**

## 3. ChessBase gaps addressed this session

| ChessBase capability                                               | Before                                          | Now                                                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Same database/work on several machines (ChessBase Cloud databases) | blocked — no accounts                           | accounts and sync implemented; awaiting a project                                   |
| Search mask                                                        | form + boolean query + saved queries            | plus natural-language Describe; saved queries keep their opening                    |
| Large reference database (Mega)                                    | open packs from 2020; reads the user's own Mega | proposal with sources, cost and roadmap for hosted open populations with game links |

## 4. Security

- RLS on every account table, tested in real Postgres under Supabase's
  roles and JWT claims, each assertion checked against a deliberately
  broken policy (`src/sync/cloud/rls.test.ts`, 19 tests).
- The anonymous key reaches nothing; a service-role or `sb_secret_` key in
  a public variable is refused at start-up; the production bundle was
  searched and contains no secret and no development hook.
- Records from the cloud are validated by the backup restore's rules
  before they reach IndexedDB; preferences are applied key by key by type.
- Redirects after sign-in accept same-site paths only (`safeNext`).

## 5. What needs the owner

All in `docs/operations/supabase-setup.md`, step by step:

1. Create the Supabase project; apply the migration.
2. Configure email (custom SMTP for production), redirect URLs, Google
   OAuth (consent screen, client, redirect URI).
3. Put the URL and **publishable** key in Vercel; redeploy.
4. Run `npm run cloud:verify` with the secret key in your shell only.
5. Flip `src/release/public-services.json`, name the region on the privacy
   page, run `npm run docs:check`.
6. Decide on the database proposal's four questions (§12 there).

## 6. Not done, and why

- **Not verified against a hosted Supabase project** — none exists. The
  live check is one command once it does. Google OAuth, real email
  delivery and Realtime have not been exercised end to end.
- **Google sign-in in the Mac app.** Google refuses OAuth in embedded
  windows; the app offers email and password and says so. Needs the
  system-browser flow with a callback into the shell — a change to
  `desktop/`, which must then pass `desktop:certify`.
- **Packaged macOS gates were not run** for this work; the changes are in
  the shared web build, but `desktop:smoke -- --packaged` against a new
  bundle is required before a release that contains them.
- **Imported game collections do not sync** (deliberately, §2); a private
  per-user copy of a personal PGN collection is a possible later feature,
  with licence terms to write first.
- **Scoped sharing and revocation** (team sharing through accounts) are
  not built.
- **No wholesale Studio or landing redesign.** Candidates for a dedicated
  design phase, with visual baselines regenerated deliberately.
- Phase 89's open items stand: the reference-pack `*` tally defect, and a
  real million-game personal archive for the Opening Report.

## 7. Gates

Run on this machine (macOS, Node 24.14.0) during the session. The full
browser suite ran **before** the last two changes (lazy-loading supabase-js,
and excluding the sign-in pages from the route audit); those were followed
by the targeted re-runs listed, not by a second full run.

| Command                                                                | Result                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (final tree)                                                | **4,349 passed / 4,349**, 428 files, 0 skipped                                                                                                                                                                               |
| `npm run typecheck`                                                    | clean                                                                                                                                                                                                                        |
| `npm run lint`                                                         | 0 problems                                                                                                                                                                                                                   |
| `npm run format:check`                                                 | all files use Prettier style                                                                                                                                                                                                 |
| `npm run build`                                                        | succeeded                                                                                                                                                                                                                    |
| `npm run test:e2e` (full, before the last two changes)                 | **549 passed, 2 failed** of 551, 1.1 h. Both failures were `route-audit.spec.ts` (light and dark) waiting for the Studio's ready marker on the new standalone sign-in pages; fixed by excluding them as the public pages are |
| `route-audit.spec.ts` after the fix                                    | 2 passed                                                                                                                                                                                                                     |
| `account-sync`, `describe-search`, `header-controls` specs, final tree | 9 passed                                                                                                                                                                                                                     |
| `npm run benchmark`                                                    | every stage exit 0; heaviest route `/games` 597.6 kB gzipped after lazy-loading supabase-js (658.4 kB before it; every route ~61 kB lighter)                                                                                 |
| `npm run docs:check`                                                   | 367 / 367                                                                                                                                                                                                                    |
| `npm run test:no-skips`                                                | OK                                                                                                                                                                                                                           |
| `npm run security:scan`                                                | report unchanged from the committed one                                                                                                                                                                                      |
| `git diff --check`                                                     | clean                                                                                                                                                                                                                        |
| Production bundle searched for the dev-only test hook and for secrets  | none (the only `service_role` string is the refusal check)                                                                                                                                                                   |

**Not run:** `npm run cloud:verify` (no project), any packaged `desktop:*`
gate, Firefox/WebKit matrix (`KF_E2E_MATRIX`), and the visual baselines.

### Follow-ups recorded by this session

- Contrast audit for `/sign-in`, `/sign-up`, `/forgot-password` (excluded
  from `route-audit.spec.ts` because they sit outside the Studio shell).
- Google sign-in in the Mac app (system-browser flow; `desktop/` change).
- `desktop:smoke -- --packaged` and `desktop:certify` on a bundle that
  contains this work, before it ships in a release.
