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

Validation is still running. Final results will replace this paragraph before
handoff. Full logs are in the local temporary `kingfisher-pre-release-audit`
directory; they are not shipped as product assets.
