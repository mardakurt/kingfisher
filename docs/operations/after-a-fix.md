# After a fix — the checklist

Do every step. Report the command and its output, not a claim.

## A. Any fix (web, docs, hosting)

1. `npm run typecheck`
2. `npm run lint`
3. `npm run format:check`
4. `npm test` — must report 0 skipped
5. `npm run docs:check` — must report all checks passed
6. `git diff --check`
7. If a browser-rendered file changed: `npm run test:e2e` — 0 failed, 0 flaky
8. If a public page, claim or URL changed: `npm run public:check`
9. Commit with a message that says why; push to `master`
10. Wait ~1 min, then `VERCEL_TOKEN=<token> npm run deploy:status` — must print `up to date (<sha of HEAD>)`, or `up to date (<older sha>; … skipped)` when every commit since changed nothing the web build reads (docs, `e2e/`, `desktop/`, `companion/` — the rule is `scripts/vercel-build-scope.mjs`, and Vercel's `ignoreCommand` applies the same rule)
11. Open the changed page on `https://kingfisherchess.app` in a real browser and look at it
12. If the fix is user-visible: add a line under `## Unreleased (web)` in `CHANGELOG.md`
13. If a claim changed: update `docs/product/public-claims.md` and the page that makes the claim in the same commit
14. Close by answering these five, each with the command or page that proves it:
    - Are the web and the Mac application the same source? If the fix changed application code, the public Mac build is now behind `master`: say so, add the difference to the "Published revision check" in `docs/product/platform-parity.md`, and say whether it is Mac-facing (if it is, do section B)
    - Are all documents accurate and current? (`docs:check` passed, and any document that describes the changed behaviour was updated)
    - Is the Vercel production deployment the latest commit? (`deploy:status` shows HEAD)
    - Are the version, build number, filename and hash on the landing and install pages the ones in `src/release/macos-download.json`? (`docs:check` asserts it; look at the live page)
    - Is the DMG on GitHub the latest Mac build and the one the descriptor names? (`gh release view --json tagName` is the descriptor's tag; after a Mac release, `desktop:public:verify -- --landing --full` passed)

## B. A fix that changes what the Mac application does

Do section A first. Then:

1. Bump `version` in `package.json` and `desktop/package.json` (same value); run `npm install` in both so the lockfiles follow
2. Move the `## Unreleased` entries in `CHANGELOG.md` under `## <version> — <date>`
3. Write `docs/release/<version>.md`; update `docs/README.md` to link it
4. Commit, push; confirm `git status` is clean and `HEAD` = `origin/master`
5. `source ~/.kingfisher-release/env.sh`
6. `npm run desktop:release:preflight:mac` — must be GREEN
7. `npm run build`
8. `KINGFISHER_DESKTOP_CHANNEL=stable npm run desktop:dist` — note the build number and commit it prints
9. `npm run release:mac:notarize`
10. `npm run desktop:trust:verify` — must be GREEN
11. `node desktop/scripts/verify-dmg.mjs <dmg> --version <version> --commit $(git rev-parse HEAD)`
12. `npm run desktop:smoke -- --packaged` — 17/17
13. `npm run desktop:update:real -- --current <previous Kingfisher.app> --next-dir <output dir> --public-feed` after publishing (step 15) — must PASS
14. `npm run release:mac:publish v<version> "Kingfisher <version>"`
15. `gh release edit v<version> --notes-file docs/release/<version>.md --latest`
16. Write `src/release/macos-download.json`: version, build, commit, filename, url, sha256 (from `SHA256SUMS`), bytes, publishedAt (from `gh release view`)
17. `npm run publish:release-manifest`
18. Update the version and DMG name wherever `docs:check` fails: `README.md`, `SECURITY.md`, `docs/release/install-macos.md` (filename and SHA-256), `docs/release/launch-kit.md`, `docs/product/public-claims.md`, `src/app/security/SecurityPage.tsx`, `AGENTS.md`
19. `npm run docs:check` — all checks passed
20. Commit, push; `deploy:status` up to date
21. `npm run desktop:public:verify -- --landing --full` — all checks passed
22. Record the commands and results in the phase handover under `docs/reports/`

## Never

- Do not replace the bytes of a published release asset
- Do not bump the version for a docs-only change
- Do not change `publicUrl` defaults, the CSP, or `macos-download.json` outside section B
- Do not write "verified" for anything not run
