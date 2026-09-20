'use client';

/**
 * The team hub: assignments, hand-ins and reviews, on one board.
 *
 * The rail is the coach's inbox — To do, Handed in, Accepted — and the dock's
 * context panel is one assignment's thread with the one button you need at
 * the bottom. The board is the same board as everywhere else: a hand-in is
 * opened on it, walked with the engine beside it, annotated, and handed back
 * from it. The route holds no chess state of its own.
 *
 * There is no server. A team is shared as a packet file (`@/team`), which is
 * how seconds and coaches already pass work around, and which is the honest
 * shape of the feature in an application that promises your work stays on
 * your device (`docs/design/team-hub.md`).
 */

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { Team as TeamIcon } from '@/components/icons';
import { useEngineSnapshots } from '@/features/analysis/useEngineSnapshots';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/plural';
import type { AssignmentRecord, Handover, TeamRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import {
  assignmentStatus,
  COLUMN_LABEL,
  COLUMN_OF,
  parseHandoverPgn,
  STATUS_LABEL,
  type AssignmentColumn,
} from '@/team';

import { MembersDialog, NewAssignmentDialog, NewTeamDialog } from './dialogs';
import { describeDue, KIND_LABEL, ROLE_LABEL, shortDate } from './labels';
import { describeReceipt, receivePacket, sharePacket } from './packet-io';
import { invalidateTeams, useAssignments, useTeam, useTeams } from './queries';
import { ThreadPanel, type HandoverDraft } from './ThreadPanel';

const COLUMNS: readonly AssignmentColumn[] = ['todo', 'handed-in', 'accepted'];

type DialogKind = 'new-team' | 'members' | 'new-assignment' | null;

export function TeamWorkspace() {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const documentTitle = useAnalysis((state) => state.document.title);
  /*
    A search that settles on this board is kept in the tree, as on Analysis.
    Without it a coach who ran Stockfish to depth 28 on a hand-in would return
    it with "no engine evaluations recorded", which was true and useless.
  */
  useEngineSnapshots();

  const teams = useTeams();
  const [chosenTeamId, setChosenTeamId] = useState<string | null>(null);
  // A chosen team that was deleted, or one a packet has not created yet, falls back to the first.
  const chosenExists = Boolean(
    chosenTeamId && teams.data?.some((entry) => entry.id === chosenTeamId),
  );
  const teamId = (chosenExists ? chosenTeamId : null) ?? teams.data?.[0]?.id ?? null;
  const team = useTeam(teamId).data ?? null;
  const assignments = useAssignments(teamId).data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const assignment = assignments.find((entry) => entry.id === selectedId) ?? null;
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const me = team?.members.find((member) => member.id === team.me) ?? null;

  const fail = (message: string, error: unknown) =>
    notify({
      tone: 'error',
      message,
      detail: error instanceof Error ? error.message : undefined,
    });

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await work();
      invalidateTeams(client);
    } catch (error) {
      fail(failure, error);
    } finally {
      setBusy(false);
    }
  };

  /** Re-read before writing, so the write is against the live revision; retry once on a stale one. */
  const withTeam = (
    work: (
      repositories: Awaited<ReturnType<typeof getRepositories>>,
      current: TeamRecord,
    ) => Promise<unknown>,
  ) =>
    run(async () => {
      if (!teamId) return;
      const repositories = await getRepositories();
      const attempt = async () => {
        const current = await repositories.team.getTeam(teamId);
        if (!current) throw new Error('That team no longer exists.');
        await work(repositories, current);
      };
      try {
        await attempt();
      } catch (error) {
        if (!(error instanceof Error) || !error.name.startsWith('Stale')) throw error;
        await attempt();
      }
    }, 'Could not update the team.');

  const withAssignment = (
    work: (
      repositories: Awaited<ReturnType<typeof getRepositories>>,
      current: AssignmentRecord,
    ) => Promise<unknown>,
    failure = 'Could not update the assignment.',
  ) =>
    run(async () => {
      if (!selectedId) return;
      const repositories = await getRepositories();
      const attempt = async () => {
        const current = await repositories.team.getAssignment(selectedId);
        if (!current) throw new Error('That assignment no longer exists.');
        await work(repositories, current);
      };
      try {
        await attempt();
      } catch (error) {
        if (!(error instanceof Error) || !error.name.startsWith('Stale')) throw error;
        await attempt();
      }
    }, failure);

  const openBoard = (handover: Handover) => {
    if (!handover.pgn || !assignment) return;
    const parsed = parseHandoverPgn(handover.pgn);
    if (!parsed.ok) {
      notify({ tone: 'error', message: 'This handover does not play.', detail: parsed.reason });
      return;
    }
    openDocument({
      tree: parsed.tree,
      document: { kind: 'untitled', title: boardTitle(assignment, handover) },
    });
  };

  const handover = (draft: HandoverDraft) => {
    if (!me) return;
    void withAssignment(async (repositories, current) => {
      const next = await repositories.team.addHandover(current.id, current.revision, {
        ...draft,
        authorId: me.id,
      });
      const written = next.handovers[next.handovers.length - 1];
      notify({
        tone: 'success',
        message:
          draft.kind === 'hand-in'
            ? 'Handed in. Share a packet so the others receive it.'
            : draft.kind === 'review'
              ? draft.verdict === 'accepted'
                ? 'Accepted. Share a packet so they receive it.'
                : 'Returned with notes. Share a packet so they receive it.'
              : 'Note added.',
        ...(written?.evidence && draft.kind !== 'note'
          ? {
              detail: `${plural(written.evidence.evaluated, 'position')} carried an engine evaluation.`,
            }
          : {}),
      });
    }, 'Could not hand over.');
  };

  const share = () =>
    run(async () => {
      if (!teamId) return;
      const saved = await sharePacket(teamId);
      notify({
        tone: 'success',
        message: `Packet saved: ${saved.fileName}`,
        detail: `${plural(assignments.length, 'assignment')} · ${(saved.bytes / 1024).toFixed(1)} kB. Send it to the team however you already share files.`,
      });
    }, 'Could not save the packet.');

  const receive = (file: File) =>
    run(async () => {
      const received = await receivePacket(file);
      notify({ tone: 'success', message: describeReceipt(received) });
      setChosenTeamId(received.teamId);
    }, 'Could not receive the packet.');

  const visible = assignments.filter((entry) => showArchived || !entry.archived);
  const archivedCount = assignments.length - visible.length;
  const grouped = useMemo(() => {
    const groups = new Map<AssignmentColumn, AssignmentRecord[]>(
      COLUMNS.map((column) => [column, []]),
    );
    for (const entry of visible) groups.get(COLUMN_OF[assignmentStatus(entry)])!.push(entry);
    return groups;
  }, [visible]);

  const nameOf = (id: string | undefined) => team?.members.find((member) => member.id === id)?.name;
  const onBoard =
    assignment && documentTitle.startsWith(`${assignment.title} — `) ? documentTitle : null;

  const railContent = teams.isPending ? (
    <p className="px-3 py-3 text-2xs text-tertiary">Reading teams…</p>
  ) : !team ? (
    <EmptyState
      title="No team yet."
      description="Create one, or receive a packet from your coach, your second or your student."
      action={
        <div className="flex flex-col gap-1.5">
          <Button variant="accent" onClick={() => setDialog('new-team')} data-team-new>
            New team
          </Button>
          <Button onClick={() => fileInput.current?.click()}>Receive packet…</Button>
        </div>
      }
    />
  ) : (
    <div className="flex flex-col">
      {(teams.data?.length ?? 0) > 1 ? (
        <label className="flex items-center gap-1.5 border-b border-line-subtle px-3 py-2 text-[10px] text-tertiary">
          Team
          <select
            aria-label="Team"
            value={team.id}
            onChange={(event) => {
              setChosenTeamId(event.target.value);
              setSelectedId(null);
            }}
            className="h-6 min-w-0 flex-1 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary outline-none focus:border-accent/60"
          >
            {teams.data?.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {visible.length === 0 ? (
        <EmptyState
          title="Nothing set yet."
          description={
            me
              ? 'Set an assignment, or receive a packet that carries some.'
              : 'Choose who you are in the team first (Members…).'
          }
          action={
            me ? (
              <Button variant="accent" onClick={() => setDialog('new-assignment')}>
                New assignment
              </Button>
            ) : undefined
          }
        />
      ) : (
        COLUMNS.map((column) => {
          const rows = grouped.get(column) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={column} data-team-column={column}>
              <h3 className="px-3 pb-1 pt-2.5 text-[9.5px] uppercase tracking-wide text-tertiary">
                {COLUMN_LABEL[column]} · {rows.length}
              </h3>
              <ul className="divide-y divide-line-subtle border-b border-line-subtle">
                {rows.map((entry) => {
                  const status = assignmentStatus(entry);
                  const due = describeDue(entry.due);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className={cn(
                          'w-full px-3 py-2 text-left transition-colors hover:bg-surface-2',
                          entry.id === selectedId && 'bg-surface-2',
                          entry.archived && 'opacity-60',
                        )}
                        data-team-assignment={entry.title}
                      >
                        <p className="truncate text-[11.5px] text-primary">{entry.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-tertiary">
                          {entry.assignedTo
                            ? (nameOf(entry.assignedTo) ?? 'someone')
                            : 'whole team'}
                          {' · '}
                          {KIND_LABEL[entry.kind]}
                          {status === 'returned' ? ` · ${STATUS_LABEL[status]}` : ''}
                          {due ? ` · ${due}` : ''}
                          {entry.archived ? ' · archived' : ''}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      {archivedCount > 0 || showArchived ? (
        <button
          type="button"
          className="px-3 py-2 text-left text-[10px] text-tertiary hover:text-secondary"
          onClick={() => setShowArchived((value) => !value)}
        >
          {showArchived ? 'Hide archived' : `Show ${plural(archivedCount, 'archived assignment')}`}
        </button>
      ) : null}
    </div>
  );

  return (
    <WorkspaceFrame
      workspace="team"
      title="Team"
      subtitle={
        team
          ? `${team.name} · ${plural(team.members.length, 'member')}${me ? ` · you are ${me.name} (${ROLE_LABEL[me.role]})` : ' · who are you? (Members…)'}`
          : 'Assignments, hand-ins and reviews, on one board.'
      }
      icon={<TeamIcon />}
      routeActions={[
        {
          id: 'new-assignment',
          label: 'New assignment',
          shortLabel: 'New',
          variant: 'accent',
          disabled: !team || !me,
          title: !team
            ? 'Create a team first.'
            : !me
              ? 'Choose who you are first (Members…).'
              : undefined,
          onClick: () => setDialog('new-assignment'),
        },
        {
          id: 'share',
          label: 'Share packet',
          shortLabel: 'Share',
          disabled: !team || busy,
          onClick: () => void share(),
        },
        {
          id: 'receive',
          label: 'Receive packet…',
          shortLabel: 'Receive',
          disabled: busy,
          onClick: () => fileInput.current?.click(),
        },
        { id: 'members', label: 'Members…', disabled: !team, onClick: () => setDialog('members') },
        { id: 'new-team', label: 'New team', onClick: () => setDialog('new-team') },
      ]}
      rail={{ label: 'Assignments', width: 260, content: railContent }}
      board={{ mode: 'interactive', showEvaluationArtifacts: true }}
      belowBoard={
        onBoard ? (
          <div className="shrink-0 border-t border-line-subtle px-3 py-1.5 text-[10.5px] text-secondary">
            On the board: <span className="text-primary">{onBoard}</span>
          </div>
        ) : undefined
      }
      contextLabel="Thread"
      contextPanel={
        !team ? (
          <EmptyState
            title="No team yet."
            description="A team is the people you hand work to and receive it from. Create one, or receive a packet."
          />
        ) : !assignment ? (
          <EmptyState
            title={me ? 'No assignment selected.' : `Who are you in ${team.name}?`}
            description={
              me
                ? 'Choose one on the left, or set one. Its thread — brief, hand-ins, reviews — appears here.'
                : 'Mark yourself in Members… so your hand-ins and reviews carry your name.'
            }
            action={
              me ? undefined : (
                <Button variant="accent" onClick={() => setDialog('members')}>
                  Members…
                </Button>
              )
            }
          />
        ) : (
          <ThreadPanel
            team={team}
            assignment={assignment}
            busy={busy}
            onOpenBoard={openBoard}
            onHandover={handover}
            onArchive={() =>
              void withAssignment((repositories, current) =>
                repositories.team.updateAssignment(current.id, current.revision, {
                  archived: true,
                }),
              )
            }
          />
        )
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Receive packet"
        data-team-packet-input
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void receive(file);
        }}
      />
      {dialog === 'new-team' ? (
        <NewTeamDialog
          onClose={() => setDialog(null)}
          onCreate={({ name, me: myself }) => {
            setDialog(null);
            void run(async () => {
              const created = await (
                await getRepositories()
              ).team.createTeam({
                name,
                members: [myself],
                meIndex: 0,
              });
              setChosenTeamId(created.id);
              setSelectedId(null);
            }, 'Could not create the team.');
          }}
        />
      ) : null}
      {dialog === 'members' && team ? (
        <MembersDialog
          team={team}
          onClose={() => setDialog(null)}
          onAdd={(member) =>
            void withTeam((repositories, current) =>
              repositories.team.addMember(current.id, current.revision, member),
            )
          }
          onRemove={(memberId) =>
            void withTeam((repositories, current) =>
              repositories.team.removeMember(current.id, current.revision, memberId),
            )
          }
          onChooseMe={(memberId) =>
            void withTeam((repositories, current) =>
              repositories.team.updateTeam(current.id, current.revision, { me: memberId }),
            )
          }
          onRename={(name) =>
            void withTeam((repositories, current) =>
              repositories.team.updateTeam(current.id, current.revision, { name }),
            )
          }
          onDelete={async () => {
            const id = team.id;
            await (await getRepositories()).team.deleteTeam(id);
            setChosenTeamId(null);
            setSelectedId(null);
            invalidateTeams(client);
          }}
        />
      ) : null}
      {dialog === 'new-assignment' && team && me ? (
        <NewAssignmentDialog
          team={team}
          onClose={() => setDialog(null)}
          onCreate={(input) => {
            setDialog(null);
            void run(async () => {
              const created = await (
                await getRepositories()
              ).team.createAssignment({
                ...input,
                teamId: team.id,
                setBy: me.id,
              });
              setSelectedId(created.id);
            }, 'Could not set the assignment.');
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}

/** "Round 3 game — Ana's hand-in, 19 Sep": the header while that board is open. */
function boardTitle(assignment: AssignmentRecord, handover: Handover): string {
  const what =
    handover.kind === 'hand-in'
      ? 'hand-in'
      : handover.kind === 'review'
        ? handover.verdict === 'accepted'
          ? 'accepted board'
          : 'notes'
        : 'board';
  return `${assignment.title} — ${handover.authorName}’s ${what}, ${shortDate(handover.at)}`;
}
