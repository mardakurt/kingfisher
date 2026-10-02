# Independent audit of Phase 89 — 2026-10-02

Started from clean `master` at `6c8bb428c7cac71ae6c3964f7f7274605130253e`,
eight commits ahead of origin. The previous handover is evidence to investigate,
not certification of this revision.

## Corrections

- An unavailable saved report collection was rendered as “Reference packs only”
  and could fall back to another registered collection for plan evidence. The
  saved selection now stays visible with an unavailable status; its plans are
  not substituted. Browser coverage includes a second collection still present.
- A collection containing games but no dates said it had no games in the
  earliest-games section. It now states that no dated game is available.
  Capped year percentages explicitly name sampled dated games as their denominator.
  The new regression failed on the previous implementation and passed after the fix.
- The collection-report benchmark cleaned its temporary database only on
  success. Cleanup now runs in `finally`, including preparation/query failures.
  A zero-game run deliberately failed at the empty-corpus probe and left no
  temporary directory. A 2,000-game postings run succeeded and removed its file.
- The handover's “no data generated” claim was corrected: benchmarks generated
  disposable synthetic collections. The settings contract now correctly says
  collection history is shown alongside reference packs.

## Files recovered from Trash by the maintainer

Inspected in Downloads using filesystem tools. Nothing was deleted or relocated
by this audit. These files are not required for the source application to run:

| Item                      | Allocated size | What it contains                                                            | Assessment                                                                                      |
| ------------------------- | -------------: | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `test-results`            |        981 MiB | Playwright traces, screenshots and videos                                   | Generated diagnostic evidence; preserve if investigating the interrupted run                    |
| `kingfisher-desktop-dist` |        390 MiB | Signed dev app 1.4.0 build 1012, commit `6e9f0c6`, builder output and icons | Older reproducible build; useful for historical comparison, not current release or user profile |
| `tmp-probe.test.mjs`      |          4 KiB | Diagnostic PGN reconciliation test deliberately throwing its observations   | Superseded by committed reconciliation tests; not a runtime module                              |

The app's 18 required resource checks and `codesign --verify --deep --strict`
passed. This is static bundle evidence, not a launch test. Its only `.pgn` file
is the shipped Capablanca fixture, SHA-256 identical to the tracked source.
No `.sqlite` or `.db` files were found in the recovered bundle.

Moving these files to Downloads has not reclaimed disk space. Their combined
allocated size is approximately 1.34 GiB. The audit leaves them available to the
maintainer; it does not authorize or perform permanent deletion.

## Verification

| Command                         | Result                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `npm test`                      | 3,939 passed / 365 files, 0 skipped on final source (52.34 s)                        |
| `npm run typecheck`             | exit 0                                                                               |
| `npm run lint`                  | exit 0                                                                               |
| `npm run format:check`          | all matched files formatted                                                          |
| `npm run docs:check`            | 359/359                                                                              |
| `npm run test:no-skips`         | no prohibited skip constructs                                                        |
| `npm run build`                 | exit 0 on final source                                                               |
| `npm run benchmark`             | exit 0; optional companion-HTTP SQLite stage skipped because no token was configured |
| `npm run test:e2e`              | **442 passed, 7 failed, 28.8 minutes**; full gate remains failed                     |
| Isolated diagnostic browser run | **18 passed, 1.9 minutes**, retries 0                                                |
| `git diff --check`              | clean                                                                                |

The full browser failures were closed pages/contexts (six) and an aborted reload
(one), spread across seven unrelated cases. One browser log also records macOS
`CVDisplayLinkCreateWithCGDisplay` errors. These logs do not establish why the
browser closed. Each failed case was rerun once in isolation together with the
10 Opening Report cases; the parameterized page audit selected both themes,
giving 18 cases. All passed. That narrower run does not turn the original full
gate green, and no application change was made merely to suppress these errors.

The unavailable-selection regression also failed against the previous component
and passed against the correction. The undated-games test failed before the fix;
the sampled-denominator mutation failed as expected (exit 1).

Logs are under `/tmp/kingfisher-audit-*.log`; they are local diagnostic output,
not release assets.

## Remaining limits

No reference corpus was downloaded or rebuilt. The existing reference-pack
unfinished-result problem remains open. The collection history read still uses
at most 2,000 distinct game headers and does not build an additional index.
`companion/data` remains 118 MiB and `tmp` 23 MiB.

The public Mac remains build 1007. The recovered app is build 1012, not the
handover's later build 1013 and not the source revision audited here. No Mac
window was driven after the maintainer asked to stop computer control. No new
Mac release, native acceptance, notarization or release publication is claimed.

## Delivery status

The corrections are local source changes. The full browser gate is not green,
so no push, production deployment or new Mac release was attempted. The local
fixes are reviewable; deployment and packaged acceptance remain open. The
published descriptor remains unchanged at 1.4.0 build 1007.
