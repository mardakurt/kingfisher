# Phase 25 handover — landing UX repair, deployment wiring, and public preview

> The transition from "Phase 24 is done" to "the public
> surface looks like a real product, the maintainer can
> deploy the web app in one click, and the link validator
> goes 19/19."

## 1. Executive verdict

**Kingfisher's public surface is in the state the brief
asked for, with the single operator action remaining being
the Vercel one-click import.**

- The landing page is redesigned. The hero is one large
  product moment instead of four small panels, the four
  sources are presented as a list beside a single large
  research screenshot rather than four small cards, the
  engine catalogue is presented as two plain paragraphs
  beside a single large engines screenshot rather than
  nine small cards, and the local-first story is a single
  centred statement rather than three small cards.
- The web app URL the landing page links to is
  `https://kingfisher.vercel.app`, the canonical default
  in `src/release/public-urls.ts`, the one-click Vercel
  import URL is in `docs/deployment.md`, and the CLI
  alternative (`npm run deploy:vercel`) is wired up.
- Dependabot is configured with a weekly cadence and a
  three-PR cap, so it does not flood Actions minutes.
- The remote CI is unchanged from Phase 23; Phase 25 did
  not add expensive workflows.
- The security baseline from Phase 24 is preserved
  (gitleaks 4 INFORMATIONAL test-fixture findings,
  `npm audit` 0/0, Electron contextIsolation correct,
  CSP/COOP/COEP/HSTS/Referrer-Policy/Permissions-Policy
  shipped, OAuth tokens redacted).
- The format gate is still green.
- The unit/integration suite still passes (2177 tests).
- The desktop smoke still passes (17/17).
- The data-safety regression (work survives a desktop
  quit) still passes (5/5).
- 0 Critical, 0 High, 0 Critical UI, 0 High UI defects.

**One remaining operator action:** the maintainer
performs the one-click Vercel import. After that, the
public link validator goes from 14/19 to 19/19 and the
release verdict moves from
**WEB PUBLIC / MAC PREVIEW DEPLOY-PENDING** to
**PUBLIC PREVIEW LIVE**.

## 2. Public URL map

| Surface             | URL                                                                              | Status                       |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| Landing page        | <https://mardakurt.github.io/kingfisher-data/>                                   | LIVE (redesigned)            |
| Web app             | <https://kingfisher.vercel.app>                                                  | DEPLOY PENDING (one-click)   |
| GitHub repository   | <https://github.com/mardakurt/kingfisher>                                        | LIVE (public)                |
| Latest release      | <https://github.com/mardakurt/kingfisher/releases/latest>                        | LIVE                         |
| macOS preview DMG   | <https://github.com/mardakurt/kingfisher/releases/download/v1.0.0-rc.4/Kingfisher-1.0.0-rc.4-arm64.dmg> | LIVE (150 MB) |
| Issue tracker       | <https://github.com/mardakurt/kingfisher/issues>                                 | LIVE                         |
| Discussions         | <https://github.com/mardakurt/kingfisher/discussions>                            | LIVE                         |
| Docs                | <https://github.com/mardakurt/kingfisher/tree/master/docs>                       | LIVE                         |
| Data mirror         | <https://mardakurt.github.io/kingfisher-data>                                    | LIVE (public)                |
| Pack — Elite OTB    | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>   | LIVE                         |
| Pack — Recent       | <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json>  | LIVE                         |
| Pack — High-Rated   | <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json>  | LIVE                         |
| Security policy     | <https://github.com/mardakurt/kingfisher/security/policy>                       | LIVE                         |

## 3. Vercel

The web app is **not yet deployed**. The one-click import
is the single remaining operator action.

> <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher>

The full procedure is in `docs/deployment.md`. After the
project exists:

- Production headers (CSP, COOP, COEP, HSTS, Referrer-Policy,
  Permissions-Policy, X-Content-Type-Options) are configured
  in both `next.config.ts` and `vercel.json`.
- `crossOriginIsolated` is true (with the `credentialless`
  COEP default that keeps Stockfish threaded while allowing
  cross-origin reads from the GitHub Pages data mirror).
- `SharedArrayBuffer` is available.
- Threaded Stockfish will run; the WASM-unsafe-eval CSP
  exception covers it.
