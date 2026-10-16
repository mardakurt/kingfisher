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

- **The hosted project is set up and partly verified; the full live
  check is not run.** See §8. Not yet exercised end to end: Google OAuth
  (provider not enabled), Realtime, the branded emails (custom SMTP is
  configured, the domain was still pending in Resend), and
  `npm run cloud:verify`, which needs the secret key.
- **Google sign-in in the Mac app** — done after this report: the
  sign-in opens in the system browser and returns over a loopback
  listener (`desktop/src/browser-sign-in.mjs`; redirect URL in
  `docs/operations/supabase-setup.md` §4). Like the rest of accounts,
  it has not been run against a hosted Supabase project.
- **Packaged macOS gates** were run by the Google sign-in session, not by
  this one: `desktop:smoke -- --packaged` 23/23 and `desktop:certify`
  passing on build 1187 (dev, commit `365c10a6`), which contains all the
  account work (commit `ca76509c` records it). Not re-run here.
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

- ~~Contrast audit for `/sign-in`, `/sign-up`, `/forgot-password`~~ — done:
  `e2e/auth-pages-audit.spec.ts` applies the route audit's `measure` to all
  three, light and dark, with and without an account service, at 375, 1024
  and 1440 px; checked against a deliberate 1.68:1 mutation.
- ~~Google sign-in in the Mac app~~ — done (system browser + loopback; see §6).
- ~~Packaged gates on a bundle with this work~~ — done by the Google
  sign-in session on build 1187 (see §6); repeat on the release bundle.

## 8. The live Supabase project (2026-10-15, after this report)

The owner created project `mwrljfsnreplhmvzdhzl` (region **ap-northeast-2,
Seoul**). Done in the dashboard with the owner signed in, and checked:

| Step                                      | Evidence                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration applied from the committed file | editor content matched the file's SHA-256 (`ef2def52…`) before running; catalogue query afterwards: RLS on `profiles` and `user_records`, all six policies, both triggers, `user_records` in `supabase_realtime`, `anon` can neither select nor execute `push_user_records` / `delete_my_account` |
| Anonymous boundary over the real API      | with only the publishable key: select on both tables, insert, and both RPCs each refused `42501 permission denied` (HTTP 401)                                                                                                                                                                     |
| Email sign-in                             | confirmation on (already); minimum password length raised 6 → 8 to match the client                                                                                                                                                                                                               |
| URLs                                      | Site URL `https://kingfisherchess.app`; redirects: `/auth/callback` and `/auth/update-password` on kingfisherchess.app and `localhost:3210`, and `http://127.0.0.1:*/auth/desktop/*` for the Mac app's Google sign-in                                                                             |
| A real account and sync                   | the owner signed up and confirmed through the real email; a study created in the local app (no save action) appeared in `user_records` owned by that account at revision 1, and its deletion arrived as a revision-2 tombstone; the profile row was created by the sign-up trigger                |
| Custom SMTP                               | Resend, sender `accounts@kingfisherchess.app`, name Kingfisher, host `smtp.resend.com:465`, user `resend`; the key was entered by the owner. Domain DNS (DKIM, SPF, return-path) resolves on 1.1.1.1 and 8.8.8.8; Resend still showed **Pending** at last check. DMARC (optional) not added       |
| Branded templates                         | **Confirm sign up** saved and read back byte-identical (`12ba6115…`) with subject "Confirm your email for Kingfisher". Reset password, change email, magic link and reauthentication **not yet** pasted — the dashboard session ended                                                             |

`.env.local` (gitignored) holds the project URL and publishable key for
local development.

