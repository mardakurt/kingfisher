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
  readonly integrity: IntegrityReport | null;
  readonly failures: readonly RecordedFailure[];
  readonly counts: Readonly<Record<string, number>>;
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
  lines.push(`Browser         ${input.userAgent}`);
  lines.push(`Language        ${input.language}`);
  lines.push(`Viewport        ${input.viewport.width}x${input.viewport.height}`);
  lines.push(`Cross-origin isolated  ${yesNo(input.crossOriginIsolated)}`);
  lines.push('');

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
