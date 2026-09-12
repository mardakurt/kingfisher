'use client';

/**
 * The report a user pastes into a bug report.
 *
 * The whole value of this is that it can be shared without thinking, which
 * means the safety has to be structural rather than careful. Nothing is copied
 * from preferences by spreading an object and deleting the sensitive keys —
 * that pattern quietly starts leaking the day someone adds a new secret. Every
 * field below is named individually, so a new preference is absent from the
 * report until somebody deliberately adds it.
 *
 * Secrets are reported as *whether they are set*, never as a prefix, a length
 * or a redacted stub. "Configured: yes" answers every question a diagnosis
 * actually asks, and `sk-abc…` in a public issue is still a leaked key.
 *
 * Chess content is excluded for the same reason: a user's games, studies and
 * notes are theirs to share deliberately, through the backup export, not by
 * accident through a support paste.
 */

import type { RecordedFailure } from '@/components/ErrorBoundary';
import type { IntegrityReport } from '@/persistence/integrity';
import type { ProviderHealth } from '@/database/types';

export interface DiagnosticInput {
  readonly appVersion: string;
  readonly commit?: string;
  readonly userAgent: string;
  /**
   * The operating system and instruction set, as plainly as they can be had.
   *
   * A bug report that says "macOS" and a bug report that says "macOS arm64"
   * are different bug reports the moment a native engine is involved, and the
   * user agent is not a reliable answer: it is frozen, it says "Intel Mac OS X"
   * on Apple silicon, and on the desktop it describes Chromium rather than the
   * machine. The shell knows the truth and is asked for it; a browser gets the
   * best guess `navigator` can give, marked as such.
   */
  readonly platform: { readonly os: string; readonly arch: string };
  readonly language: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly crossOriginIsolated: boolean;
  readonly storage: {
    readonly indexedDb: 'available' | 'unavailable';
    readonly usageBytes?: number;
    readonly quotaBytes?: number;
    readonly persisted?: boolean;
  };
  readonly providers: readonly {
    readonly id: string;
    readonly name: string;
    readonly health: ProviderHealth | null;
  }[];
  readonly engines: readonly {
    readonly id: string;
    readonly name: string;
    readonly transport: string;
    readonly status: string;
  }[];
  readonly companion: {
    readonly state: 'online' | 'offline' | 'not-paired';
    readonly engines?: number;
    readonly databases?: number;
    readonly error?: string;
  };
  readonly secrets: {
    readonly lichessToken: boolean;
    readonly companionToken: boolean;
    readonly assistantApiKey: boolean;
  };
  readonly assistant: {
    readonly configured: boolean;
    readonly model?: string;
  };
  /**
   * Every reference source, with the address it is fetched from.
   *
   * The address is the point. When a pack fails to install, the sentence the
   * user is shown says the source is not published at the address this version
   * looks for, and tells them Diagnostics records which address that was — so
   * this section is what makes that sentence true rather than a gesture. It is
   * also the fastest way to tell a build pointing at a withdrawn version
   * directory apart from a genuinely broken download.
   *
   * Manifest URLs are public by construction; a pack anyone can install is
   * served from somewhere anyone can reach. A URL a user pasted in themselves
   * still goes through the redaction pass with everything else.
   */
  readonly references: readonly {
    readonly id: string;
    readonly name: string;
    readonly state: string;
    readonly version?: string;
    readonly games?: number;
    readonly bytes?: number;
    readonly manifestUrl?: string;
    readonly lastError?: string;
  }[];
  readonly integrity: IntegrityReport | null;
  readonly failures: readonly RecordedFailure[];
  readonly counts: Readonly<Record<string, number>>;
  /**
   * What the application shell is, when there is one.
   *
   * Absent in a browser, and its absence is the report saying so. Until Phase
   * 20 a desktop report was indistinguishable from a browser one — the shell
   * had exposed all of this since Phase 19 and nothing asked for it — so a bug
   * report from the packaged application never said which Electron it was,
   * whether the bundle was packaged or run from a checkout, or whether the two
   * local processes the shell owns were actually up.
   *
   * The companion log is included because it is the one place a start-up
   * failure is written down, and it is redacted like everything else: the
   * pairing token is minted per run and appears in no line the companion
   * writes, but the redaction pass runs over this too rather than trusting
   * that.
   */
  readonly desktop?: {
    readonly shell: { readonly name: string; readonly version: string; readonly chrome: string };
    readonly node: string;
    readonly packaged: boolean;
    /**
     * Which build of the application this is — build number, commit and
     * channel — so a report saying "1.0.0" can be matched to the bytes the
     * person actually has. The channel is what tells support whether the
     * user is on the signed release or on a landing-page preview.
     */
    readonly build?: {
      readonly number: number | null;
      readonly commit: string | null;
      readonly channel: 'stable' | 'preview' | 'dev';
      readonly dirty: boolean;
    };
    readonly webServer: { readonly running: boolean; readonly pid: number | null };
    readonly companionProcess: {
      readonly running: boolean;
      readonly pid: number | null;
      readonly log: readonly string[];
    };
    /** Milliseconds from process start to each launch stage, if recorded. */
    readonly startup?: readonly { readonly stage: string; readonly at: number }[];
  };
}

