/**
 * What a change to the repository must touch for the web deployment to be
 * worth building again.
 *
 * Every push to `master` used to build and keep a deployment, and about half
 * of the commits change nothing the web serves — a phase handover, the
 * changelog, a browser test, the desktop shell, the companion. Vercel's Hobby
 * plan meters *Deployment Storage* by the day, cumulatively over the billing
 * period, so a deployment that differs from the one before it by a paragraph
 * in `docs/` still costs its whole output every day it is kept. The
 * `ignoreCommand` in `vercel.json` runs `vercel-ignore-build.mjs`, which asks
 * this module whether anything in the *web build's* inputs changed since the
 * commit Vercel last deployed; `vercel-status.mjs` asks the same question so
 * that "up to date" stays true when the newest commits were skipped on
 * purpose.
 *
 * The rule is deliberately narrow in what it *excludes*: a path is left out
 * only when nothing the Next.js build reads lives there. Anything else — a
 * new directory, a config file at the root, `package.json` — builds. When in
 * doubt, the answer is "build"; a wasted deployment costs storage, a skipped
 * one that mattered costs a stale site.
 */

/**
 * Directories and file kinds the web build never reads. Each entry is a
 * predicate on a repository-relative path.
 */
const EXCLUDED = [
  { because: 'documentation, reports and ADRs', matches: (p) => p.startsWith('docs/') },
  { because: 'Markdown anywhere is prose, never imported', matches: (p) => /\.md$/i.test(p) },
  { because: 'the browser test suite and its baselines', matches: (p) => p.startsWith('e2e/') },
  {
    because: 'the desktop shell, built and shipped separately',
    matches: (p) => p.startsWith('desktop/'),
  },
  {
    because: 'the companion process, never part of the web bundle',
    matches: (p) => p.startsWith('companion/'),
  },
  {
    because: 'the brand sources; the rendered icons live under src/app',
    matches: (p) => p.startsWith('brand/'),
  },
  { because: 'the legacy GitHub Pages redirect', matches: (p) => p.startsWith('marketing/') },
  { because: 'engine sources built by the maintainer', matches: (p) => p.startsWith('engines/') },
  {
    because: 'agent and editor configuration',
    matches: (p) =>
      p.startsWith('.claude/') || p.startsWith('.github/') || p.startsWith('.vscode/'),
  },
  {
    because: 'diagnostics and desktop/release scripts, run by hand',
    matches: (p) =>
      p.startsWith('scripts/diagnostics/') ||
      /^scripts\/(desktop|release|publish|deploy|vercel)-[^/]*\.(mjs|sh|py)$/.test(p) ||
      p.startsWith('scripts/reference/'),
  },
];

/** Whether one changed path is outside everything the web build reads. */
export function isOutsideWebBuild(path) {
  return EXCLUDED.some((rule) => rule.matches(path));
}

/**
 * Whether a set of changed paths needs a new deployment. An empty change set
 * (nothing differs) does not; any path the rule cannot place does.
 */
export function needsWebBuild(changedPaths) {
  return changedPaths.some((path) => !isOutsideWebBuild(path));
}
