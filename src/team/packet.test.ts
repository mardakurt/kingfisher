import { describe, expect, it } from 'vitest';

import type { AssignmentRecord, Handover, TeamRecord } from '@/persistence/domain';

import {
  buildPacket,
  mergeAssignment,
  mergePacket,
  packetFileName,
  parseHandoverPgn,
  parsePacket,
  PACKET_FORMAT,
  PACKET_VERSION,
} from './packet';

const team: TeamRecord = {
  id: 'team-1',
  name: 'Academy',
  members: [
    { id: 'coach', name: 'Coach', role: 'coach' },
    { id: 'ana', name: 'Ana', role: 'student' },
  ],
  me: 'coach',
  createdAt: 1,
  updatedAt: 10,
  revision: 4,
};

const handover = (partial: Partial<Handover> & Pick<Handover, 'id' | 'kind' | 'at'>): Handover => ({
  authorId: 'ana',
  authorName: 'Ana',
  note: '',
  ...partial,
});

const assignment = (partial: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  id: 'a-1',
  teamId: 'team-1',
  title: 'Round 3 game',
  kind: 'game',
  brief: 'Annotate your game.',
  setBy: 'coach',
  assignedTo: 'ana',
  handovers: [],
  createdAt: 1,
  updatedAt: 10,
  revision: 2,
  ...partial,
});

describe('buildPacket', () => {
  it('never carries me or revisions, and names who shared it', () => {
    const packet = buildPacket(team, [assignment()], 500);
    expect(packet.format).toBe(PACKET_FORMAT);
    expect(packet.version).toBe(PACKET_VERSION);
    expect('me' in packet.team).toBe(false);
    expect('revision' in packet.team).toBe(false);
    expect('revision' in packet.assignments[0]!).toBe(false);
    expect(packet.exportedBy?.name).toBe('Coach');
    expect(packet.exportedAt).toBe(500);
  });

  it('leaves out another team’s assignments', () => {
    const packet = buildPacket(team, [assignment(), assignment({ id: 'x', teamId: 'other' })]);
    expect(packet.assignments.map((entry) => entry.id)).toEqual(['a-1']);
  });

  it('names the file after the team and the day', () => {
    expect(packetFileName({ name: 'Club Öst / U16' }, Date.UTC(2026, 8, 20))).toBe(
      'Club-Öst-U16-2026-09-20.kingfisher-team.json',
    );
  });
});

describe('parsePacket', () => {
  it('accepts what buildPacket wrote, through JSON', () => {
    const packet = buildPacket(team, [
      assignment({
        handovers: [handover({ id: 'h1', kind: 'hand-in', at: 5, pgn: '1. e4 e5 *' })],
      }),
    ]);
    const parsed = parsePacket(JSON.parse(JSON.stringify(packet)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.packet.assignments[0]?.handovers[0]?.pgn).toBe('1. e4 e5 *');
  });

  it('refuses a file that is not a packet, and a packet from another version', () => {
    expect(parsePacket({ format: 'kingfisher-backup' })).toEqual({
      ok: false,
      reason: 'This file is not a Kingfisher team packet.',
    });
    expect(parsePacket('text').ok).toBe(false);
    const other = parsePacket({ ...buildPacket(team, []), version: 2 });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.reason).toContain('version 2');
  });

  it('refuses the whole packet when one board does not play', () => {
    const packet = buildPacket(team, [
      assignment({
        handovers: [handover({ id: 'h1', kind: 'hand-in', at: 5, pgn: '1. e4 e5 2. Nxe5 *' })],
      }),
    ]);
    const parsed = parsePacket(JSON.parse(JSON.stringify(packet)));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/Round 3 game.*does not play/);
  });

  it('refuses an assignment that names a different team', () => {
    const packet = buildPacket(team, []);
    const tampered = { ...packet, assignments: [{ ...assignment({ teamId: 'other' }) }] };
    const parsed = parsePacket(JSON.parse(JSON.stringify(tampered)));
    expect(parsed.ok).toBe(false);
  });

  it('drops a me that a hand-edited packet smuggled in', () => {
    const packet = JSON.parse(JSON.stringify(buildPacket(team, [])));
    packet.team.me = 'ana';
    const parsed = parsePacket(packet);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect('me' in parsed.packet.team).toBe(false);
  });
});

describe('parseHandoverPgn', () => {
  it('replays through the rules and reports the first error', () => {
    expect(parseHandoverPgn('1. e4 e5 *').ok).toBe(true);
    expect(parseHandoverPgn('1. e4 e5 2. Ke2 Ke7 3. Ke1 Ke8 *').ok).toBe(true);
    const bad = parseHandoverPgn('1. e4 e5 2. Kd3 *');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason.length).toBeGreaterThan(0);
    const two = parseHandoverPgn('1. e4 *\n\n1. d4 *');
    expect(two).toEqual({ ok: false, reason: 'A handover carries one game.' });
  });
});

