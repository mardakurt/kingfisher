/**
 * Teams and their assignments.
 *
 * Two stores, one shape of write: read the record inside the transaction,
 * refuse it if its revision moved, put the next one. A handover is the one
 * thing that is appended rather than edited, and the one thing whose content
 * is checked before it is written — its PGN is replayed through the rules —
 * because a thread is shared as a file and the file must never carry a board
 * Kingfisher cannot play.
 */

import { stableId } from '../ids';
import type { PersistenceDatabase } from '../indexeddb/database';
import { STORE_NAMES } from '../schema/migrations';
import type {
  AssignmentKind,
  AssignmentRecord,
  Handover,
  HandoverEvidence,
  HandoverKind,
  ReviewVerdict,
  TeamMember,
  TeamRecord,
  TeamRole,
} from '../domain';
import { StaleAssignmentWriteError, StaleTeamWriteError } from '../domain';
import { parseHandoverPgn } from '../handover-pgn';
import { assertValid, isAssignmentRecord, isTeamRecord } from '../validation';

export interface CreateTeamInput {
  readonly name: string;
  readonly members?: readonly MemberInput[];
  /** Index into `members` of the person creating the team, when they are one of them. */
  readonly meIndex?: number;
}

export interface MemberInput {
  readonly name: string;
  readonly role: TeamRole;
  readonly lichessUsername?: string;
}

export interface CreateAssignmentInput {
  readonly teamId: string;
  readonly title: string;
  readonly kind: AssignmentKind;
  readonly brief: string;
  readonly setBy: string;
  readonly assignedTo?: string;
  readonly due?: string;
}

export interface HandoverInput {
  readonly kind: HandoverKind;
  readonly authorId: string;
  readonly note: string;
  readonly pgn?: string;
  readonly verdict?: ReviewVerdict;
  readonly evidence?: HandoverEvidence;
}

export interface TeamRepository {
  listTeams(): Promise<readonly TeamRecord[]>;
  getTeam(id: string): Promise<TeamRecord | null>;
  createTeam(input: CreateTeamInput, now?: number): Promise<TeamRecord>;
  updateTeam(
    id: string,
    expectedRevision: number,
    change: { readonly name?: string; readonly me?: string | null },
  ): Promise<TeamRecord>;
  addMember(id: string, expectedRevision: number, member: MemberInput): Promise<TeamRecord>;
  updateMember(
    id: string,
    expectedRevision: number,
    memberId: string,
    change: Partial<MemberInput>,
  ): Promise<TeamRecord>;
  removeMember(id: string, expectedRevision: number, memberId: string): Promise<TeamRecord>;
  /** The team and every assignment in it. Local only: a packet that still holds them brings them back. */
  deleteTeam(id: string): Promise<void>;

  listAssignments(teamId: string): Promise<readonly AssignmentRecord[]>;
  getAssignment(id: string): Promise<AssignmentRecord | null>;
  createAssignment(input: CreateAssignmentInput, now?: number): Promise<AssignmentRecord>;
  updateAssignment(
    id: string,
    expectedRevision: number,
    change: Partial<Omit<CreateAssignmentInput, 'teamId' | 'setBy'>> & {
      readonly archived?: boolean;
    },
  ): Promise<AssignmentRecord>;
  addHandover(
    id: string,
    expectedRevision: number,
    input: HandoverInput,
    now?: number,
  ): Promise<AssignmentRecord>;
  /**
   * Write a merged team and its changed assignments in one transaction.
   *
   * The merge itself is pure (`@/team`); this is its commit. Every record's
   * revision is checked against the store, so a merge computed against a
   * copy another tab has since changed is refused whole and can be recomputed.
   */
  applyMerge(
    team: TeamRecord,
    assignments: readonly AssignmentRecord[],
    now?: number,
  ): Promise<void>;
}

export class LocalTeamRepository implements TeamRepository {
  constructor(private readonly database: PersistenceDatabase) {}

