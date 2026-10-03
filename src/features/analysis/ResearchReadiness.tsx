'use client';

import { applicableExplorerFilters } from '@/features/explorer/explorer-filters';
import { useState, useSyncExternalStore } from 'react';
import { Info } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  engineDefinition,
  engineDefinitionsVersion,
  subscribeEngineDefinitions,
} from '@/engine/registry';
import { useExplorer } from '@/features/explorer/useExplorer';
import { useExplorerSource } from '@/features/explorer/useExplorerSource';
import { describeBackupStatus } from '@/features/shell/backup-status';
import { useAutoBackupState } from '@/features/shell/useAutoBackup';
import { describeError } from '@/lib/describe-error';
import { useSourcesFor } from '@/reference/sources';
import { selectFen, selectSaveState, useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { researchEngineStatus } from './research-readiness';

export function ResearchReadiness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label="Research readiness"
        onClick={(event) => {
          // Safari does not focus buttons on pointer activation; the dialog
          // still needs a concrete invoking control to restore on dismissal.
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <Info />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Research readiness"
        description="Check the engine, reference population and protection of your work."
        width="w-[560px]"
        allowCommandHandoff
      >
        {open && <ReadinessDetails onClose={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function ReadinessDetails({ onClose }: { readonly onClose: () => void }) {
  const fen = useAnalysis(selectFen);
  const save = useAnalysis(selectSaveState);
  const documentKind = useAnalysis((state) => state.document.kind);
  const conflict = useAnalysis((state) => state.conflict);
  const saveError = useAnalysis((state) => state.saveError);
  const primary = useEngine((state) => state.primary);
  const analyse = useEngine((state) => state.analyse);
  const prefs = usePreferences();
  const backupAt = useAutoBackupState((state) => state.lastBackupAt);
  const backupState = useAutoBackupState((state) => state.status);
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const setSaveToStudyOpen = useUi((state) => state.setSaveToStudyOpen);
  useSyncExternalStore(
    subscribeEngineDefinitions,
    engineDefinitionsVersion,
    engineDefinitionsVersion,
  );
  const definition = engineDefinition(primary.engineId);
  const resolved = useExplorerSource(prefs.explorerSourceId);
  const provider = resolved.kind === 'ready' ? resolved.provider : undefined;
  const sources = useSourcesFor('explorer');
  const source = sources.find((entry) => entry.id === provider?.id);
  const offline = sources.find((entry) => entry.offline && entry.id !== provider?.id);
  const applicable = applicableExplorerFilters(prefs, provider?.capabilities);
  const query = useExplorer(provider?.id ?? '', fen, applicable.filters, !!provider);
  const answered = query.data?.fen === fen && query.data.source.id === provider?.id;
  const failure = query.error ? describeError(query.error) : null;
  const backup = describeBackupStatus({
    status: backupState,
    lastBackupAt: backupAt,
    reminderDays: prefs.autoBackupReminderDays,
  });
  const settings = (section: string) => {
    onClose();
    openSettingsAt(section);
  };
  const saveLabel = conflict
    ? 'Revision conflict · local work retained'
    : save === 'error'
      ? 'Not saved'
      : save === 'saving'
        ? 'Saving…'
        : save === 'unsaved'
          ? 'Unsaved changes'
          : documentKind === 'study-chapter'
            ? 'Chapter saved'
            : 'Draft saved · not filed in a study';

  return (
    <div className="space-y-4 text-[12px] text-secondary" data-research-readiness>
      {/* No live region: search frames must not continuously interrupt speech. */}
      <section aria-label="Engine readiness" className="space-y-2">
        <h3 className="font-semibold text-primary">Engine</h3>
        <p className="font-medium text-primary">{definition?.name ?? 'Unknown engine'}</p>
        <p data-readiness-engine>{researchEngineStatus(primary, fen)}</p>
        {primary.identity && (
          <p>
            Reported identity: {primary.identity.name}
            {primary.identity.version ? ` · ${primary.identity.version}` : ''}
          </p>
        )}
        {primary.problem && (
          <p className="text-negative">
            {primary.problem.message} {primary.problem.remedy}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="subtle"
            disabled={primary.running || primary.status === 'loading'}
            onClick={() =>
              void analyse(
                'primary',
                fen,
                { kind: 'depth', depth: 8 },
                {
                  multiPv: prefs.engineMultiPv,
                  threads: prefs.engineThreads,
                  hashMb: prefs.engineHashMb,
                },
              )
            }
          >
            Run short search
          </Button>
          <Button onClick={() => settings('engine')}>Engine settings</Button>
        </div>
        <p className="text-[11px] text-secondary">
          Uses the selected engine and current position; does not replace an active search.
        </p>
      </section>
      <section
        aria-label="Reference readiness"
        className="space-y-2 border-t border-line-subtle pt-3"
      >
        <h3 className="font-semibold text-primary">Reference population</h3>
        <p className="font-medium text-primary">
          {provider?.name ??
            (resolved.kind === 'waiting' ? 'Loading sources…' : 'No enabled source')}
        </p>
        {provider && provider.id !== prefs.explorerSourceId && (
          <p className="text-caution">
            Your preferred source is unavailable. The Explorer currently uses {provider.name}.
          </p>
        )}
        {source && (
          <p>
            {source.offline ? 'Installed · answers offline' : 'Online · needs a connection'}
            {source.license ? ` · ${source.license.id}` : ''}
          </p>
        )}
        {provider && <p>{provider.description}</p>}
        <p data-readiness-reference>
          {query.isFetching
            ? 'Checking this position…'
            : failure
              ? `${failure.message} ${failure.remedy ?? ''}`
              : answered
                ? `Answered this position · ${query.data!.totalGames.toLocaleString()} games in this population`
                : 'Not checked'}
        </p>
        {answered && query.data!.totalGames === 0 && (
          <p>No games reach this position in this source. This is a valid empty answer.</p>
        )}
        {applicable.applied.length > 0 && (
          <p>Explorer filters: {applicable.applied.join(', ')}. Counts apply to these filters.</p>
        )}
        {applicable.ignored.length > 0 && (
          <p>
            {applicable.ignored.join(' and ')} not applied: {provider?.name} cannot filter that way,
            so its counts are for all its games.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {offline && (
            <Button variant="subtle" onClick={() => prefs.set('explorerSourceId', offline.id)}>
              Use {offline.name} offline
            </Button>
          )}
          <Button onClick={() => settings('database')}>Reference settings</Button>
          {provider && (
            <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
              Check reference again
            </Button>
          )}
        </div>
      </section>
      <section aria-label="Work protection" className="space-y-2 border-t border-line-subtle pt-3">
        <h3 className="font-semibold text-primary">Work protection</h3>
        <p
          data-readiness-save
          className={conflict || save === 'error' ? 'text-negative' : 'text-primary'}
        >
          {saveLabel}
        </p>
        {saveError && <p className="text-negative">{saveError}</p>}
        <p data-readiness-backup>{backup.label}</p>
        {backupAt !== null && (
          <p>
            Last successful backup:{' '}
            <time dateTime={new Date(backupAt).toISOString()}>
              {new Date(backupAt).toLocaleString()}
            </time>
          </p>
        )}
        <p>{backup.title}</p>
        <p className="text-[11px] text-secondary">
          Local snapshots share this profile’s storage. Export a portable backup to keep a separate
          copy.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" onClick={() => settings('database')}>
            Manage and export backups
          </Button>
          {documentKind !== 'study-chapter' && (
            <Button
              onClick={() => {
                onClose();
                setSaveToStudyOpen(true);
              }}
            >
              Save to study
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
