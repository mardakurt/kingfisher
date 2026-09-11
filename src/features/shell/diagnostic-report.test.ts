/**
 * The report goes into public bug trackers, so these tests are mostly about
 * what must *not* be in it.
 */

import { describe, expect, it } from 'vitest';

import { buildDiagnosticReport, buildSupportSummary, redact } from './diagnostic-report';
import type { DiagnosticInput } from './diagnostic-report';

// gitleaks:allow — these are deterministic test fixtures used to
// exercise the diagnostic-report redaction layer in
// src/features/shell/diagnostic-report.ts. They are not real
// credentials. The Phase 24 security review at
// docs/security/phase-24-security-review.md documents the four
// `generic-api-key` false positives this file produces.
const LICHESS_TOKEN = 'lip_9f3aB2cD4eF6gH8iJ0kL'; // gitleaks:allow — deterministic redaction fixture
const ASSISTANT_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz012345'; // gitleaks:allow — deterministic redaction fixture
const COMPANION_TOKEN = 'c223a6466c46b3b2c71f7c9335639ad9018fe5f93dba8486f2b985151e138975'; // gitleaks:allow — deterministic redaction fixture

const input: DiagnosticInput = {
  appVersion: '0.1.0',
  commit: 'abc1234',
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/141',
  platform: { os: 'darwin', arch: 'arm64' },
  language: 'en-GB',
  viewport: { width: 1440, height: 900 },
  crossOriginIsolated: true,
  storage: {
    indexedDb: 'available',
    usageBytes: 52_428_800,
    quotaBytes: 1_073_741_824,
    persisted: true,
  },
  providers: [
    {
      id: 'lichess-masters',
      name: 'Lichess Masters',
      health: {
        state: 'authentication-required',
        checkedAt: 1,
        message: 'Connect a personal access token to use the explorer.',
      },
    },
  ],
  engines: [{ id: 'stockfish-wasm', name: 'Stockfish 17.1', transport: 'worker', status: 'ready' }],
  companion: { state: 'online', engines: 2, databases: 1 },
  references: [
    {
      id: 'kingfisher-starter',
      name: 'Kingfisher Starter Reference',
      state: 'ready',
      version: '2',
      games: 172_376,
      bytes: 12_348_080,
      manifestUrl: '/reference/kingfisher-starter/manifest.json',
    },
    {
      id: 'kingfisher-elite-otb',
      name: 'Elite OTB Reference',
      state: 'available',
      manifestUrl: 'https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json',
      lastError: 'This reference source is not published at the address this version looks for.',
    },
  ],
  secrets: { lichessToken: true, companionToken: true, assistantApiKey: true },
  assistant: { configured: true, model: 'local-model' },
  integrity: {
    checkedAt: 1,
    durationMs: 42,
    counts: { games: 10_000 },
    issues: [],
  },
  failures: [{ label: 'The explorer', message: 'Cannot read properties of undefined', at: 1 }],
  counts: { games: 10_000, studies: 4 },
};

const secrets = [LICHESS_TOKEN, ASSISTANT_KEY, COMPANION_TOKEN];

describe('what the report must never contain', () => {
  const report = buildDiagnosticReport(input, secrets);

  it('contains no configured secret', () => {
    expect(report).not.toContain(LICHESS_TOKEN);
    expect(report).not.toContain(ASSISTANT_KEY);
    expect(report).not.toContain(COMPANION_TOKEN);
  });

  it('reports secrets as present rather than partially', () => {
    expect(report).toContain('Lichess token configured    yes');
    // Not even a prefix: `sk-proj-…` in a public issue is still a leaked key.
    expect(report).not.toContain('lip_');
    expect(report).not.toContain('sk-proj');
  });

  it('says plainly that chess content is excluded', () => {
    expect(report).toContain('No games, studies, notes, tokens or keys are included');
  });

  it('redacts a secret that arrives inside an error message', () => {
    const leaked = buildDiagnosticReport(
      {
        ...input,
        companion: { state: 'offline', error: `GET /status failed with token ${COMPANION_TOKEN}` },
      },
      secrets,
    );
    expect(leaked).not.toContain(COMPANION_TOKEN);
    expect(leaked).toContain('[redacted]');
  });

  it('redacts an unknown bearer token it has never been told about', () => {
    expect(redact('Authorization: Bearer someOtherThing123', [])).toBe(
      'Authorization: Bearer [redacted]',
    );
  });

  it('redacts long hex strings even when they are not in the secret list', () => {
    expect(redact(`token=${'a'.repeat(64)}`, [])).toBe('token=[redacted]');
  });

  it('removes credentials from custom URLs and home paths without knowing their values', () => {
    const report = redact(
      'https://alice:private-password@example.org/pack/manifest.json?key=private-key#private-fragment /Users/alice/Library/test /home/bob/log C:\\Users\\Carol\\AppData',
      [],
    );
    for (const value of [
      'alice',
      'private-password',
      'private-key',
      'private-fragment',
      'bob',
      'Carol',
    ])
      expect(report).not.toContain(value);
    expect(report).toContain('https://example.org/pack/manifest.json');
  });

  it('leaves short values alone rather than mangling ordinary text', () => {
    expect(redact('depth 30 nodes 4500000', [])).toBe('depth 30 nodes 4500000');
    // A short "secret" is not used as a needle; it would match everywhere.
    expect(redact('the cat sat', ['cat'])).toBe('the cat sat');
  });
});

