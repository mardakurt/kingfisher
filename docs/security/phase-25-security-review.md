# Phase 25 public-preview security review

This is the current public-release review. Phase 24's report remains historical.

## Result

No open Critical or High security finding was found in the reviewed source,
history, production dependencies, public data mirror, deployed response
headers, Electron boundary, or release links.

`npm run security:scan` checks the current tracked tree and full git history
with gitleaks, scans the data mirror, runs the production-only npm audit, and
checks tracked files for personal filesystem paths. Known synthetic credential
fixtures are ignored only by exact historical fingerprints; their current
source lines carry local allow comments. The generated report replaces the
checkout path with `<repository-root>`.

The 2026-09-09 run returned zero findings and zero production dependency
vulnerabilities. No real credential was found.

## Public controls

- GitHub secret scanning, push protection, and Dependabot security updates are
  enabled on both public repositories.
- Vercel SSO deployment protection is disabled because this is the public web
  application. Git-fork protection remains enabled.
- The live application sends CSP, COOP, COEP, HSTS, Referrer-Policy,
  Permissions-Policy, and X-Content-Type-Options headers.
- The landing page keeps `default-src 'none'`, uses no remote script or font,
  and links only to the intended application and GitHub surfaces.
- Electron uses context isolation with Node integration disabled and sandboxing
  enabled. External navigation remains constrained to HTTPS, and the native
  bridge exposes narrow, purpose-specific operations.
- Companion authentication material stays in the local desktop bridge and is
  redacted from diagnostics. No service credential is shipped in the browser.

## Accepted preview limitation

The Apple Silicon DMG is signed with an Apple Development identity but is not
notarized. Gatekeeper therefore rejects the normal trust assessment. This is a
distribution limitation, clearly disclosed in the install guide; it is not
represented as a stable notarized release.
