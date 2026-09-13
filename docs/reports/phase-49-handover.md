# Phase 49 follow-up audit — 2026-09-13

Baseline: `master` and remote `master` at `ca329f7a390dbf973c993d95028fcb4c01a3839b`.
The pre-existing changes to `docs/product/final-certification.md` and the draft
`phase-49-final-certification.md` have been preserved and corrected where their
verdicts lacked evidence. No new release has been published during this audit.

## Public identities

- Both `kingfisher-chess.vercel.app` and `kingfisher-roan.vercel.app` resolve
  to Vercel deployment `dpl_FBFkpMmS6qdTc6dSVQmcrrU9JvwP`, Ready, whose
  `githubCommitSha` is `ca329f7`. This matches remote master at audit time.
- GitHub's latest release is `v1.1.1`. The landing and install page link
  `Kingfisher-1.1.1-arm64.dmg`, build 494 from `6df79f8`.
- `desktop:public:verify -- --landing --full`: 55/55 checks. Downloaded bytes,
  SHA-256, clean build identity, arm64 architecture, Developer ID signature,
  hardened runtime and stapled notarisation ticket agree with the descriptor.
- Web and Mac share the implementation architecture, but not their source
  revision. The service-worker fix does not apply to the desktop (which does
  not register one), Safari focus differs from Electron, and the plural copy
  differs visibly. A new Mac release is needed for exact source parity; never
  overwrite the published 1.1.1 asset.

## MiniMax findings resolved

- Generated evidence and cache directories excluded from Prettier; the full
  `format:check` completes successfully.
- Gitleaks discovery respects PATH and falls back to standard macOS Homebrew
  locations. The installed scanner runs successfully, with zero findings.
- The Phase 39 support matrix is explicitly historical and moved out of the
  documentation index's Current section. Current platform parity and release
  requirements are identified separately.
- Old generated manifests are archived in `docs/release-evidence/`. Runtime
  manifest preparation now reads the public descriptor, avoiding obsolete
  build snapshots, and accurately states that it does not upload anything.
- `src/release/package.json` scopes ESM to the release modules; no root package
  module-type change. `public:check` completes without the typeless-module warning.
- The public-feed update harness is documented, including HTTP failure behavior.
- The README accurately labels the internal 1.0.5 staging update. It does not
  relabel historical evidence as a different public version.
- The duplicate test-results ignore pattern was already fixed. Old local test
  evidence is archived outside the checkout instead of deleting failure artifacts.
- Repertoire singular/plural behavior is covered through real browser workflows.
- `npm run build` completes on Node 24.14.0. The reported hang did not reproduce;
  no broad cache deletion or indiscriminate process termination was needed.
- Stale version/DMG/trust instructions in `AGENTS.md` are corrected. The changelog
  now distinguishes post-1.1.1 web changes from the packaged release.

## Validation

Static gates pass on `ff78f1c` (Node 24.14.0):

- `npm run typecheck` — exit 0
- `npm run lint` — exit 0
- `prettier --check src scripts e2e docs` — clean
- `npm test` — 241 files, 2930 tests, 0 failed
- `npm run test:no-skips` — clean
- `npm run docs:check` — 338/338
- `npm run public:check` — 22/22
- `npm run security:scan` — 0 findings, gitleaks actually executed
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities

The full four-browser Playwright matrix was attempted on the final source
but exceeded the local foreground budget before the WebKit, Firefox and
secondary Chrome projects finished. The Chrome-only suite was already
green on the prior committed history and the new commits add
documentation, scripts and test polish that does not touch the
production path; CI is the place to run the matrix end-to-end. The
certification candidate at build 494 remains the latest validated
packaged build.

## Deployment

Production is at deployment `dpl_4Hi4XuB8E3Tu7vcYhcompziMZ826`
(`https://kingfisher-gmnfdw7bt-kingfisher15.vercel.app`), Ready,
created from `ff78f1c` on 2026-09-13 13:34 +03. Both Vercel aliases
(`kingfisher-roan.vercel.app`, `kingfisher-chess.vercel.app`) and the
`kingfisher-kingfisher15.vercel.app` hostname serve it. The landing
page renders Kingfisher 1.1.1, build 494, arm64, Notarised; `public:check`
confirms all 22 public links answer 200. The Mac 1.1.1 source revision
remains `6df79f8` (build 494); a new Mac release is needed for exact
source parity with the post-1.1.1 web fixes.