**Google sign-in (later the same day):** the owner accepted Google's API
Services User Data Policy; the consent screen ("Kingfisher", support and
developer email, home page, privacy and terms links, authorized domains
`kingfisherchess.app` and the project's Supabase host), the web client
"Kingfisher web" with the Supabase callback as its only redirect, and the
Supabase provider were configured — the client secret entered by the
owner. Checked: the project's settings report `google: true`, and
`/auth/v1/authorize?provider=google` redirects to Google with that client
id, the Supabase callback and only `email profile`. The owner signed in
with Google and landed signed in on the Account page; `auth.identities`
shows one user with `email` and `google` linked. The app was in Google's
**Testing** status, which admits only listed test users; it was published
to production (no review: no sensitive scopes).

The first Google round trip returned to the Site URL instead of the local
app: the redirect allow-list matched `/auth/callback` literally, and the
`?next=` query made it miss. `https://kingfisherchess.app/**` and
`http://localhost:3210/**` were added.

**Google's consent screen still names the Supabase host** until branding
is verified. Brand verification failed once — "home page not registered
to you" — so `kingfisherchess.app` was verified in Google Search Console
through a DNS TXT record added to Vercel (ownership verified). Google
asks for 24 hours before re-verification: Google Cloud → Branding → ⓘ →
"I have fixed the issues". A custom auth domain (e.g.
`auth.kingfisherchess.app`) would also replace the host, and needs
Supabase's paid plan.

**Still open:** branding re-verification (owner, after 24 h), Realtime
across two live devices, and `npm run cloud:verify` with the secret key.

## 9. Overnight, 2026-10-16

Unattended, after the owner approved pushing to `master`, Search Console
changes and a free hand with the Studio's layout. Every item below was
pushed and deployed; the commit is named so it can be checked.

### Shipped

| Change                                                                                                                                                                            | Commit     | Evidence                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The sidebar keeps the current section in view when the account row arrives (a real bug the full suite caught)                                                                     | `20b008ae` | `sidebar-overflow.spec.ts` 5/5                                                                                                                               |
| Sitemap dates per page from `git log`; `WebSite` structured data for Google's site name; the Twitter card no longer credits `@kingfisher`, an account Kingfisher does not own     | `492b519f` | production `sitemap.xml` and `/` read back after deploy                                                                                                      |
| No tab strip while one tab is open (New tab moves into the header with its own icon); Recent's header first and empty sections one line each; the engine's 1–5 labelled _Lines_   | `7d2a88b7` | 117 targeted browser tests, the three regressions they found fixed and re-run (18/18); visual baselines regenerated, then two consecutive clean runs (43/43) |
| **Opening map** in the Explorer: three plies of a local source as nested blocks, width = share, shade = White's score, click plays the line; remote sources refused with a reason | `708e6f1d` | `opening-map.test.ts` (8, two mutations caught), `e2e/opening-map.spec.ts` (2, two mutations caught: a remote source asked; only the first move played)      |
| Landing images re-shot from the current Studio with `scripts/landing-captures.mjs` (whose dock handle selector had broken)                                                        | `f8f9735c` | `landing-chrome`, `layout-integrity` 12/12                                                                                                                   |
| **Opening map in Preparation**, from the opponent's own games, shaded by their score; a click walks the report there and Back retraces it                                         | `09edcb8f` | `src/preparation/opening-map.test.ts` (3, mutation caught), browser test with a Back-stack mutation caught                                                   |
| Landing copy describes the map; "A moves history" typo fixed; `public-claims.md` row                                                                                              | `122d26ee` | `docs:check` 365/365                                                                                                                                         |
| An empty Review no longer offers an accent _Reveal_ (which revealed nothing) or _Mark for review_                                                                                 | `d5437477` | `empty-states.spec.ts`, mutation caught; `phase8.spec.ts` still passes                                                                                       |
| An empty Training says "Nothing to train yet." and where cards come from, instead of "The review queue is empty."                                                                 | `db23baba` | `empty-states.spec.ts`                                                                                                                                       |

A scan of all 22 Studio routes for controls with no accessible name, or a
one- or two-character name outside a labelled group, found only the engine's
line count (fixed above).

### Gates, run at the end of the night

| Command                                         | Result                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx playwright test` (full, Chrome, retries 0) | **563 passed, 2 failed** of 565, 57.9 min. Both explained and fixed after the run: `recurring-mistakes` had fixture games on fixed September dates that aged out of the 30-day window (now dated relative to today; 2/2); `playouts` resume ran out of its 120 s wait while still playing (no stall; 240 s, 3/3) |
| `npm test`                                      | 4,381 passed / 4,381, 432 files, 0 skipped                                                                                                                                                                                                                                                                       |
| typecheck, lint, format, `git diff --check`     | clean                                                                                                                                                                                                                                                                                                            |
| `npm run docs:check`, `test:no-skips`           | 365/365; OK                                                                                                                                                                                                                                                                                                      |
| `npm run build`                                 | succeeded                                                                                                                                                                                                                                                                                                        |
| `npm run benchmark`                             | every stage exit 0 (the chess.js "FAIL" line is the recorded verdict for keeping Kingfisher's own rules); heaviest route `/games` 598.4 kB gzipped (597.6 kB before tonight)                                                                                                                                     |

The full suite ran before the last two fixes; the two specs were re-run
after them, not the whole suite again.

### Production, checked after deploy

`/`, `/sign-in`, `/sign-up`, `/privacy`, `/sitemap.xml` return 200; the
sign-in pages carry `X-Robots-Tag: noindex`; the privacy page names Seoul;
the sign-in page shows _Continue with Google_ (it appears once the
project's settings are read); Vercel has both public Supabase variables
for Production. Sync on production with a real account was **not**
exercised overnight — it needs the owner's password; it was verified
live against the same project on 2026-10-15 (§8).

### Not done, and why

- **Search Console** — done by the owner the next morning: sitemap
  submitted (with its full URL, which a domain property requires) and
  indexing requested for `/` and `/install`.
- **`npm run cloud:verify`** — run by the owner the next morning:
  `14/14 checks passed against mwrljfsnreplhmvzdhzl.supabase.co`. Step 5 is
  complete.
- **Firefox and WebKit runs** — not run, by the owner's decision; CI and
  the local suite test Chrome only.
- **Google branding re-verification** — after the 24-hour wait, by the
  owner: Google Cloud → Branding → ⓘ → "I have fixed the issues".

## 10. 2026-10-16 to 17: the user pass, the browser matrix, and 1.5.3

The owner asked for the documentation to be made true, the app to be used as a
person would and its faults fixed, and 1.5.3 to be built, notarised and
published. Everything below is pushed. Each figure comes from a command that
was run.

### Documentation and the legal pages

The 548 documents removed on 2026-10-15 were removed without checking what
cited them. Every citation now resolves: removed reports link to commit
`16d2fcc2`, and `docs:check` reports 375/375. Privacy, Terms, Security and
Data & licences (the pages and their Markdown copies) now describe the
optional account: Supabase and Google among the network requests, the
operator's administrative access, Delete account, a "Your account" section,
and no more "no cross-device sync" (`5dc00453`).

### Faults found by using the app, each with a test that fails without its fix

| Fault                                                                                                       | Commit     |
| ----------------------------------------------------------------------------------------------------------- | ---------- |
| Opening a chapter scrolled the board off screen where the list sits under it                                | `b2b4e92c` |
| Review's header overflowed at 1024 px (title gone, Settings off the edge), and folded needlessly at 1280 px | `b2b4e92c` |
| The Notation header pushed "Move the notation" past the window; menus then scrolled the workspace sideways  | `b2b4e92c` |
| Menus were clamped to the window, not to the clipping column ("eory Book")                                  | `b2b4e92c` |
| Puzzles' prompt and controls were below the fold at 1024×768                                                | `b2b4e92c` |
| On a phone, "White to play" read "W", with 200 px of empty space under the board                            | `b2b4e92c` |
| Five panels set their text against the panel edge; "on the left" for lists under the board                  | `b2b4e92c` |
| A position analysed and left without stopping the engine was never written to the history                   | `212d3cfd` |

Every one was reverted once and its test failed, with one exception: the
phone's empty space under the board. That fix changes a CSS class, and the
development server does not regenerate CSS for a reverted class, so the revert
could not be observed there. The before (200 px) and after were measured in
the browser instead.

### The browser matrix (full suites, retries 0)

| Engine  | Full run            | After                                                                                                                      |
| ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Chrome  | **590/590** (1.0 h) | the touched specs re-run after the last fixes: 58/58                                                                       |
| Firefox | 589/590 (1.1 h)     | the failure (the hydration race below) passes twice with the fix; settings + phase7 30/31 before the back-off, then passed |
| WebKit  | 576/590 (1.2 h)     | see below                                                                                                                  |

All 14 WebKit failures were explained, and none was a fault Safari users meet:

- **The hydration race.** Next's router writes the current URL into history
  as a page hydrates. Firefox and WebKit let that same-document write cancel
  a navigation already in flight. A probe that logged every history write
  traced it. The test helpers now retry both browsers' wording of it, with
  back-off (`9d9065d6`).
- **Development-build slowness.** On the development server, with the engine
  running, WebKit's main thread was busy 350–540 ms of every half second.
  Navigations never committed, and the engine fell behind. The same probe
  against a **production** build: no lag, and navigation in 46 ms (Chrome:
  71 ms). Run against a production server, the analysis-history, evaluation
  bar, playouts and preparation failures all pass. Two tests cannot run
  there by design: one reads a development-only test hook, and the other
  needs an unconfigured account service.
- **Routes compiling mid-run.** The development server's hot reload
  refreshed pages as routes compiled. A server warmed first cleared 9 of the
  17 re-run failures.
- **A test bug.** `phase7` counted evidence rows by node id, but node ids are
  per game (`9d9065d6`).

The Firefox and WebKit visual baselines predated this session's redesign and
were regenerated (`6df79118`). The `chrome-linux` baselines date from
2026-10-04 and cannot be drawn on a Mac. The Linux browser-certification job,
which compares them, has been cancelled at its one-hour limit on every run
since 1.5.0.

### Gates

`npm test` 4,410/4,410 in 436 files, 0 skipped. Typecheck, lint, format,
`git diff --check` and `test:no-skips` are clean. `docs:check` 375/375. The
production build succeeds, and its CSS carries every class added today. The
benchmark exits 0.

### Kingfisher 1.5.3 for the Mac

- **The build.** `desktop:dist` built build 1228 from `9d9065d6` on the
  stable channel with a clean tree. The app was notarised in the build. The
  DMG was then notarised (submission `8461110f-d693-4eae-8e50-2d50095db377`)
  and stapled.
- **Signing and certification.** `desktop:sign:verify` PASS (29 code
  objects); `desktop:notary:verify` and `desktop:trust:verify` GREEN; the
  DMG verified. `desktop:certify` passed **11/11** against this bundle.
- **The update path.** `desktop:update:e2e` PASS on the wire, and
  `desktop:update:mutations` 18/18.
- **Publishing.** Tag `v1.5.3` was published as a full release. After
  publishing, `/releases/latest` resolves to v1.5.3, all four artifacts match
  `SHA256SUMS`, and the live feed offers 1.5.3 build 1228.
- **The public download.** `macos-download.json` names
  `Kingfisher-1.5.3-arm64.dmg` (SHA-256 `be7ec3a9…d68b`, 192,260,709 bytes).
  Once the landing had deployed, `desktop:public:verify -- --landing --full`
  passed 68/68 on the downloaded bytes, and `public:check` 22/22.
- **A quarantined download.** The public DMG with the browser's quarantine
  flag, and the app copied out of it, are both assessed "accepted,
  source=Notarized Developer ID".

Not done: clicking through macOS's first-open sheet on that quarantined copy,
which needs a person at the Mac. Neither was an update from the installed
1.5.2 to 1.5.3 run on this machine (`desktop:update:real`).

### Two commit messages that are wrong

Both are pushed and cannot be amended without a force push:

- `15dfdb42` ("cloud:verify and sitemap records") also contains the 548
  document deletions.
- `a87cd220` says the sync label falls back to a store's "internal name". It
  falls back to "other records".