describe('what the report must contain', () => {
  const report = buildDiagnosticReport(input, secrets);

  it('identifies the build and the browser', () => {
    expect(report).toContain('0.1.0 (abc1234)');
    expect(report).toContain('Chrome/141');
  });

  it('reports cross-origin isolation, which decides which engine builds run', () => {
    expect(report).toContain('Cross-origin isolated  yes');
  });

  it('reports storage usage in readable units', () => {
    expect(report).toContain('50.0 MB of 1.0 GB');
  });

  it('reports provider health with its message', () => {
    expect(report).toContain('authentication-required');
    expect(report).toContain('Connect a personal access token');
  });

  it('reports a healthy integrity scan with its duration', () => {
    expect(report).toContain('Healthy (scanned in 42 ms)');
  });

  it('lists integrity issues by category and whether they can be repaired', () => {
    const withIssues = buildDiagnosticReport(
      {
        ...input,
        integrity: {
          checkedAt: 1,
          durationMs: 10,
          counts: {},
          issues: [
            {
              category: 'orphaned-reference',
              title: 'Stored moves with no game',
              detail: 'x',
              store: 'gameContent',
              ids: ['a', 'b'],
              repairable: true,
            },
          ],
        },
      },
      secrets,
    );
    expect(withIssues).toContain('[orphaned-reference] Stored moves with no game — 2 record(s)');
    expect(withIssues).toContain('(repairable)');
  });

  it('records component failures so a crash is diagnosable after the fact', () => {
    expect(report).toContain('The explorer: Cannot read properties of undefined');
  });

  it('says when integrity has not been scanned rather than implying health', () => {
    expect(buildDiagnosticReport({ ...input, integrity: null }, secrets)).toContain(
      'Not scanned in this session.',
    );
  });

  it('says when nothing has failed rather than leaving the section blank', () => {
    expect(buildDiagnosticReport({ ...input, failures: [] }, secrets)).toContain(
      'None recorded in this session.',
    );
  });
});

/**
 * The shell section, and the reason it exists.
 *
 * A desktop bug report used to be indistinguishable from a browser one: the
 * shell had exposed its versions and the state of the two processes it owns
 * since Phase 19, and nothing in the application ever asked. "The companion is
 * offline" then meant two different things — the user never started one, or
 * the shell started one and it died — and the report could not tell them
 * apart.
 */
describe('the application shell section', () => {
  const shell: DiagnosticInput['desktop'] = {
    shell: { name: 'Kingfisher', version: '1.0.0', chrome: '152.0.7977.76' },
    node: '24.20.0',
    packaged: true,
    webServer: { running: true, pid: 4321 },
    companionProcess: {
      running: false,
      pid: null,
      log: ['companion listening on 127.0.0.1:51763', 'could not open the collection'],
    },
  };

  it('is absent in a browser, and says which identity this is', () => {
    const report = buildDiagnosticReport(input, secrets);
    expect(report).not.toContain('## Application shell');
    expect(report).toContain('Runs as         web page');
  });

  it('names the shell, the Chromium, the Node and whether it is packaged', () => {
    const report = buildDiagnosticReport({ ...input, desktop: shell }, secrets);
    expect(report).toContain('Runs as         desktop application');
    expect(report).toContain('Kingfisher 1.0.0');
    expect(report).toContain('152.0.7977.76');
    expect(report).toContain('24.20.0');
    expect(report).toContain('Packaged        yes');
  });

  /*
    The distinction the section was added for: a companion that is *stopped*
    while the shell that owns it is running, with the reason it stopped.
  */
  it('reports each process separately, with the log that explains a failure', () => {
    const report = buildDiagnosticReport({ ...input, desktop: shell }, secrets);
    expect(report).toContain('Web server      running (pid 4321)');
    expect(report).toContain('Companion       stopped');
    expect(report).toContain('could not open the collection');
  });

  it('redacts a secret that reached the companion log', () => {
    const leaky = {
      ...shell,
      companionProcess: {
        ...shell.companionProcess,
        log: [`paired with token ${COMPANION_TOKEN}`],
      },
    };
    const report = buildDiagnosticReport({ ...input, desktop: leaky }, secrets);
    expect(report).not.toContain(COMPANION_TOKEN);
  });
});

/**
 * The short form, which people paste far more often than the long one.
 *
 * It is a view of the same input, so the safety tests above already cover it —
 * these are about it being *useful*: the facts that decide what the next
 * support question is, and no more than that.
 */
describe('the support summary', () => {
  const summary = buildSupportSummary(input, secrets);

  it('carries no secret either', () => {
    expect(summary).not.toContain(LICHESS_TOKEN);
    expect(summary).not.toContain(ASSISTANT_KEY);
    expect(summary).not.toContain(COMPANION_TOKEN);
  });

  it('says which build, which machine and which identity', () => {
    expect(summary).toContain('Kingfisher 0.1.0');
    expect(summary).toContain('darwin arm64');
    expect(summary).toContain('Web');
  });

  it('says which sources exist and what state each is in', () => {
    expect(summary).toContain('Kingfisher Starter Reference ready');
    expect(summary).toContain('Elite OTB Reference available');
  });

  it('stays short enough to paste into a chat', () => {
    expect(summary.split('\n').length).toBeLessThanOrEqual(12);
  });
});

describe('the address a pack was fetched from', () => {
  const report = buildDiagnosticReport(input, secrets);

  /*
    The failure copy tells a user that Diagnostics records the address that was
    tried. This is the assertion that keeps that sentence from being a gesture:
    remove the section and the promise the application makes becomes false.
  */
  it('is in the report, because the install failure promises it is', () => {
    expect(report).toContain(
      'https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json',
    );
    expect(report).toContain('not published at the address');
  });
});
