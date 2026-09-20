# Phase 73 handover — the whole-codebase audit after 1.2.3

The owner asked for a review of every file: bugs, dead code, stale
documentation, configuration drift, dependency health, and the application
used as a person would use it — with fixes rather than a list. Everything
below was run on the maintainer's Mac on 2026-09-20, from `4af035d` (the
1.2.3 record) to the commit this report ships in. Nothing is carried over
from a previous report. The audit's nine commits were pushed on the owner's
instruction and the deployment confirmed (`deploy:status`: up to date at
`3cc3933`); section 6 records what followed the same day.

## 1. What was inspected

- **Orientation** as CLAUDE.md prescribes: `git status` clean, `HEAD` =
  `origin/master` at `4af035d`, the Phase 72 handover read and its gates
  re-run rather than believed. All six mechanical gates were green at
  `4af035d` before anything was edited (3,091 unit tests, 258 files).
- **Age.** The whole repository was written between 2026-09-01 and
  2026-09-20; 1,530 of 1,676 tracked files predate the two-day window, so
  "files older than two days" meant the codebase. The domain (`src/chess`),
  the engine layer, every store, the persistence layer (migrations, the
  IndexedDB wrapper, the repositories, backup, autosave, cross-tab, session
  launch), the database providers and account sync, the reference installer,
  the companion's trust boundary and server head, the desktop shell's file
  list, every `package.json` script target, the CI workflows, `next.config`,
  `vercel.json`, `tsconfig`, the feedback route, and the documentation
  (ARCHITECTURE, README, SECURITY, privacy, docs index, after-a-fix,
  platform-parity, CHANGELOG) were read in full. The 700 feature files were
  swept for the patterns that find bugs (TODOs, type escapes, `console.log`,
  `dangerouslySetInnerHTML`, unguarded `JSON.parse`, hard-coded plurals,
  header/title truncation) and exercised in the browser rather than read
  line by line; the ones the walk-through implicated were then read.
- **The application, as a user, on the dev server**: Analysis (moves,
  engine to depth 22, best-move arrow, opening name), Import (three games,
  one from a `[FEN]` tag), Explorer (starter pack and My games), Studies
  (create, chapter, move, save, reload), Openings, Repertoire (create, line,
  Add), Training, Review, Endgame, Games, Databases, Players, every public
  route's status, Settings → Diagnostics, and every board route's header at
  1440 and 1280 px. Console errors were read after each step.
- **Dependencies**: `npm audit` 0 vulnerabilities with and without dev;
  `npm outdated` shows minor bumps and four majors (ESLint 10, Vitest 5,
  TypeScript 7, jsdom 29) — none applied, a release decision rather than an
  audit fix.

## 2. Defects found and fixed (each reproduced first; every new test fails against the previous code)