describe('mergeAssignment', () => {
  it('takes the union of handovers and keeps the copy already held', () => {
    const local = assignment({
      handovers: [handover({ id: 'h1', kind: 'hand-in', at: 5, note: 'mine' })],
    });
    const incoming = {
      ...assignment({
        handovers: [
          handover({ id: 'h1', kind: 'hand-in', at: 5, note: 'theirs' }),
          handover({ id: 'r1', kind: 'review', at: 9, verdict: 'accepted', authorId: 'coach' }),
        ],
      }),
    };
    const merged = mergeAssignment(local, incoming);
    expect(merged.handovers.map((entry) => entry.id)).toEqual(['h1', 'r1']);
    expect(merged.handovers[0]?.note).toBe('mine');
    expect(merged.revision).toBe(2);
  });

  it('lets the newer copy set the assignment, and the older copy not', () => {
    const local = assignment({ title: 'Old title', updatedAt: 10 });
    const newer = mergeAssignment(
      local,
      assignment({ title: 'Renamed', due: '2026-09-25', updatedAt: 20 }),
    );
    expect(newer.title).toBe('Renamed');
    expect(newer.due).toBe('2026-09-25');
    expect(newer.updatedAt).toBe(20);
    const older = mergeAssignment(local, assignment({ title: 'Stale', updatedAt: 5 }));
    expect(older.title).toBe('Old title');
    expect(older.updatedAt).toBe(10);
  });

  it('lets the newer copy clear what the older one had set: un-archive, no due, no assignee', () => {
    const local = assignment({
      archived: true,
      due: '2026-09-25',
      assignedTo: 'ana',
      updatedAt: 10,
    });
    const cleared = assignment({ updatedAt: 20 });
    const { archived: _a, due: _d, assignedTo: _t, ...withoutThem } = cleared;
    const merged = mergeAssignment(local, withoutThem);
    expect(merged.archived).toBeUndefined();
    expect(merged.due).toBeUndefined();
    expect(merged.assignedTo).toBeUndefined();
    expect(merged.id).toBe(local.id);
    expect(merged.revision).toBe(local.revision);
  });
});

describe('mergePacket', () => {
  it('creates an unknown team with me unset, and counts what arrived', () => {
    const packet = buildPacket(team, [
      assignment({ handovers: [handover({ id: 'h1', kind: 'hand-in', at: 5 })] }),
    ]);
    const result = mergePacket({ team: null, assignments: [] }, packet, 99);
    expect(result.team.me).toBeUndefined();
    expect(result.team.revision).toBe(0);
    expect(result.summary).toEqual({
      teamCreated: true,
      newMembers: 2,
      newAssignments: 1,
      updatedAssignments: 0,
      newHandovers: 1,
    });
  });

  it('keeps me, unions the roster, and reports only what changed', () => {
    const local = { ...team, me: 'ana', updatedAt: 10 };
    const localAssignments = [
      assignment({ id: 'a-1', handovers: [handover({ id: 'h1', kind: 'hand-in', at: 5 })] }),
      assignment({ id: 'a-2', title: 'Untouched' }),
    ];
    const remoteTeam: TeamRecord = {
      ...team,
      members: [...team.members, { id: 'ben', name: 'Ben', role: 'student' }],
      updatedAt: 20,
    };
    const packet = buildPacket(remoteTeam, [
      assignment({
        id: 'a-1',
        handovers: [
          handover({ id: 'h1', kind: 'hand-in', at: 5 }),
          handover({ id: 'r1', kind: 'review', at: 9, verdict: 'needs-work', authorId: 'coach' }),
        ],
      }),
      assignment({ id: 'a-2', title: 'Untouched' }),
      assignment({ id: 'a-3', title: 'New' }),
    ]);
    const result = mergePacket({ team: local, assignments: localAssignments }, packet, 99);
    expect(result.team.me).toBe('ana');
    expect(result.team.revision).toBe(4);
    expect(result.team.members.map((member) => member.id)).toEqual(['coach', 'ana', 'ben']);
    expect(result.assignments.map((entry) => entry.id)).toEqual(['a-1', 'a-3']);
    expect(result.summary).toEqual({
      teamCreated: false,
      newMembers: 1,
      newAssignments: 1,
      updatedAssignments: 1,
      newHandovers: 1,
    });
  });

  it('applying the same packet twice changes nothing the second time', () => {
    const packet = buildPacket(team, [
      assignment({ handovers: [handover({ id: 'h1', kind: 'hand-in', at: 5 })] }),
    ]);
    const first = mergePacket({ team: null, assignments: [] }, packet, 50);
    const second = mergePacket({ team: first.team, assignments: first.assignments }, packet, 60);
    expect(second.assignments).toEqual([]);
    expect(second.summary.newHandovers).toBe(0);
    expect(second.summary.newMembers).toBe(0);
  });
});