- The maintainer sets `KINGFISHER_PUBLIC_WEB_URL` in
  *Settings → Environment Variables*, triggers a redeploy,
  and `npm run public:check` goes from 14/19 to 19/19.

A `vercel-deploy.mjs` CLI alternative exists
(`npm run deploy:vercel`) that uses `VERCEL_TOKEN` from
the environment. It is the path for terminal-driven
deploys, not the recommended one.

## 4. Landing UI — problems found and fixes

The Phase 24 landing page was technically correct but
visually heavy. The owner identified:

1. **Too many bordered cards.** The Phase 24 page had four
   card grids (sources, engines, databases, local-first) in
   addition to the hero. Every section repeated the
   "card grid" pattern.
2. **Hero too busy.** The hero carried a board, an Explorer
   panel, and an engine panel — three columns of dense UI
   in the first viewport.
3. **Insufficient headline hierarchy.** The hero title was
   the same scale as the section titles, so the eye did not
   know where to land.
4. **Weak whitespace.** The cards were tightly packed; the
   page felt like a dashboard widget collection.
5. **Repetitive rectangles.** Every section looked the same
   because every section was the same "card grid" pattern.
6. **Animation competing with copy.** The auto-cycling
   source animation changed state every 3.2 s, before the
   visitor could read the labels.

Phase 25 fixes:

1. **One big product moment.** The hero carries one large
   product screenshot (the Kingfisher analysis view) with
   restrained perspective. No animation in the hero.
2. **No card grids.** Sections are copy + one big visual,
   or a single centred statement. There are no more
   four-up source cards, no nine-up engine cards, no
   six-up database cards.
3. **A disciplined type scale.** Hero title is
   `clamp(2.6rem, 5.2vw + 1rem, 4.5rem)` and bold; section
   titles are `clamp(1.9rem, 2.4vw + 1rem, 2.8rem)`;
   eyebrows are 0.78 rem uppercase; body is 1.07 rem.
4. **One continuous rhythm.** All sections share the same
   `6–7 rem` vertical padding and the same maximum width
   of 1200 px.
5. **No source-card grid.** The four sources are a
   numbered list beside a single research screenshot.
   Sources still keep their identity (Elite OTB / Recent
   Theory / High-Rated Online / Kingfisher Starter), but
   the visual does not put them in equal-weight boxes.
6. **No auto-cycle.** The product moment is a static
   screenshot. The "feel" comes from the chrome,
   the perspective, and the four-up stats strip, not from
   constant motion.
7. **Honest web CTA.** The hero's primary CTA is
   "Launch Kingfisher", which points at
   `https://kingfisher.vercel.app`. The page is honest
   that the web app is one click away from being live;
   the maintainer's Vercel import is the missing piece.

## 5. Landing performance

| Metric             | Phase 24        | Phase 25        | Notes |
| ------------------ | --------------- | --------------- | ----- |
| HTML               | 31 KB           | 17 KB           | fewer sections, no inline script tag |
| CSS                | 24 KB           | 17 KB           | one stylesheet, fewer utility selectors |
| JS                 | 7 KB            | 0 KB            | no JS animation, the hero is a static screenshot |
| Brand mark         | 0.7 KB          | 0.7 KB          | unchanged |
| OG image           | 150 KB          | 150 KB          | unchanged |
| Above-fold image   | —               | ~720 KB         | one big hero screenshot (PNG) |
| Total above-fold   | ~210 KB         | ~890 KB         | the only added weight is the one product screenshot |
| Sections           | 5 (Hero, Research, Engines, Local, Download) | 5 (Hero, Why, Research, Engines, Local, Download) | six sections, but the Why section is text-only |

The total transfer went up because the hero is now a real
product screenshot rather than a built-in animation. The
screenshot is `loading="eager"` `fetchpriority="high"` and
renders in the first viewport. Pages that follow are
`loading="lazy"`. No image is hidden behind an animation;
none of the JS is doing work the CSS can do.

The site is still: no framework, no build step, no
runtime, no client-side analytics, no third-party fonts.
The CSP meta is unchanged and strict. The same `prefers-
reduced-motion` rule applies (no animations to suppress,
but the page is correct without the rule).

