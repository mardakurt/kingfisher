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

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Panel';
import { Team as TeamIcon } from '@/components/icons';
import { useEngineSnapshots } from '@/features/analysis/useEngineSnapshots';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { cn } from '@/lib/cn';
import { assignmentInbox, type InboxView } from '@/team/inbox';
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
  threadOrder,
  type AssignmentColumn,
} from '@/team';

import { MembersDialog, NewAssignmentDialog, NewTeamDialog } from './dialogs';
import { describeDue, KIND_LABEL, ROLE_LABEL, shortDate } from './labels';
import { describeReceipt, receivePacket, sharePacket } from './packet-io';
import { markSeen, readSeen, readSelection, rememberSelection } from './local-state';
import { invalidateTeams, useAssignments, useTeam, useTeams } from './queries';
import { WhoAmI } from './WhoAmI';
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
  const remembered = useMemo(() => readSelection(), []);
  const [chosenTeamId, setChosenTeamId] = useState<string | null>(remembered.teamId ?? null);
  /* A link into the hub (`?team=…&assignment=…`, a position-search hit) picks
     the thread it names; applied once per change, then the person's own
     choices take over. */
  const params = useSearchParams();
  const paramTeam = params.get('team');
  const paramAssignment = params.get('assignment');
  const paramHandover = params.get('handover');
  const paramPly = params.get('ply');
  const [seenParams, setSeenParams] = useState<string | null>(null);
  // A chosen team that was deleted, or one a packet has not created yet, falls back to the first.
  const chosenExists = Boolean(
    chosenTeamId && teams.data?.some((entry) => entry.id === chosenTeamId),
  );
  const teamId = (chosenExists ? chosenTeamId : null) ?? teams.data?.[0]?.id ?? null;
  const team = useTeam(teamId).data ?? null;
  const assignments = useAssignments(teamId).data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(
    (remembered.teamId && remembered.assignmentByTeam?.[remembered.teamId]) ?? null,
  );
  const paramsKey = `${paramTeam ?? ''}|${paramAssignment ?? ''}`;
  if (seenParams !== paramsKey) {
    setSeenParams(paramsKey);
    if (paramTeam) setChosenTeamId(paramTeam);
    if (paramAssignment) setSelectedId(paramAssignment);
  }
  const assignment = assignments.find((entry) => entry.id === selectedId) ?? null;
  const [seen, setSeen] = useState<Readonly<Record<string, number>>>(() => readSeen());
  const [replaceWith, setReplaceWith] = useState<Handover | null>(null);
  const [dropping, setDropping] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [inboxView, setInboxView] = useState<InboxView>('all');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const me = team?.members.find((member) => member.id === team.me) ?? null;

  useEffect(() => {
    rememberSelection(teamId, selectedId);
  }, [teamId, selectedId]);

  /*
   * A position hit from the position page carries ?handover=&ply= — the hand-in
   * to open and the matched ply inside it. Without this effect, the position
   * hit would arrive at the assignment's thread and the board would stay on
   * whatever it was last; the player has to know which thread holds the
   * matched position and click it manually, which defeats the un-silo.
   * The ply is read once per (handover, ply) pair; revisiting the route with
   * the same params leaves the board alone.
   */
  const openHandover = useCallback(
    (handover: Handover) => {
      if (!handover.pgn || !assignment) return;
      const parsed = parseHandoverPgn(handover.pgn);
      if (!parsed.ok) {
        notify({
          tone: 'error',
          message: 'This handover does not play.',
          detail: parsed.reason,
        });
        return;
      }
      openDocument({
        tree: parsed.tree,
        document: { kind: 'untitled', title: boardTitle(assignment, handover) },
      });
    },
    [assignment, notify, openDocument],
  );
  const appliedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!paramHandover || !assignment || !paramPly) return;
    const key = `${assignment.id}|${paramHandover}|${paramPly}`;
    if (appliedDeepLink.current === key) return;
    const handover = assignment.handovers.find((entry) => entry.id === paramHandover);
    if (!handover) return;
    const ply = Number(paramPly);
    if (!Number.isFinite(ply)) return;
    const parsed = handover.pgn ? parseHandoverPgn(handover.pgn) : null;
    if (!parsed?.ok) return;
    appliedDeepLink.current = key;
    openHandover(handover);
    const node = Object.values(parsed.tree.nodes).find((entry) => entry.ply === ply);
    if (node) useAnalysis.getState().goTo(node.id);
  }, [assignment, openHandover, paramHandover, paramPly]);

  const select = (id: string) => {
    setSelectedId(id);
    setSeen(markSeen(id));
  };

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
      return true;
    } catch (error) {
      fail(failure, error);
      return false;
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

  const clearFilters = () => {
    setAssignee('');
    setSearch('');
    setInboxView('all');
  };

  const chooseMe = (memberId: string) => {
    setInboxView('all');
    void withTeam((repositories, current) =>
      repositories.team.updateTeam(current.id, current.revision, { me: memberId }),
    );
  };

  /**
   * A board from the thread replaces what is on the board. When that is
   * somebody's unsaved analysis — moves, and not a board this route opened —
   * the person is asked first; a hand-in that was about to be made is not a
   * thing to lose to a misclick on "Open on board".
   */
  const openBoard = (handover: Handover) => {
    const state = useAnalysis.getState();
    const hasMoves = (state.tree.nodes[state.tree.rootId]?.children.length ?? 0) > 0;
    const isOurs = assignment ? state.document.title.startsWith(`${assignment.title} — `) : false;
    if (hasMoves && !isOurs && state.document.kind === 'untitled') {
      setReplaceWith(handover);
      return;
    }
    loadBoard(handover);
  };

  const loadBoard = (handover: Handover) => {
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
    if (!me) return Promise.resolve(false);
    return withAssignment(async (repositories, current) => {
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
      if (received.teamId !== teamId) {
        setSelectedId(null);
        clearFilters();
      }
    }, 'Could not receive the packet.');

  /** A packet dropped anywhere on the route is received; anything else is left to the shell. */
  const isPacketFile = (file: File) => /\.json$/i.test(file.name);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const file = [...(event.dataTransfer?.files ?? [])].find(isPacketFile);
    setDropping(false);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void receive(file);
  };

  /** New since this device last opened the thread: a handover by somebody else, later than that. */
  const isNew = (entry: AssignmentRecord) => {
    const last = threadOrder(entry.handovers).at(-1);
    if (!last || last.authorId === me?.id) return false;
    return last.at > (seen[entry.id] ?? 0);
  };

  // A packet can replace the roster under a chosen view: a `me` who is no
  // longer a reviewer must not be left on a filter whose option is gone.
  const view: InboxView =
    inboxView === 'review' && !(me?.role === 'coach' || me?.role === 'player') ? 'all' : inboxView;
  const visible = assignmentInbox(assignments, {
    view,
    member: me,
    assignee,
    query: search,
    showArchived,
  });
  const archivedCount = assignments.filter((entry) => entry.archived).length;
  const filtered = Boolean(search.trim() || assignee || view !== 'all');
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
        <div className="flex w-full flex-col items-center gap-1.5">
          <Button
            variant="accent"
            onClick={() => setDialog('new-team')}
            data-team-new
            className="w-full max-w-[200px]"
          >
            New team
          </Button>
          <Button
            onClick={() => fileInput.current?.click()}
            className="w-full max-w-[200px]"
          >
            Receive packet…
          </Button>
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
              clearFilters();
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
      <div className="space-y-2 border-b border-line-subtle px-3 py-2.5">
        <label className="block text-[10.5px] text-secondary">
          Find work
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title, opponent or brief"
            className="mt-1 h-8 w-full rounded border border-line bg-surface-inset px-2 text-xs text-primary focus:border-accent"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10.5px] text-secondary">
            View
            <select
              aria-label="Assignment view"
              value={view}
              onChange={(event) => setInboxView(event.target.value as InboxView)}
              className="mt-1 h-8 w-full rounded border border-line bg-surface-inset px-1 text-[11px] text-primary"
            >
              <option value="all">All work</option>
              {me?.role === 'coach' || me?.role === 'player' ? (
                <option value="review">To review</option>
              ) : null}
              <option value="mine">Assigned to me</option>
            </select>
          </label>
          <label className="text-[10.5px] text-secondary">
            Assigned to
            <select
              aria-label="Filter by member"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="mt-1 h-8 w-full rounded border border-line bg-surface-inset px-1 text-[11px] text-primary"
            >
              <option value="">Everyone</option>
              {team.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[10px] text-secondary" role="status">
          {visible.length} shown · earliest due first
        </p>
        <details className="text-[10px] text-secondary">
          <summary className="cursor-pointer">How sharing works</summary>
          <p className="mt-1 leading-relaxed">
            Share packet exports every assignment and the roster, including archived work. Filters
            do not limit sharing. Use separate teams for confidential preparation or individual
            students. Send and receive files to exchange updates.
          </p>
        </details>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matching assignments.' : 'Nothing set yet.'}
          description={
            filtered
              ? 'Change the view, member or search to find other work.'
              : me
                ? 'Set an assignment, or receive a packet that carries some.'
                : 'Choose who you are in the team first (Members…).'
          }
          action={
            filtered ? (
              <Button
                onClick={() => {
                  setSearch('');
                  setAssignee('');
                  setInboxView('all');
                }}
              >
                Clear filters
              </Button>
            ) : me ? (
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
          const fresh = rows.filter(isNew).length;
          return (
            <section key={column} data-team-column={column}>
              <h3 className="px-3 pb-1 pt-2.5 text-[9.5px] uppercase tracking-wide text-tertiary">
                {COLUMN_LABEL[column]} · {rows.length}
                {fresh > 0 ? <span className="text-accent"> · {fresh} new</span> : null}
              </h3>
              <ul className="divide-y divide-line-subtle border-b border-line-subtle">
                {rows.map((entry) => {
                  const status = assignmentStatus(entry);
                  const due = describeDue(entry.due);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => select(entry.id)}
                        className={cn(
                          'w-full px-3 py-2 text-left transition-colors hover:bg-surface-2',
                          entry.id === selectedId && 'bg-surface-2',
                          entry.archived && 'opacity-60',
                        )}
                        data-team-assignment={entry.title}
                        {...(isNew(entry) ? { 'data-team-new': '' } : {})}
                      >
                        <p className="flex items-center gap-1.5 truncate text-[11.5px] text-primary">
                          {isNew(entry) ? (
                            <span
                              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                              aria-label="New since you last looked"
                            />
                          ) : null}
                          <span className="truncate">{entry.title}</span>
                        </p>
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
    <div
      className="contents"
      onDragOver={(event) => {
        if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) {
          event.preventDefault();
          if (!dropping) setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      data-team-drop
    >
      <WorkspaceFrame
        workspace="team"
        title="Team"
        subtitle={
          team
            ? me
              ? `${team.name} · you are ${me.name} (${ROLE_LABEL[me.role]})`
              : `${team.name} · ${plural(team.members.length, 'member')} · who are you?`
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
          {
            id: 'members',
            label: 'Members…',
            disabled: !team,
            onClick: () => setDialog('members'),
          },
          { id: 'new-team', label: 'New team', onClick: () => setDialog('new-team') },
        ]}
        banner={
          dropping ? (
            <div className="border-b border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] text-accent">
              Drop the packet to receive it.
            </div>
          ) : undefined
        }
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
          ) : !me ? (
            <div className="px-3 py-3">
              <WhoAmI team={team} onChoose={chooseMe} busy={busy} />
            </div>
          ) : !assignment ? (
            <EmptyState
              title="No assignment selected."
              description="Choose one on the left, or set one. Its thread — brief, hand-ins, reviews — appears here."
            />
          ) : (
            <ThreadPanel
              team={team}
              assignment={assignment}
              note={notes[assignment.id] ?? ''}
              onNoteChange={(note) =>
                setNotes((current) => ({ ...current, [assignment.id]: note }))
              }
              busy={busy}
              onOpenBoard={openBoard}
              onHandover={handover}
              onChooseMe={chooseMe}
              onArchive={(archived) =>
                void withAssignment((repositories, current) =>
                  repositories.team.updateAssignment(current.id, current.revision, { archived }),
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
                clearFilters();
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
            onChooseMe={chooseMe}
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
                clearFilters();
              }, 'Could not set the assignment.');
            }}
          />
        ) : null}
        <ConfirmDialog
          open={replaceWith !== null}
          title="Replace what is on the board?"
          description="The board holds moves that were not opened from this thread. Opening this handover replaces them; hand them in or save them to a study first if they matter."
          confirmLabel="Replace"
          danger={false}
          onConfirm={() => {
            if (replaceWith) loadBoard(replaceWith);
            setReplaceWith(null);
          }}
          onCancel={() => setReplaceWith(null)}
        />
      </WorkspaceFrame>
    </div>
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
