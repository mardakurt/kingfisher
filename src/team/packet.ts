/**
 * The packet: a team and its work, as a file.
 *
 * Kingfisher has no server, so a team travels the way a second's file always
 * has — handed over, by whatever channel the people already use. The packet
 * is what makes that safe to do repeatedly in both directions:
 *
 *  - every handover is written once and identified by id, so two copies of an
 *    assignment merge by **union** of their threads; nothing is ever in
 *    conflict, only missing from one side;
 *  - the assignment as set (title, brief, assignee, due, archived) is the one
 *    part two people could both edit, and there the **newer copy wins**, by
 *    `updatedAt`, which is deterministic on both machines;
 *  - the team's roster merges the same way; `me` never travels — which
 *    member an installation is, is a fact about that installation;
 *  - every board in the packet must **parse through Kingfisher's own rules**
 *    before anything is written, so a packet cannot hand the board a game it
 *    cannot play, and a malformed packet is refused whole rather than half
 *    applied.
 *
 * A later transport that moves packets automatically — a server, a shared
 * folder — needs nothing here to change; that is the point of building the
 * merge first.
 */

import type { AssignmentRecord, Handover, TeamMember, TeamRecord } from '@/persistence/domain';
import { parseHandoverPgn } from '@/persistence/handover-pgn';
import { isAssignmentRecord, isTeamRecord } from '@/persistence/validation';

export { parseHandoverPgn };

export const PACKET_FORMAT = 'kingfisher-team-packet';
export const PACKET_VERSION = 1;
export const PACKET_EXTENSION = '.kingfisher-team.json';

export type PacketTeam = Omit<TeamRecord, 'me' | 'revision'>;
export type PacketAssignment = Omit<AssignmentRecord, 'revision'>;

export interface TeamPacket {
  readonly format: typeof PACKET_FORMAT;
  readonly version: typeof PACKET_VERSION;
  readonly exportedAt: number;
  /** Who shared it, for the receiving side's "from" line. Absent when `me` was never chosen. */
  readonly exportedBy?: TeamMember;
  readonly team: PacketTeam;
  readonly assignments: readonly PacketAssignment[];
}

export function buildPacket(
  team: TeamRecord,
  assignments: readonly AssignmentRecord[],
  now = Date.now(),
): TeamPacket {
  const { me, revision: _revision, ...shared } = team;
  const exportedBy = team.members.find((member) => member.id === me);
  return {
    format: PACKET_FORMAT,
    version: PACKET_VERSION,
    exportedAt: now,
    ...(exportedBy ? { exportedBy } : {}),
    team: shared,
    assignments: assignments
      .filter((assignment) => assignment.teamId === team.id)
      .map(({ revision: _r, ...assignment }) => assignment),
  };
}

/** `Academy-2026-09-20.kingfisher-team.json`: the team, the day, the format. */
export function packetFileName(team: Pick<TeamRecord, 'name'>, now = Date.now()): string {
  const slug =
    team.name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'team';
  return `${slug}-${new Date(now).toISOString().slice(0, 10)}${PACKET_EXTENSION}`;
}

export type ParsedPacket =
  | { readonly ok: true; readonly packet: TeamPacket }
  | { readonly ok: false; readonly reason: string };

/**
 * Read a packet from parsed JSON, refusing anything that is not exactly one.
 *
 * Every record is checked with the same validators the database applies on
 * the way out, and every PGN is replayed. The reason names what was wrong,
 * because "invalid packet" sent back to a teammate is a question, and
 * "handover h-3 in ‘Round 3 game’ does not parse: illegal move 14…Nxe4" is
 * an answer.
 */
export function parsePacket(value: unknown): ParsedPacket {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return refuse('This file is not a Kingfisher team packet.');
  }
  const raw = value as Record<string, unknown>;
  if (raw.format !== PACKET_FORMAT) return refuse('This file is not a Kingfisher team packet.');
  if (raw.version !== PACKET_VERSION) {
    return refuse(
      `This packet is version ${String(raw.version)}; this Kingfisher reads version ${PACKET_VERSION}.`,
    );
  }
  if (typeof raw.exportedAt !== 'number' || !Number.isFinite(raw.exportedAt)) {
    return refuse('The packet has no export time.');
  }
  const team = raw.team;
  if (!isTeamRecord({ ...(team as object), revision: 0 })) {
    return refuse('The packet’s team record is malformed.');
  }
  const { me: _me, ...sharedTeam } = team as TeamRecord;
  if (!Array.isArray(raw.assignments)) return refuse('The packet has no assignment list.');
  const assignments: PacketAssignment[] = [];
  for (const entry of raw.assignments) {
    if (!isAssignmentRecord({ ...(entry as object), revision: 0 })) {
      return refuse('An assignment in the packet is malformed.');
    }
    const assignment = entry as AssignmentRecord;
    if (assignment.teamId !== sharedTeam.id) {
      return refuse(`Assignment “${assignment.title}” belongs to a different team.`);
    }
    for (const handover of assignment.handovers) {
      if (handover.pgn === undefined) continue;
      const parsed = parseHandoverPgn(handover.pgn);
      if (!parsed.ok) {
        return refuse(`A board in “${assignment.title}” does not play: ${parsed.reason}`);
      }
    }
    const { revision: _r, ...shared } = assignment;
    assignments.push(shared);
  }
  const exportedBy = raw.exportedBy;
  return {
    ok: true,
    packet: {
      format: PACKET_FORMAT,
      version: PACKET_VERSION,
      exportedAt: raw.exportedAt,
      ...(isMember(exportedBy) ? { exportedBy } : {}),
      team: sharedTeam,
      assignments,
    },
  };
}