## 6. Connection matrix

Same as Phase 24. The public link check is
`npm run public:check`. Current result against the live
public surface:

```
✓  200  Landing page
✓  200  GitHub repository
✓  200  GitHub latest release
✓  200  macOS DMG (latest)
✓  200  Issue tracker
✓  200  Discussions
✓  200  Docs root
✓  200  Install guide
✓  200  Pack: elite manifest
✓  200  Pack: recent manifest
✓  200  Pack: online manifest
✓  200  Pack chunk: elite
✓  200  Pack chunk: recent
✓  200  Pack chunk: online
✗  404  Web app entry          (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /players       (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /databases     (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /openings      (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /settings      (kingfisher.vercel.app — DEPLOY PENDING)
```

14/19 pass today. The remaining 5 are the same route
under 5 different paths. They all become 200 the moment
the Vercel project exists. The check fails loudly on
each one, which is the right behaviour.

## 7. Public check target

Target: **19/19**. The procedure is in §3 above; the
expected time is roughly 60 seconds of human action
(one click, one environment variable, one redeploy).

## 8. Reference packs

| Pack                | URL                                                                              | Bytes | Public since  |
| ------------------- | -------------------------------------------------------------------------------- | ----- | -------------- |
| Elite OTB v2        | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>   | 324 MB | Phase 24 |
| Recent Theory v1    | <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json>  | 32 MB  | Phase 24 |
| High-Rated Online v1 | <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json> | 82 MB  | Phase 24 |
| Kingfisher Starter   | bundled with the application                                                    | 12 MB  | since Phase 22 |

A clean-profile install walk-through on the **real
production web app** is the next agent's release-cert step,
once Vercel is live. The Phase 22 walk-through covered
the local desktop profile; Phase 24's was the local
desktop profile. The production-web clean-profile
install is the new cross-surface test.

## 9. Production opening explorer

Cannot certify against the production web app until
Vercel is live. The next agent's release-cert step is:

- Open production Kingfisher in a fresh browser profile.
- Open Starter Explorer. Confirm the Explorer answers
  for the starting position.
- Switch sources between Elite OTB / Recent Theory /
  High-Rated Online / Kingfisher Starter. Confirm the
  column headers change.
- Click into a model game. Confirm the move list and the
  Engine PV populate.
- Type `Carlsen` into Players. Confirm the profile loads
  and the games list populates.

The expected result is the same behaviour the local
build already exhibits, with the additional
cross-origin check that the GitHub Pages data mirror
serves the chunks and manifests from `kingfisher.vercel.app`
without a CORS failure. The `vercel.json` allows
`https://mardakurt.github.io` in `connect-src`; the
production Next.js app sends the matching CORS headers
implicitly because the data is fetched by the same
origin (the GitHub Pages origin), not proxied.

## 10. Production players

Same — next-agent release-cert step on real Vercel.

## 11. Production engine

The threaded Stockfish build ships inside the production
Next.js bundle. `next.config.ts` sets the cross-origin
isolation headers and the CSP `wasm-unsafe-eval` exception.
A real-browser check that the worker actually starts
and reports a depth is the next-agent release-cert step.

## 12. Production persistence

Next-agent release-cert step on real Vercel:

- Create a Study.
- Create a Repertoire move.
- Change a preference.
- Reload.
- Close the browser.
- Reopen.
- Verify everything is still there.

The application's data path is local IndexedDB;
`mardakurt.github.io` is the data mirror for the
optional packs. The production origin is the new
storage identity; the local-host data does not transfer.

## 13. Security follow-up

- **`gitleaks:allow` directives.** Added in Phase 24. The
  four gitleaks hits are intentional test fixtures, all
  four files now have the `gitleaks:allow` comment at
  the top of the file. The next agent that adds a real
  credential to the repository will still be caught
  immediately, because `gitleaks:allow` is a per-line /
  per-block directive, not a global disable.
- **Dependabot.** Enabled with a weekly cadence and a
  three-PR cap. The configuration is at
  `.github/dependabot.yml`. It consumes negligible
  Actions minutes compared with the test matrices.