  async listTeams(): Promise<readonly TeamRecord[]> {
    const rows = await this.database.getAll<unknown>(STORE_NAMES.teams);
    return rows
      .map((row) => assertValid(row, isTeamRecord, 'team'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getTeam(id: string): Promise<TeamRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.teams, id);
    return raw === undefined ? null : assertValid(raw, isTeamRecord, 'team');
  }

  async createTeam(input: CreateTeamInput, now = Date.now()): Promise<TeamRecord> {
    const name = input.name.trim();
    if (!name) throw new Error('A team needs a name.');
    const members = (input.members ?? []).map((member) => newMember(member));
    const me = input.meIndex !== undefined ? members[input.meIndex]?.id : undefined;
    const record: TeamRecord = {
      id: stableId('team'),
      name,
      members,
      ...(me ? { me } : {}),
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.put(STORE_NAMES.teams, record);
    return record;
  }

  updateTeam(
    id: string,
    expectedRevision: number,
    change: { readonly name?: string; readonly me?: string | null },
  ): Promise<TeamRecord> {
    return this.writeTeam(id, expectedRevision, (current) => {
      const { me: _me, ...rest } = current;
      const me = change.me === undefined ? current.me : change.me;
      if (me && !current.members.some((member) => member.id === me)) {
        throw new Error('That person is not in this team.');
      }
      return {
        ...rest,
        ...(change.name !== undefined ? { name: change.name.trim() || current.name } : {}),
        ...(me ? { me } : {}),
      };
    });
  }

  addMember(id: string, expectedRevision: number, member: MemberInput): Promise<TeamRecord> {
    return this.writeTeam(id, expectedRevision, (current) => ({
      ...current,
      members: [...current.members, newMember(member)],
    }));
  }

  updateMember(
    id: string,
    expectedRevision: number,
    memberId: string,
    change: Partial<MemberInput>,
  ): Promise<TeamRecord> {
    return this.writeTeam(id, expectedRevision, (current) => ({
      ...current,
      members: current.members.map((member) =>
        member.id === memberId ? newMember({ ...member, ...change }, member.id) : member,
      ),
    }));
  }

  removeMember(id: string, expectedRevision: number, memberId: string): Promise<TeamRecord> {
    return this.writeTeam(id, expectedRevision, (current) => {
      const { me, ...rest } = current;
      return {
        ...rest,
        members: current.members.filter((member) => member.id !== memberId),
        ...(me && me !== memberId ? { me } : {}),
      };
    });
  }

  async deleteTeam(id: string): Promise<void> {
    await this.database.transaction(
      [STORE_NAMES.teams, STORE_NAMES.assignments],
      'readwrite',
      async (transaction) => {
        const rows = await transaction.getAllFromIndex<unknown>(
          STORE_NAMES.assignments,
          'teamId',
          id,
        );
        for (const row of rows) {
          const assignment = assertValid(row, isAssignmentRecord, 'assignment');
          await transaction.delete(STORE_NAMES.assignments, assignment.id);
        }
        await transaction.delete(STORE_NAMES.teams, id);
      },
    );
  }

  async listAssignments(teamId: string): Promise<readonly AssignmentRecord[]> {
    const rows = await this.database.getAllFromIndex<unknown>(
      STORE_NAMES.assignments,
      'teamId',
      teamId,
    );
    return rows
      .map((row) => assertValid(row, isAssignmentRecord, 'assignment'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getAssignment(id: string): Promise<AssignmentRecord | null> {
    const raw = await this.database.get<unknown>(STORE_NAMES.assignments, id);
    return raw === undefined ? null : assertValid(raw, isAssignmentRecord, 'assignment');
  }

  async createAssignment(
    input: CreateAssignmentInput,
    now = Date.now(),
  ): Promise<AssignmentRecord> {
    const title = input.title.trim();
    if (!title) throw new Error('An assignment needs a title.');
    const team = await this.getTeam(input.teamId);
    if (!team) throw new Error('That team no longer exists.');
    if (!team.members.some((member) => member.id === input.setBy)) {
      throw new Error('Choose who you are in this team before setting work.');
    }
    const record: AssignmentRecord = {
      id: stableId('asg'),
      teamId: input.teamId,
      title,
      kind: input.kind,
      brief: input.brief.trim(),
      setBy: input.setBy,
      ...optional('assignedTo', input.assignedTo),
      ...optional('due', input.due),
      handovers: [],
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    await this.database.put(STORE_NAMES.assignments, record);
    return record;
  }

  updateAssignment(
    id: string,
    expectedRevision: number,
    change: Partial<Omit<CreateAssignmentInput, 'teamId' | 'setBy'>> & {
      readonly archived?: boolean;
    },
  ): Promise<AssignmentRecord> {
    return this.writeAssignment(id, expectedRevision, (current) => {
      const { assignedTo: _a, due: _d, archived: _x, ...rest } = current;
      const assignedTo = change.assignedTo === undefined ? current.assignedTo : change.assignedTo;
      const due = change.due === undefined ? current.due : change.due;
      const archived = change.archived === undefined ? current.archived : change.archived;
      return {
        ...rest,
        ...(change.title !== undefined ? { title: change.title.trim() || current.title } : {}),
        ...(change.kind !== undefined ? { kind: change.kind } : {}),
        ...(change.brief !== undefined ? { brief: change.brief.trim() } : {}),
        ...optional('assignedTo', assignedTo),
        ...optional('due', due),
        ...(archived ? { archived: true } : {}),
      };
    });
  }

  async addHandover(
    id: string,
    expectedRevision: number,
    input: HandoverInput,
    now = Date.now(),
  ): Promise<AssignmentRecord> {
    // Rejections, not throws: an async-shaped method that throws synchronously
    // escapes every `.catch` its callers wrote (Phase 73, the IDB wrapper).
    if (input.kind === 'review' && !input.verdict) {
      throw new Error('A review needs a verdict.');
    }
    if (input.kind === 'hand-in' && input.pgn === undefined) {
      throw new Error('A hand-in carries the board.');
    }
    if (input.pgn !== undefined) {
      const parsed = parseHandoverPgn(input.pgn);
      if (!parsed.ok) throw new Error(`The board does not play: ${parsed.reason}`);
    }
    return this.database.transaction(
      [STORE_NAMES.teams, STORE_NAMES.assignments],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.assignments, id);
        if (raw === undefined) throw new Error('That assignment no longer exists.');
        const current = assertValid(raw, isAssignmentRecord, 'assignment');
        if (current.revision !== expectedRevision) {
          throw new StaleAssignmentWriteError(current, expectedRevision);
        }
        const teamRaw = await transaction.get<unknown>(STORE_NAMES.teams, current.teamId);
        const team = teamRaw === undefined ? null : assertValid(teamRaw, isTeamRecord, 'team');
        const author = team?.members.find((member) => member.id === input.authorId);
        if (!author) throw new Error('Choose who you are in this team before handing over.');
        const handover: Handover = {
          id: stableId('ho'),
          kind: input.kind,
          authorId: author.id,
          authorName: author.name,
          at: now,
          note: input.note.trim(),
          ...optional('pgn', input.pgn),
          ...(input.kind === 'review' && input.verdict ? { verdict: input.verdict } : {}),
          ...(input.evidence ? { evidence: input.evidence } : {}),
        };
        const next: AssignmentRecord = {
          ...current,
          handovers: [...current.handovers, handover],
          updatedAt: now,
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.assignments, next);
        return next;
      },
    );
  }

  applyMerge(
    team: TeamRecord,
    assignments: readonly AssignmentRecord[],
    now = Date.now(),
  ): Promise<void> {
    return this.database.transaction(
      [STORE_NAMES.teams, STORE_NAMES.assignments],
      'readwrite',
      async (transaction) => {
        const teamRaw = await transaction.get<unknown>(STORE_NAMES.teams, team.id);
        if (teamRaw !== undefined) {
          const stored = assertValid(teamRaw, isTeamRecord, 'team');
          if (stored.revision !== team.revision)
            throw new StaleTeamWriteError(stored, team.revision);
        }
        await transaction.put(STORE_NAMES.teams, {
          ...team,
          updatedAt: Math.max(team.updatedAt, now),
          revision: team.revision + 1,
        });
        for (const assignment of assignments) {
          if (assignment.teamId !== team.id) {
            throw new Error('A merged assignment belongs to a different team.');
          }
          const raw = await transaction.get<unknown>(STORE_NAMES.assignments, assignment.id);
          if (raw !== undefined) {
            const stored = assertValid(raw, isAssignmentRecord, 'assignment');
            if (stored.revision !== assignment.revision) {
              throw new StaleAssignmentWriteError(stored, assignment.revision);
            }
          }
          await transaction.put(STORE_NAMES.assignments, {
            ...assignment,
            revision: assignment.revision + 1,
          });
        }
      },
    );
  }

  private writeTeam(
    id: string,
    expectedRevision: number,
    change: (current: TeamRecord) => TeamRecord,
  ): Promise<TeamRecord> {
    return this.database.transaction([STORE_NAMES.teams], 'readwrite', async (transaction) => {
      const raw = await transaction.get<unknown>(STORE_NAMES.teams, id);
      if (raw === undefined) throw new Error('That team no longer exists.');
      const current = assertValid(raw, isTeamRecord, 'team');
      if (current.revision !== expectedRevision) {
        throw new StaleTeamWriteError(current, expectedRevision);
      }
      const next: TeamRecord = {
        ...change(current),
        updatedAt: Date.now(),
        revision: current.revision + 1,
      };
      await transaction.put(STORE_NAMES.teams, next);
      return next;
    });
  }

  private writeAssignment(
    id: string,
    expectedRevision: number,
    change: (current: AssignmentRecord) => AssignmentRecord,
  ): Promise<AssignmentRecord> {
    return this.database.transaction(
      [STORE_NAMES.assignments],
      'readwrite',
      async (transaction) => {
        const raw = await transaction.get<unknown>(STORE_NAMES.assignments, id);
        if (raw === undefined) throw new Error('That assignment no longer exists.');
        const current = assertValid(raw, isAssignmentRecord, 'assignment');
        if (current.revision !== expectedRevision) {
          throw new StaleAssignmentWriteError(current, expectedRevision);
        }
        const next: AssignmentRecord = {
          ...change(current),
          updatedAt: Date.now(),
          revision: current.revision + 1,
        };
        await transaction.put(STORE_NAMES.assignments, next);
        return next;
      },
    );
  }
}

function newMember(input: MemberInput, id = stableId('mem')): TeamMember {
  const name = input.name.trim();
  if (!name) throw new Error('A member needs a name.');
  return {
    id,
    name,
    role: input.role,
    ...optional('lichessUsername', input.lichessUsername?.trim()),
  };
}

const optional = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined || value === '' ? {} : ({ [key]: value } as Record<K, V>);
