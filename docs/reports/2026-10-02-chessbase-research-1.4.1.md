# ChessBase research and first-increment validation

Historical first-increment evidence. The subsequent full-roadmap implementation
changes the SQLite schema and analysis checkpoints; see
[the follow-up validation](2026-10-02-chessbase-roadmap-validation.md).
Counts below describe that earlier state, not the final follow-up.

2026-10-02. Baseline: `49ce4bd`, clean `master`. Before this change, local
master was already nine commits ahead of `origin/master` (`2857625`). Those
commits were preserved. Node v24.14.0, Apple Silicon macOS.

## Delivered

The [comparison and roadmap](../product/chessbase-roadmap-2026-10-02.md)
is based on live publisher research and inspection of the current code.
ChessBase itself was not run. The opening-survey module and dialog are new;
Opening Report now offers the survey and source-preserving Markdown export.
Root and desktop package versions and both lockfiles are 1.4.1. No reference
corpus, persistence schema or engine capability was changed.

## Commands and results

| Command                                                                                                | Result                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/theory/opening-survey.test.ts src/features/openings/opening-report-export.test.ts` | 2 files, 9 tests passed, including final survey wording and reversed provider-order fixture                                                                                                                                                                                                          |
| Deliberately disable source/position identity guard and run the rejection regression                   | Fails as expected; guard restored in `finally`, then tests passed                                                                                                                                                                                                                                    |
| `npm test`                                                                                             | 367 files, 3,948 tests passed; no skipped tests reported                                                                                                                                                                                                                                             |
| `npm run typecheck` and final targeted `tsc --noEmit`                                                  | Passed                                                                                                                                                                                                                                                                                               |
| `npm run lint` and final targeted ESLint                                                               | Passed                                                                                                                                                                                                                                                                                               |
| `npm run format:check`                                                                                 | Passed; later edited files also passed targeted Prettier                                                                                                                                                                                                                                             |
| `npm run docs:check`                                                                                   | 359/359 passed before adding this record; final count below                                                                                                                                                                                                                                          |
| `npm run build`                                                                                        | Passed; final wording build result below                                                                                                                                                                                                                                                             |
| `npm run test:e2e -- e2e/opening-report.spec.ts`                                                       | 12/12 passed, Chrome, zero retries. First run was 11 passed/1 failed due to comparing innerText with textContent; assertion corrected with `useInnerText`                                                                                                                                            |
| `npm run test:e2e`                                                                                     | 451 passed in 28.6 minutes, Chrome, zero retries                                                                                                                                                                                                                                                     |
| `npm run benchmark`                                                                                    | Passed. PGN: 100,000 games in 36,049.6 ms (2,774 games/s); aggregate, rules, preparation, collection, evidence, performance and bundle reports completed. Token-dependent SQLite benchmark explicitly skipped because `KINGFISHER_COMPANION_TOKEN` was absent; not a full SQLite scale certification |
| `npm run test:no-skips`                                                                                | No prohibited skip constructs                                                                                                                                                                                                                                                                        |
| `git diff --check`                                                                                     | Passed                                                                                                                                                                                                                                                                                               |
| `npm run public:check` (twice)                                                                         | 21/22 links passed; GitHub install-guide URL returned HTTP 503 both times. Check failed; URL was not changed to hide the failure                                                                                                                                                                     |
| `npm run deploy:status`                                                                                | Vercel API HTTP 403. Script exits zero despite the API error; this is not deployment verification. It printed the remote tracking revision `2857625` as "Local master HEAD"; actual local baseline is `49ce4bd`                                                                                      |
| `gh release view --json tagName`                                                                       | `v1.4.0`                                                                                                                                                                                                                                                                                             |
| `npm run desktop:release:preflight:mac` after sourcing the existing release environment                | Signing identity and notarization credentials present. Failed because source changes are uncommitted and local/remote master differ. No packaged 1.4.1 build or trusted-release certification claimed                                                                                                |

## Direct browser observation

Regular Playwright was used; no Browser skill/plugin is listed in this session.
At `http://localhost:3210/analysis`, the real installed Starter Reference
produced a four-ply, three-branch survey with 120 move nodes, 38 queries and
38 bounded move lists. The dialog rendered with source/depth/width controls,
PGN text and a copy action. Native option state (`disabled=true`) and the
source-defaults notice were checked after the final review correction. Screenshot: ignored local evidence
`.playwright-mcp/kingfisher-141-survey.png`. Browser errors were failed probes
of the unpaired companion at `127.0.0.1:4321/status`, not survey generation or
framework failures. The browser tests also generated a survey from 1.e4,
asserted variations and source counts, and confirmed the board remained there.
A real clipboard round trip verified report provenance and snapshot fields.

Online/authenticated survey sources, real large collections, Firefox/WebKit,
packaged Mac execution and ChessBase PGN import were not exercised for this
new feature. The report makes no latency or universal-parity claim.

## Five release answers

1. **Same application source?** Yes, shared renderer architecture. Public Mac
   1.4.0 build 1007 does not contain this change or the earlier unpublished
   collection corrections. `platform-parity.md` records the difference.
2. **Documentation current?** The affected README, architecture, changelog,
   source-version security rows, public-claims ledger, release notes and
   comparison were updated. Passing docs checks cover their asserted
   invariants, not a proof that every historical document is current.
3. **Production deployment latest?** Unverified: Vercel API 403. No deployment
   claim is made for source 1.4.1.
4. **Landing/install artifact identity?** Descriptor remains 1.4.0 build 1007;
   local docs checks pass. Public bytes were not re-certified in this work.
5. **Latest GitHub DMG?** Latest tag is `v1.4.0`; no new DMG was published or
   substituted. This is source 1.4.1 preparation, not a completed Mac release.

## Final gate results

- Final source `npm test`: 367 files / 3,948 tests passed in 62.99 s, no skips.
- Full browser run: 451 passed in 28.6 minutes. This completed before the last
  player-option/filter-disclosure review corrections.
- After the final production build and fresh dev-server startup,
  `npm run test:e2e -- e2e/opening-report.spec.ts -g 'opening survey uses|copy report exports'`:
  2 passed in 14.4 s. These assert the disabled player option, PGN source/counts,
  unchanged original notation and position, and real report clipboard content.
- Final `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run build`, `npm run docs:check` (359/359) and `git diff --check`: passed.
- Public link check still failed on GitHub HTTP 503; deployment identity remains
  unverified after Vercel HTTP 403. No commit/push, release tag, deployment or
  1.4.1 Mac package publication was performed. Changes remain local and
  uncommitted for review; the nine earlier unpushed commits were preserved.
- Root/desktop package files and both lockfiles independently report 1.4.1.
  The immutable public descriptor still names 1.4.0 build 1007.