const refuse = (reason: string): ParsedPacket => ({ ok: false, reason });

const isMember = (value: unknown): value is TeamMember =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as TeamMember).id === 'string' &&
  typeof (value as TeamMember).name === 'string';

export interface MergeSummary {
  readonly teamCreated: boolean;
  readonly newMembers: number;
  readonly newAssignments: number;
  readonly updatedAssignments: number;
  readonly newHandovers: number;
}

export interface MergeResult {
  readonly team: TeamRecord;
  /** Every assignment that changed or is new; unchanged ones are omitted. */
  readonly assignments: readonly AssignmentRecord[];
  readonly summary: MergeSummary;
}

/**
 * Fold a packet into what this installation already holds.
 *
 * Pure: the caller writes the result. `revision`s are carried from the local
 * records so the repository's stale-write check still applies to the merge
 * itself, and `me` is carried untouched.
 */
export function mergePacket(
  local: { readonly team: TeamRecord | null; readonly assignments: readonly AssignmentRecord[] },
  packet: TeamPacket,
  now = Date.now(),
): MergeResult {
  const team = mergeTeam(local.team, packet.team, now);
  const byId = new Map(local.assignments.map((assignment) => [assignment.id, assignment]));
  const changed: AssignmentRecord[] = [];
  let newAssignments = 0;
  let updatedAssignments = 0;
  let newHandovers = 0;
  for (const incoming of packet.assignments) {
    const existing = byId.get(incoming.id) ?? null;
    const merged = mergeAssignment(existing, incoming);
    if (!existing) {
      newAssignments += 1;
      newHandovers += merged.handovers.length;
      changed.push(merged);
      continue;
    }
    const added = merged.handovers.length - existing.handovers.length;
    if (added === 0 && sameAsSet(existing, merged)) continue;
    updatedAssignments += 1;
    newHandovers += added;
    changed.push(merged);
  }
  return {
    team,
    assignments: changed,
    summary: {
      teamCreated: local.team === null,
      newMembers: team.members.length - (local.team?.members.length ?? 0),
      newAssignments,
      updatedAssignments,
      newHandovers,
    },
  };
}

export function mergeTeam(local: TeamRecord | null, incoming: PacketTeam, now: number): TeamRecord {
  if (!local) return { ...incoming, createdAt: incoming.createdAt, updatedAt: now, revision: 0 };
  const incomingNewer = incoming.updatedAt > local.updatedAt;
  const members = new Map<string, TeamMember>();
  // Union by id; where both know a member, the newer roster describes them.
  for (const member of incomingNewer ? local.members : incoming.members)
    members.set(member.id, member);
  for (const member of incomingNewer ? incoming.members : local.members)
    members.set(member.id, member);
  return {
    ...local,
    name: incomingNewer ? incoming.name : local.name,
    members: [...members.values()],
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
  };
}

export function mergeAssignment(
  local: AssignmentRecord | null,
  incoming: PacketAssignment,
): AssignmentRecord {
  if (!local) {
    return { ...incoming, handovers: unionHandovers([], incoming.handovers), revision: 0 };
  }
  const newer = incoming.updatedAt > local.updatedAt ? incoming : local;
  return {
    ...local,
    title: newer.title,
    kind: newer.kind,
    brief: newer.brief,
    setBy: newer.setBy,
    ...(newer.assignedTo !== undefined ? { assignedTo: newer.assignedTo } : {}),
    ...(newer.due !== undefined ? { due: newer.due } : {}),
    ...(newer.archived !== undefined ? { archived: newer.archived } : {}),
    handovers: unionHandovers(local.handovers, incoming.handovers),
    createdAt: Math.min(local.createdAt, incoming.createdAt),
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
  };
}

function unionHandovers(a: readonly Handover[], b: readonly Handover[]): readonly Handover[] {
  const byId = new Map<string, Handover>();
  for (const handover of a) byId.set(handover.id, handover);
  // A handover is written once; the copy already held is the one kept.
  for (const handover of b) if (!byId.has(handover.id)) byId.set(handover.id, handover);
  return [...byId.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
}

const AS_SET: readonly (keyof AssignmentRecord)[] = [
  'title',
  'kind',
  'brief',
  'setBy',
  'assignedTo',
  'due',
  'archived',
];

function sameAsSet(a: AssignmentRecord, b: AssignmentRecord): boolean {
  return AS_SET.every((field) => a[field] === b[field]);
}
