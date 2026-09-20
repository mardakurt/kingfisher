# Phase 73 handover — the whole-codebase audit after 1.2.3

The owner asked for a review of every file: bugs, dead code, stale
documentation, configuration drift, dependency health, and the application
used as a person would use it — with fixes rather than a list. Everything
below was run on the maintainer's Mac on 2026-09-20, from `4af035d` (the
1.2.3 record) to the commit this report ships in. Nothing is carried over
from a previous report, and nothing was pushed: `master` on the machine is
eight commits ahead of `origin/master` and the push, the Vercel deployment
and the section-B Mac release are the owner's calls.

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

## 6. Remaining concerns

- **Push and deploy.** The eight commits are local. `deploy:status` and the
  live-site check in after-a-fix.md steps 9–11 cannot be done until the
  owner pushes.
- **Section B** for the next Mac release: fixes 1, 5, 7, 12 and 13 are
  Mac-facing.
- **Dependencies**: four major versions behind on dev tooling (ESLint 10,
  Vitest 5, TypeScript 7, jsdom 29). Each is a deliberate migration, not a
  patch.
- **The workspace header's layout rule** (actions never shrink, the title
  always does) is still the same rule; the two routes that broke it were
  fixed individually. A route that adds a fourth action will meet it again.
- **`connect-src https:`** is honest now in the documents; narrowing it
  would need the full-engine host (unpkg) and the assistant's user-typed
  host handled some other way.