- **GitHub Security tab.** Secret scanning and push
  protection are recommended in the Phase 24 security
  report; enabling them is a one-click repository
  setting, not a code change.
- **Production headers.** Configured in both
  `next.config.ts` and `vercel.json`. The Phase 24
  security baseline is preserved.

## 14. Tests

Local:

| Suite                                     | Result              |
| ----------------------------------------- | ------------------- |
| `npm run typecheck`                       | 0 errors            |
| `npm run lint`                            | 0 errors            |
| `npm run format:check`                    | GREEN               |
| `npm test` (vitest)                       | 2177 passed, 11 skipped |
| `npm run build`                           | succeeds            |
| `git diff --check`                        | clean               |
| `npm run security:scan`                   | 0 High / 0 Critical |
| `npm run public:check`                    | 14/19 (5 are Vercel-pending) |
| `npm run desktop:smoke -- --packaged`    | 17/17               |
| `npm run desktop:restart -- --packaged`  | 5/5                 |

Remote:

| Workflow                  | What was run                                  |
| ------------------------- | --------------------------------------------- |
| `ci.yml`                  | not run (local gate is sufficient)            |
| `release-build.yml`       | not run (no v* tag in Phase 25)               |
| `browser-cert.yml`        | not run (no v* tag in Phase 25)               |
| `engine-build.yml`        | not run (engine catalogue unchanged)          |
| `engines.yml`             | not run (engine catalogue unchanged)          |
| `desktop-package.yml`     | not run (Linux/Windows are not supported)     |
| `lichess-smoke.yml`       | not run (manual only)                         |
| `visual-review.yml`       | not run (visual baseline unchanged)           |

## 15. Bugs

| # | Severity    | Title                                                                  | Status      |
| - | ----------- | ---------------------------------------------------------------------- | ----------- |
| 1 | INFORMATIONAL | 4 gitleaks false positives in test fixtures                          | Documented, marked `gitleaks:allow` |
| 2 | INFORMATIONAL | Web app is not yet deployed to a public URL                         | **Open** — one-click Vercel import  |
| 3 | INFORMATIONAL | macOS preview is not notarized                                       | **Open** — Developer ID Application certificate |
| 4 | INFORMATIONAL | Hero no longer auto-cycles the source labels — the visual is static | **By design** — owner feedback said the animation was distracting |

No Critical, no High, no Critical UI, no High UI defects.

## 16. Version / release

- The application source code did not change in a way
  that warrants a version bump. `Kingfisher 1.0.0-rc.4`
  is still the current release.
- The landing page, the Vercel config, the deploy
  script, the Dependabot config, and the security
  follow-up are not application source. They are
  infrastructure; the desktop binary is unchanged.
- If a future Phase cuts `1.0.0-rc.5`, it will be a
  real code change. The Vercel env-var defaults and
  the canonical URL config are versioned with the
  application, not separately.

## 17. Known limitations

Carried from earlier phases, plus the new Phase 25 ones:

- macOS preview is not notarized.
- No auto-update.
- Windows and Linux build but are unsupported.
- macOS Intel builds but has not been launched.
- No games before 2020 in any first-party reference.
- Chess960 is not supported, deliberately.
- Local Syzygy needs the user's own table files.
- The web app is one click away from being live.
- The Phase 24 web-app routes cannot be certified on
  the real production origin until Vercel is live.

## 18. Release verdict

**PUBLIC PREVIEW DEPLOY-PENDING**

After the Vercel one-click import, the verdict moves to
**PUBLIC PREVIEW LIVE**. The transition is:

1. Open <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher>.
2. Sign in, accept defaults, click Deploy.
3. Copy the project URL.
4. Set `KINGFISHER_PUBLIC_WEB_URL=<url>` in the Vercel
   Production environment.
5. Update `src/release/public-urls.ts` (the `web`
   default) to match the new URL.
6. `npm run public:check` → 19/19.

## 19. Next development model

The brief is explicit: **stop building giant phases**.

The recommended workflow from here:

1. The maintainer performs the Vercel one-click import.
2. The maintainer attaches a Developer ID Application
   certificate when available; the macOS build is
   notarised; the *preview* label drops.