/**
 * Values that must never appear in the output, whatever produced them.
 *
 * A last line of defence rather than the mechanism: the builder below never
 * reads a secret in the first place. This catches the case where one arrives
 * inside an error message — a provider that helpfully echoed the request URL,
 * for instance — which is exactly where a leak would otherwise hide.
 */
export function redact(text: string, secrets: readonly string[]): string {
  let output = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    output = output.split(secret).join('[redacted]');
  }
  // Custom manifest addresses and echoed request URLs may carry credentials
  // that were never entered in Settings. Keep the endpoint, not its secrets.
  output = output.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
    try {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}${url.hash ? '#[redacted]' : ''}`;
    } catch {
      return '[redacted URL]';
    }
  });
  output = output.replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s]+/g, '[home]');
  // Bearer tokens and long hex strings, whether or not we know their value.
  output = output.replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [redacted]');
  output = output.replace(/\b[0-9a-f]{32,}\b/gi, '[redacted]');
  return output;
}

const bytes = (value?: number): string => {
  if (value === undefined) return 'unknown';
  if (value < 1024) return `${value} B`;
  const units = ['kB', 'MB', 'GB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
};

const yesNo = (value: boolean | undefined): string =>
  value === undefined ? 'unknown' : value ? 'yes' : 'no';

export function buildDiagnosticReport(
  input: DiagnosticInput,
  secrets: readonly string[] = [],
): string {
  const lines: string[] = [];
  const at = new Date().toISOString();

  lines.push('# Kingfisher diagnostic report');
  lines.push('');
  lines.push(`Generated       ${at}`);
  lines.push(`Version         ${input.appVersion}${input.commit ? ` (${input.commit})` : ''}`);
  lines.push(`Runs as         ${input.desktop ? 'desktop application' : 'web page'}`);
  lines.push(`System          ${input.platform.os} ${input.platform.arch}`);
  lines.push(`Browser         ${input.userAgent}`);
  lines.push(`Language        ${input.language}`);
  lines.push(`Viewport        ${input.viewport.width}x${input.viewport.height}`);
  lines.push(`Cross-origin isolated  ${yesNo(input.crossOriginIsolated)}`);
  lines.push('');

  /*
    The shell, before storage, because it changes how every line below is read.

    A companion that is "not paired" means something different in a browser,
    where the user must start one, and in the application, where the shell was
    supposed to. Reporting which of the two this is turns that ambiguity into a
    fact.
  */
  if (input.desktop) {
    const { shell, webServer, companionProcess } = input.desktop;
    lines.push('## Application shell');
    lines.push(`Shell           ${shell.name} ${shell.version}`);
    lines.push(`Chromium        ${shell.chrome}`);
    lines.push(`Node            ${input.desktop.node}`);
    lines.push(`Packaged        ${yesNo(input.desktop.packaged)}`);
    if (input.desktop.build) {
      const { number, commit, channel, dirty } = input.desktop.build;
      lines.push(`Build           ${number ?? 'unrecorded'}`);
      lines.push(
        `Commit          ${commit ? commit.slice(0, 12) : 'unrecorded'}${dirty ? ' (dirty tree)' : ''}`,
      );
      lines.push(`Channel         ${channel}`);
    }
    lines.push(
      `Web server      ${webServer.running ? 'running' : 'stopped'}` +
        `${webServer.pid === null ? '' : ` (pid ${webServer.pid})`}`,
    );
    lines.push(
      `Companion       ${companionProcess.running ? 'running' : 'stopped'}` +
        `${companionProcess.pid === null ? '' : ` (pid ${companionProcess.pid})`}`,
    );
    if (companionProcess.log.length > 0) {
      lines.push('Companion log, last lines:');
      for (const line of companionProcess.log.slice(-12)) lines.push(`  ${line}`);
    }
    if (input.desktop.startup && input.desktop.startup.length > 0) {
      lines.push('Launch, from process start:');
      for (const { stage, at } of input.desktop.startup) {
        lines.push(`  ${stage.padEnd(20)} ${at} ms`);
      }
    }
    lines.push('');
  }

  lines.push('## Storage');
  lines.push(`IndexedDB       ${input.storage.indexedDb}`);
  lines.push(
    `Usage           ${bytes(input.storage.usageBytes)} of ${bytes(input.storage.quotaBytes)}`,
  );
  lines.push(`Persistent      ${yesNo(input.storage.persisted)}`);
  for (const [store, count] of Object.entries(input.counts)) {
    lines.push(`${store.padEnd(15)} ${count.toLocaleString()} records`);
  }
  lines.push('');

  lines.push('## Data integrity');
  if (!input.integrity) {
    lines.push('Not scanned in this session.');
  } else if (input.integrity.issues.length === 0) {
    lines.push(`Healthy (scanned in ${input.integrity.durationMs} ms).`);
  } else {
    lines.push(`${input.integrity.issues.length} issue(s):`);
    for (const issue of input.integrity.issues) {
      lines.push(
        `- [${issue.category}] ${issue.title} — ${issue.ids.length} record(s)` +
          `${issue.repairable ? ' (repairable)' : ''}`,
      );
    }
  }
  lines.push('');

  lines.push('## Reference sources');
  if (input.references.length === 0) {
    lines.push('None known to this build.');
  } else {
    for (const source of input.references) {
      const facts = [
        source.version ? `v${source.version}` : null,
        source.games !== undefined ? `${source.games.toLocaleString()} games` : null,
        source.bytes !== undefined ? bytes(source.bytes) : null,
      ].filter((fact): fact is string => fact !== null);
      lines.push(`${source.name.padEnd(30)} ${source.state.padEnd(16)}${facts.join(' · ')}`);
      if (source.manifestUrl) lines.push(`  from ${source.manifestUrl}`);
      if (source.lastError) lines.push(`  last error: ${source.lastError}`);
    }
  }
  lines.push('');

  lines.push('## Data providers');
  for (const provider of input.providers) {
    const health = provider.health;
    lines.push(
      `${provider.name.padEnd(20)} ${health?.state ?? 'not checked'}` +
        `${health?.latencyMs !== undefined ? ` · ${health.latencyMs} ms` : ''}`,
    );
    if (health?.message) lines.push(`  ${health.message}`);
  }
  lines.push('');

  lines.push('## Engines');
  for (const engine of input.engines) {
    lines.push(`${engine.name.padEnd(28)} ${engine.transport.padEnd(8)} ${engine.status}`);
  }
  lines.push('');

  lines.push('## Companion');
  lines.push(`State           ${input.companion.state}`);
  if (input.companion.engines !== undefined) {
    lines.push(`Engines         ${input.companion.engines}`);
    lines.push(`Databases       ${input.companion.databases}`);
  }
  if (input.companion.error) lines.push(`Last error      ${input.companion.error}`);
  lines.push('');

  lines.push('## Configuration');
  // Presence only. See the note at the top of this file.
  lines.push(`Lichess token configured    ${yesNo(input.secrets.lichessToken)}`);
  lines.push(`Companion token configured  ${yesNo(input.secrets.companionToken)}`);
  lines.push(`Assistant key configured    ${yesNo(input.secrets.assistantApiKey)}`);
  lines.push(`Assistant configured        ${yesNo(input.assistant.configured)}`);
  if (input.assistant.model) lines.push(`Assistant model             ${input.assistant.model}`);
  lines.push('');

  lines.push('## Recent component failures');
  if (input.failures.length === 0) {
    lines.push('None recorded in this session.');
  } else {
    for (const failure of input.failures) {
      lines.push(`- ${new Date(failure.at).toISOString()} ${failure.label}: ${failure.message}`);
    }
  }
  lines.push('');
  lines.push('No games, studies, notes, tokens or keys are included in this report.');

  return redact(lines.join('\n'), secrets);
}

/**
 * The short form, for pasting into a chat or the top of an issue.
 *
 * The full report is the right thing to attach to a bug and the wrong thing to
 * open a conversation with: nobody reads sixty lines to answer "which build are
 * you on?". This is the eight or so facts that decide what the next question
 * is — which version, which identity, which machine, is the companion up, is an
 * engine ready, is there any chess data.
 *
 * It is a *view* of the same input rather than a second collector, which is the
 * only arrangement that cannot drift: a field that is not in `DiagnosticInput`
 * cannot appear here, and the redaction pass runs over both.
 */
export function buildSupportSummary(
  input: DiagnosticInput,
  secrets: readonly string[] = [],
): string {
  const lines: string[] = [];

  lines.push(`Kingfisher ${input.appVersion}${input.commit ? ` (${input.commit})` : ''}`);
  lines.push(`${input.platform.os} ${input.platform.arch} · ${input.desktop ? 'Desktop' : 'Web'}`);
  if (input.desktop) {
    lines.push(
      `Shell Electron ${input.desktop.shell.version}, Chromium ${input.desktop.shell.chrome}`,
    );
    if (input.desktop.build) {
      const { number, commit, channel } = input.desktop.build;
      lines.push(
        `Build ${number ?? '?'}${commit ? ` (${commit.slice(0, 7)})` : ''} · ${channel} channel`,
      );
    }
  }

  /*
    Sources by name and state, and nothing when there are none.

    "Starter ready, Elite OTB available" is the line that most often ends a
    support conversation before it starts, because "the explorer is empty" and
    "the explorer has no source installed" look identical from the outside.
  */
  const sources = input.references.filter((source) => source.state !== 'unavailable');
  lines.push(
    sources.length > 0
      ? `Sources: ${sources.map((source) => `${source.name} ${source.state}`).join(', ')}`
      : 'Sources: none',
  );

  const engines = input.engines.filter((engine) => engine.status !== 'not started');
  lines.push(
    engines.length > 0
      ? `Engines: ${engines.map((engine) => `${engine.name} ${engine.status}`).join(', ')}`
      : `Engines: ${input.engines.length} known, none started this session`,
  );

  lines.push(`Companion: ${input.companion.state}`);
  lines.push(
    `Storage: ${bytes(input.storage.usageBytes)} used` +
      `${input.storage.persisted === true ? ', persistent' : ''}`,
  );

  const failures = input.failures.length;
  if (failures > 0) lines.push(`Component failures this session: ${failures}`);

  return redact(lines.join('\n'), secrets);
}