| #   | Where                                                        | What was wrong                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/chess/position.ts`                                      | `Position.fromFen` kept the caller's text, so a pasted FEN with a spurious en passant square (`… b KQkq e3`) and the same position reached by playing `1.e4` had two `positionKey`s. Reproduced end to end: a `[FEN]` game was absent from "My games" after 1.e4 until the fix, present after. |
| 2   | `src/chess/fen.ts`                                           | A rank describing nine squares (`44p`, `8K`, nine pieces) was accepted with the ninth dropped.                                                                                                                                                                                                 |
| 3   | `src/chess/pgn/serialize.ts`                                 | Shapes on the root node were read on import and never written on export.                                                                                                                                                                                                                       |
| 4   | `src/chess/structure.ts`                                     | "Material imbalance … Black ahead by 0" for bishop against knight.                                                                                                                                                                                                                             |
| 5   | `src/stores/engine-store.ts`                                 | An engine switched while another was still starting adopted the first engine's session under the second one's id and name (Lc0's slow start is the real case). Test: `expected 'Test engine' to be 'Fast engine'` against the old store.                                                       |
| 6   | `src/engine/uci-session.ts`                                  | `Hash` and `MultiPV` were sent whether or not the engine declared them; Lc0 declares no Hash.                                                                                                                                                                                                  |
| 7   | `src/persistence/repositories/game-repository.ts`            | `routesToPosition` included the arrival record's move, so "Also reached by 2 move orders" after 1.e4 listed `e4 e5` and `c5`. Seen live; the function had no test.                                                                                                                             |
| 8   | `src/persistence/backup.ts`                                  | No check that every schema store had a portability decision; four exclusions are now written down with reasons and asserted against `STORE_NAMES`.                                                                                                                                             |
| 9   | `src/persistence/indexeddb/database.ts`                      | After another tab's upgrade every call failed with the browser's "connection is closing"; now "Kingfisher was updated in another tab. Reload this tab to keep working." Reads were also throwing synchronously from an async-shaped API.                                                       |
| 10  | `src/app/api/feedback/route.ts`                              | A message whose first 80 characters held any character above U+00FF (emoji, ♞, ş) made `fetch` throw on the ntfy `title` header → 502 "sink rejected the delivery". RFC 2047 now. The route's tests were also posting to the real ntfy.sh and api.github.com on every `npm test`; stubbed.     |
| 11  | `src/database/providers/lichess.ts`                          | "Min Elo 2200" requested Lichess bands `2000,2200,2500`, i.e. games from 2000, under a 2200+ label.                                                                                                                                                                                            |
| 12  | Studies, Openings, Explorer, Repertoire, Databases, Settings | "1 moves", "1 games", "1 replies", "1 studies", "1 duplicates". `src/lib/plural.ts`, used at the sites where one is plausible.                                                                                                                                                                 |
| 13  | `RepertoireWorkspace`, `TrainingWorkspace`                   | Header title 46 px ("Rep…") at 1440 px and 2 px on Training at 1280 px with the sidebar open — the action area is `shrink-0`. Measured before and after.                                                                                                                                       |
| 14  | `CollectionDetail`                                           | Four fact columns at a viewport breakpoint inside a 250 px panel truncated "not tracked" and "This browser"; container query now.                                                                                                                                                              |
| 15  | `src/middleware.ts` → `src/proxy.ts`                         | Next 16 deprecation notice on every `next dev`. Renamed per the bundled docs; header comment rewritten (it still described two origins).                                                                                                                                                       |
| 16  | `next.config.ts`, `vercel.json`                              | CSP named `explorer.lichess.ovh`; the provider calls `explorer.lichess.org` (both answer; the `https:` fallback hid it).                                                                                                                                                                       |

## 3. Documentation and configuration corrected

- ARCHITECTURE.md: 1,570 tests/108 files → 3,112/260; seventy-two
  browser tests/nine specs → 308/44; "fifteen object stores" → twenty-nine
  at v17, listed by version; the CI section described format and
  Playwright on every push (they are not) and a weekly Lichess smoke
  (its schedule was removed).
- README.md: "reopening the application brings you back to the same
  chapter" contradicted Phase 72's launch rule; "every gate runs in GitHub
  Actions"; "13,738 players with games" vs the library's 11,746 people.
- SECURITY.md and `/security`: "any other host is refused at the CSP
  layer" was false (`connect-src https:`); now says why the fallback exists
  and what bounds the calls.
- `docs/legal/privacy.md` and `/privacy`: the Lichess token is not in
  IndexedDB (memory, and `localStorage` only with Remember), sign-in
  requests no scopes, and the host list is the one the code contacts.
- `robots.ts`, `pwa/host.ts`, the manifest route: comments naming a
  separate Studio host or the Edge-runtime middleware.
- `browser-cert.yml`: `0 4 * * 1` is every Monday, not "the first Monday of
  every month". `ci.yml`: `engine-fleet.yml` is `engines.yml`.
- CHANGELOG (Unreleased) and `docs/product/platform-parity.md` (the Mac
  1.2.3 is now behind `master`; section B is due before the next Mac
  release).

## 4. Verified correct, left alone

The chess.js boundary (one importer); the game tree's immutability and
structural sharing; the UCI session's stop/`bestmove` ownership and its
adversarial tests; the PGN lexer and parser's recovery; the IndexedDB
scan/count paths; chapter revisions and the cross-tab announcement; the
draft-before-chapter autosave; the session-launch rule; the backup
restore's transactionality; the account-sync cursors; the reference-pack
installer's manifest validation; the companion's loopback/token/key rules;
`/dev/icons` gated by `notFound()` in production; `/database` → `/databases`
redirect; `/studio` → 308; the landing; no console errors on any route
walked; no `TODO`, `@ts-ignore` or `as any` anywhere in `src/`, `companion/`
or `desktop/src/`.

## 5. Verification

Run at the final commit on this machine, 2026-09-20:

```
npm run typecheck            exit 0
npm run lint                 clean
npm run format:check         All matched files use Prettier code style
npm test                     260 files, 3112 passed, 0 skipped
npm run test:no-skips        OK
npm run docs:check           344/344 checks passed
npm run public:check         All 22 public link(s) responded successfully
npm run build                Compiled successfully; 33 static pages; Proxy emitted
git diff --check             clean
npm run test:e2e             306 passed, 2 failed (19.3 m) — both failures were
                             two assertions on the exact strings this audit
                             pluralised ("… games · … studies · … training
                             items", "20000 moves"); the assertions were
                             updated and the two spec files re-run: 13 passed
                             — 308/308 at retries 0, none flaky
npm run benchmark            heaviest route /review at 530.9 kB gzipped over 26 scripts
                             (Phase 72: 529.7 kB); 3,922.9 kB emitted across 107 files
```

Not run: the packaged macOS gates (`desktop:certify` and the rest of the
list in AGENTS.md). They need the signing identity and a real window server
and are section B of `after-a-fix.md`, which follows the next version bump;
the Mac 1.2.3 is recorded as behind `master` in platform-parity.

## 6. The five additions, the tooling, and 1.2.4 (2026-09-20, later the same day)

The owner asked for the five suggestions to be built and the three
remaining concerns closed. Each addition was driven in the browser after it
was written; the browser suite was run in full once more (306 passed, 2
failed — both the header fold's own doing, see below — then the affected
spec files green after the fix).

- **Route actions fold to fit** (`WorkspaceFrame` + `header-actions.ts`,
  pure and tested). Measured on Repertoire: 1440 px four short labels,
  1180 px "Add" + ⋯, 1024 px ⋯ alone, title intact, no overflow. The
  first version protected the whole title block including the subtitle
  (200 px), which at Playwright's 1280 × 720 cost "Review repertoire" and
  "Training sets" their place in the row and failed two specs; only the
  route's name is protected now. This retires the third remaining concern.
- **Copy PGN from this move** (`serializePgnFrom`), in the Export menu,
  the move context menu and the palette; round-trip tested.
- **Score by depth** in the engine footer (`depthSamples`); live on the
  initial position: fourteen depths, four e4/d4 changes marked.
- **"Known position?"** in Set up, from the palette's position search plus
  the chosen reference source's count; live: both audit games at ply 2.
- **Train these gaps** from the repertoire's coverage panel, with the
  Starter pack added as a source. Building it found three defects in the
  prompt generator (side to move hard-coded to White; the four-field key
  stored as the FEN; one card per gap then only the first kept) and one
  in the collector (`null` slots reaching the table mid-run — the soak's
  research chain crashed on `report.gaps` once the Starter was the default).
- **Tooling**: Vitest 5, jsdom 29, TypeScript 6.0.3, Next 16.3.5,
  React 19.3, Playwright 1.63, Prettier 3.9.8 — all gates green. Not
  applied: ESLint 10 (`eslint-config-next`'s `eslint-plugin-react` 7.37.5
  crashes on it and its a11y/import plugins declare ≤ 9) and TypeScript 7
  (no JavaScript API; `typescript-eslint` needs one, peer `< 6.1`). The
  reasons are in the tooling commit.

### Section B, in the runbook's order

```
B1–B4  1.2.3 → 1.2.4 (root, desktop, lockfiles); CHANGELOG closed;
       docs/release/1.2.4.md; commit 7bfdb67, pushed; tree clean
B6     preflight GREEN; Sparkle 2.10.0 vendored; bridge current
B7     build: Compiled successfully
B8     stable desktop:dist: 1.2.4 · build 698 · 7bfdb67; notarised; boot
       verified (renderer, web, companion, engine catalogue, Sparkle)
B9     release:mac:notarize: Accepted 58ea754f…; stapled, validated
B10    trust: GREEN
B11    verify-dmg --version 1.2.4 --commit 7bfdb67…: verified, 3244 entries
B12    desktop:smoke --packaged: 17/17
       appcast: build 698, notes embedded, latest-mac.yml
B14    release:mac:publish v1.2.4: 6 assets
B15    Latest; publishedAt 2026-09-20T11:20:44Z
B13    desktop:update:real --current <1.2.3, ZIP hash-checked> --public-feed:
       PASS, 19 checks, first try
B16    descriptor: 1.2.4 · 698 · 7bfdb67 · Kingfisher-1.2.4-arm64.dmg ·
       sha256 a6633778… · 172,497,329 bytes (GitHub reports the same)
B17    publish:release-manifest: prepared for 1.2.4
B18    README, SECURITY, install-macos (file + hash), launch-kit,
       public-claims, SecurityPage.tsx, AGENTS.md, platform-parity
B19    docs:check 344/344
```

**A finding on the machine, not in the repository.** During the second
browser run `~/Library/Caches/Kingfisher/` was recreated empty (mtime
13:52:42, the run's end); the previous release applications kept there for
the update harness, and the pack, engine and archive caches, are gone.
Nothing in the repository removes that directory, and the cause was not
found. The 1.2.3 application was recovered from its ZIP in the dist
directory (hash checked against the published `SHA256SUMS`) and the
harness's previous builds now live under `$TMPDIR/kingfisher-previous/`.

## 8. Three owner reports, the features document, and 1.2.5 (2026-09-20, evening)

After 1.2.4 the owner reported, with screenshots: Windows-only engines
drawn as switched-on rows in the Mac Settings → Engines; the wish for
lichess-style analysis configuration; and the tooltip the best-move arrow
drew on the board. Commits `18140bc` (rows + six analysis settings:
threads, hash, search limit, line length, follow the board, variation
arrows — each in the contract, the search index and `e2e/settings.spec.ts`)
and `a49b340` (tooltip removed; the engines spec asserts hovering the shaft
draws nothing). `docs/product/features.md` is the complete feature
inventory (`e675e6e`), written from `navigation.ts`, `modules.ts`,
`useCommands.ts`, `shortcuts.ts`, `settings-index.ts`, `registry.ts`,
`packs.mjs`, `themes.ts` and the piece sets, counts checked against README
and ARCHITECTURE.

`docs/operations/after-a-fix.md`, every step, as run:

```
A1   typecheck                          exit 0
A2   lint                               exit 0
A3   format:check                       All matched files use Prettier code style
A4   npm test                           261 files, 3134 passed, 0 skipped
     test:no-skips                      OK
A5   docs:check                         344/344
A6   git diff --check                   clean
A7   test:e2e                           311 passed (18.8m), 0 failed, 0 flaky
A9   d24d778 pushed                     (parity record)
A10  deploy:status                      up to date (d24d778)
A11  kingfisherchess.app/analysis       Settings → Engine shows Threads, Hash,
                                        Search limit, Line length, Follow the
                                        board, Variation arrows (browser pane)
A12  CHANGELOG                          three entries, moved under 1.2.5 in B2
B1   1.2.5 in both package.json         lockfiles followed
B4   738d22d = origin/master            clean tree
B6   preflight (mac)                    GREEN
B7   npm run build                      exit 0
B8   desktop:dist (stable)              1.2.5 · build 704 · 738d22d · stable,
                                        notarization successful
B9   release:mac:notarize               Accepted 2b9a3c8b…, ticket stapled
B10  desktop:trust:verify               GREEN
B11  verify-dmg --version 1.2.5         DMG verified, 3244 entries
B12  desktop:smoke --packaged           17/17
B14  release:mac:publish v1.2.5         6 assets; /releases/latest → v1.2.5
B15  gh release edit --latest           notes = docs/release/1.2.5.md
B13  desktop:update:real --current <1.2.4 app, preserved before B8>
     --public-feed                      first run 98 s after publication:
                                        1.2.4 told "on the latest version"
                                        (GitHub's /releases/latest redirect
                                        not yet moved); second run 12 min
                                        later: PASS, 19 checks
B16  descriptor                         1.2.5 · 704 · 738d22d ·
                                        Kingfisher-1.2.5-arm64.dmg ·
                                        sha256 8e121767… · 172,496,902 bytes
B17  publish:release-manifest           prepared for 1.2.5
B18  README, SECURITY, install-macos, launch-kit, public-claims,
     SecurityPage.tsx, AGENTS.md, platform-parity
B19  docs:check                         344/344; public:check 22/22 links
B20  31f7a04 pushed                     deploy:status up to date (31f7a04)
B21  desktop:public:verify --landing --full   66/66 (a run started before
                                        the deployment was live: 62/66)
```

**A defect found in the release script.** `scripts/desktop-mac-publish.mjs`
wrote `kingfisher-release-manifest.json` only when the out dir had none,
and the out dir is shared between releases: the manifest uploaded with
v1.2.2, v1.2.3, v1.2.4 and v1.2.5 is the one generated for 1.2.1. Nothing
reads it — Sparkle reads `appcast.xml`, `desktop:public:verify` reads the
descriptor — so no update and no verification was affected. The script
now derives it from the files being published every time (`31f7a04`). The
four published assets were left as they are under the rule against
replacing the bytes of a published asset; whether to correct a wrong
metadata file on those releases is the owner's call.

## 7. Remaining concerns

- **`kingfisher-release-manifest.json` on v1.2.2–v1.2.5** names 1.2.1
  (section 8); the script is fixed, the assets are not.
- **ESLint 10 and TypeScript 7** wait on `eslint-config-next`'s plugins
  and on `typescript-eslint` respectively; check their peer ranges before
  the next attempt.
- **`~/Library/Caches/Kingfisher/`** was emptied by something outside this
  repository during a browser run (section 6). Do not keep the only copy of
  anything there.
- **`connect-src https:`** is honest now in the documents; narrowing it
  would need the full-engine host (unpkg) and the assistant's user-typed
  host handled some other way.
