import { describe, expect, it } from 'vitest';

import { buildPacket, mergePacket } from '@/team';

import { StaleAssignmentWriteError, StaleTeamWriteError } from '../domain';
import { createMemoryRepositories } from './index';

async function academy() {
  const repositories = createMemoryRepositories();
  const team = await repositories.team.createTeam({
    name: 'Academy',
    members: [
      { name: 'Coach', role: 'coach' },
      { name: 'Ana', role: 'student' },
    ],
    meIndex: 0,
  });
  return { repositories, team };
}

describe('LocalTeamRepository', () => {
  it('creates a team with me chosen, and refuses a me who is not a member', async () => {
    const { repositories, team } = await academy();
    expect(team.members.map((member) => member.name)).toEqual(['Coach', 'Ana']);
    expect(team.me).toBe(team.members[0]?.id);
    await expect(
      repositories.team.updateTeam(team.id, team.revision, { me: 'nobody' }),
    ).rejects.toThrow('not in this team');
  });

  it('refuses a stale team write', async () => {
    const { repositories, team } = await academy();
    await repositories.team.addMember(team.id, team.revision, { name: 'Ben', role: 'student' });
    await expect(
      repositories.team.addMember(team.id, team.revision, { name: 'Cal', role: 'student' }),
    ).rejects.toBeInstanceOf(StaleTeamWriteError);
  });

  it('forgets me when that member is removed', async () => {
    const { repositories, team } = await academy();
    const next = await repositories.team.removeMember(team.id, team.revision, team.me!);
    expect(next.me).toBeUndefined();
    expect(next.members).toHaveLength(1);
  });

  it('sets work only from a member, and appends handovers whose boards play', async () => {
    const { repositories, team } = await academy();
    const [coach, ana] = team.members;
    await expect(
      repositories.team.createAssignment({
        teamId: team.id,
        title: 'x',
        kind: 'game',
        brief: '',
        setBy: 'ghost',
      }),
    ).rejects.toThrow('Choose who you are');

    const assignment = await repositories.team.createAssignment({
      teamId: team.id,
      title: 'Round 3 game',
      kind: 'game',
      brief: 'Annotate your game; mark the moment you stopped calculating.',
      setBy: coach!.id,
      assignedTo: ana!.id,
      due: '2026-09-25',
    });
    expect(assignment.handovers).toEqual([]);

    await expect(
      repositories.team.addHandover(assignment.id, assignment.revision, {
        kind: 'hand-in',
        authorId: ana!.id,
        note: '',
        pgn: '1. e4 e5 2. Kd3 *',
      }),
    ).rejects.toThrow('does not play');
    await expect(
      repositories.team.addHandover(assignment.id, assignment.revision, {
        kind: 'hand-in',
        authorId: ana!.id,
        note: '',
      }),
    ).rejects.toThrow('carries the board');
    await expect(
      repositories.team.addHandover(assignment.id, assignment.revision, {
        kind: 'review',
        authorId: coach!.id,
        note: '',
      }),
    ).rejects.toThrow('needs a verdict');

    const handedIn = await repositories.team.addHandover(
      assignment.id,
      assignment.revision,
      { kind: 'hand-in', authorId: ana!.id, note: 'Here it is.', pgn: '1. e4 e5 2. Nf3 *' },
      100,
    );
    expect(handedIn.handovers).toHaveLength(1);
    expect(handedIn.handovers[0]).toMatchObject({
      kind: 'hand-in',
      authorName: 'Ana',
      at: 100,
      note: 'Here it is.',
    });
    // The record on disk is the one returned, and the stale check bites.
    expect(await repositories.team.getAssignment(assignment.id)).toEqual(handedIn);
    await expect(
      repositories.team.addHandover(assignment.id, assignment.revision, {
        kind: 'note',
        authorId: coach!.id,
        note: 'late',
      }),
    ).rejects.toBeInstanceOf(StaleAssignmentWriteError);
  });

  it('lists a team’s assignments by team and deletes them with the team', async () => {
    const { repositories, team } = await academy();
    const other = await repositories.team.createTeam({ name: 'Other' });
    const coach = team.members[0]!.id;
    await repositories.team.createAssignment({
      teamId: team.id,
      title: 'A',
      kind: 'game',
      brief: '',
      setBy: coach,
    });
    await repositories.team.createAssignment({
      teamId: team.id,
      title: 'B',
      kind: 'opening',
      brief: '',
      setBy: coach,
    });
    expect((await repositories.team.listAssignments(team.id)).map((a) => a.title).sort()).toEqual([
      'A',
      'B',
    ]);
    expect(await repositories.team.listAssignments(other.id)).toEqual([]);

    await repositories.team.deleteTeam(team.id);
    expect(await repositories.team.getTeam(team.id)).toBeNull();
    expect(await repositories.team.listAssignments(team.id)).toEqual([]);
    expect(await repositories.team.getTeam(other.id)).not.toBeNull();
  });

  it('commits a merge in one transaction, and refuses one computed against a moved copy', async () => {
    // The coach's machine.
    const coachSide = await academy();
    const coach = coachSide.team.members[0]!.id;
    const ana = coachSide.team.members[1]!.id;
    const set = await coachSide.repositories.team.createAssignment({
      teamId: coachSide.team.id,
      title: 'Round 3 game',
      kind: 'game',
      brief: 'Annotate it.',
      setBy: coach,
      assignedTo: ana,
    });
    const packet = buildPacket(coachSide.team, [set]);

    // Ana's machine receives it: the team is new there.
    const anaSide = createMemoryRepositories();
    const first = mergePacket({ team: null, assignments: [] }, packet);
    await anaSide.team.applyMerge(first.team, first.assignments);
    const anaTeam = (await anaSide.team.getTeam(coachSide.team.id))!;
    expect(anaTeam.me).toBeUndefined();
    expect(anaTeam.revision).toBe(1);
    const chosen = await anaSide.team.updateTeam(anaTeam.id, anaTeam.revision, { me: ana });
    const received = (await anaSide.team.getAssignment(set.id))!;
    const handedIn = await anaSide.team.addHandover(received.id, received.revision, {
      kind: 'hand-in',
      authorId: ana,
      note: 'Done.',
      pgn: '1. e4 c5 *',
    });

    // Back to the coach: only the hand-in is new.
    const back = buildPacket(chosen, [handedIn]);
    const coachLocal = {
      team: (await coachSide.repositories.team.getTeam(coachSide.team.id))!,
      assignments: await coachSide.repositories.team.listAssignments(coachSide.team.id),
    };
    const merged = mergePacket(coachLocal, back);
    expect(merged.summary.newHandovers).toBe(1);
    expect(merged.team.me).toBe(coach);

    // A stale merge: the coach's copy moved between computing and committing.
    await coachSide.repositories.team.updateTeam(coachLocal.team.id, coachLocal.team.revision, {
      name: 'Academy (renamed)',
    });
    await expect(
      coachSide.repositories.team.applyMerge(merged.team, merged.assignments),
    ).rejects.toBeInstanceOf(StaleTeamWriteError);

    // Recomputed against the live copy, it lands, and the rename survives.
    const live = {
      team: (await coachSide.repositories.team.getTeam(coachSide.team.id))!,
      assignments: await coachSide.repositories.team.listAssignments(coachSide.team.id),
    };
    const again = mergePacket(live, back);
    await coachSide.repositories.team.applyMerge(again.team, again.assignments);
    const final = (await coachSide.repositories.team.getAssignment(set.id))!;
    expect(final.handovers.map((h) => h.note)).toEqual(['Done.']);
    expect((await coachSide.repositories.team.getTeam(coachSide.team.id))!.name).toBe(
      'Academy (renamed)',
    );
  });
});