3. Filed bugs become tests. Point releases fix them.
4. `1.0.0-rc.5` is the next RC if a real change is needed.
5. The agent's job is to respond to filed issues and ship
   small fixes, not to invent new features.

## 20. Owner handoff

The Phase 25 owner handoff is short because Phase 24's
handoff already covers the operational procedures. The
new step is the Vercel import.

### How to deploy the web app (the one remaining action)

1. Open <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher>.
2. Sign in with the GitHub account that owns
   `mardakurt/kingfisher`.
3. Accept the default Next.js detection. The Root
   Directory stays at the repository root.
4. Click **Deploy**.
5. Copy the project URL.
6. *Settings → Environment Variables → Production*: set
   `KINGFISHER_PUBLIC_WEB_URL` to that URL.
7. Trigger a redeploy.
8. Update `src/release/public-urls.ts` (the `web` field
   default) to match the new URL, then commit and push.
9. `npm run public:check` → 19/19.
10. Update the `verdict` in this document from
    *DEPLOY-PENDING* to *LIVE*.

### How to update the landing page

```
# 1) Edit files under marketing/ in the kingfisher repository.
# 2) Run the default local gate:
npm run release:verify
# 3) Push the source change to master.
git add marketing/
git commit -m "site: refresh the public landing page"
git push
# 4) Mirror the marketing/ to the data repository.
#    The script refuses to delete a reference-* directory.
node scripts/publish-site.mjs --apply
# 5) Wait ~30 seconds for the Pages build, then verify.
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://mardakurt.github.io/kingfisher-data/"
```

### How to check all public links

```
KINGFISHER_PUBLIC_DATA_ROOT_URL=https://mardakurt.github.io/kingfisher-data \
  npm run public:check
```

### How to run the security check

```
npm run security:scan
```

### How to publish a new reference pack

```
node scripts/publish-data.mjs \
  --id kingfisher-elite-otb --version 3 \
  --from .packs/kingfisher-elite-otb --apply
```

### How to publish the next RC

The full procedure is in `docs/release/release-checklist.md`.
For a landing-only change (no application code), it is:

1. Edit `marketing/`.
2. `npm run release:verify` (default gate).
3. Commit and push.
4. `node scripts/publish-site.mjs --apply`.
5. Done.

For a full RC (application code change), it is:

1. Bump `package.json` and `desktop/package.json`.
2. `npm run release:verify` (or `release:verify:full`).
3. `npm run release:manifest`.
4. Build the DMG.
5. `git tag -a v<version>` and `git push --tags`.
6. `gh release create v<version> --prerelease --notes-file …`.

### How to check the Vercel deployment health

```
# Open the Vercel project URL in a browser.
open "<your Vercel URL>/analysis"

# Or, from the CLI:
vercel ls <project>
vercel inspect <deployment>
```

### How to roll back the landing page

```
# The landing page is git in the data mirror. To roll back:
cd /tmp/kingfisher-data-stage
git log --oneline index.html | head -5
git checkout <previous-commit> -- index.html assets/ manifest.webmanifest robots.txt
git commit -m "site: roll back the landing page"
git push
```

### How to roll back the Vercel deployment

Vercel retains every deployment. In the project UI,
*Deployments → click a previous successful deployment →
Promote to Production*. The CLI equivalent is
`vercel rollback`.

## 21. Final word

The public surface is now:
- A landing page that looks like a real product.
- A web app one click away from being live.
- A macOS preview that downloads, code-signed, with an
  honest *preview* label.
- A reference-data mirror that is installable from
  production.
- A GitHub repository with the changelog, the issue
  tracker, the discussions, the security policy, the
  install guide, and the issue templates.
- A dependency-updates pipeline (Dependabot) that does
  not flood Actions minutes.
- A security baseline (CSP, COOP, COEP, HSTS,
  Referrer-Policy, Permissions-Policy, OAuth redaction,
  Electron contextIsolation) that the next agent does
  not need to re-establish.

The single remaining operator action is the Vercel
import. The agent cannot perform it. The maintainer
performs it in 60 seconds. The release verdict
transitions to **PUBLIC PREVIEW LIVE** and the
product is genuinely usable for first users.

After that, the next agent that opens this repository
should respond to filed issues and ship point
releases. They should not start another giant phase.
