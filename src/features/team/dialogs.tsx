'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import type { Color } from '@/chess/types';
import type { AssignmentKind, TeamMember, TeamRecord, TeamRole } from '@/persistence/domain';
import type {
  CreateAssignmentInput,
  MemberInput,
} from '@/persistence/repositories/team-repository';

import { KIND_LABEL, ROLE_LABEL } from './labels';
import { BRIEF_STARTERS } from './briefs';

const INPUT =
  'h-8 rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60';
const ROLES: readonly TeamRole[] = ['coach', 'second', 'player', 'student'];
const KINDS: readonly AssignmentKind[] = ['game', 'opening', 'opponent', 'positions', 'other'];

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-2xs text-tertiary">
      {label}
      {children}
    </label>
  );
}

function RoleSelect({
  value,
  onChange,
  label = 'Role',
}: {
  readonly value: TeamRole;
  readonly onChange: (role: TeamRole) => void;
  readonly label?: string;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TeamRole)}
        className={INPUT}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A team starts with the person creating it, who is therefore `me`. */
export function NewTeamDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: (input: { name: string; me: MemberInput }) => void;
}) {
  const [name, setName] = useState('');
  const [myName, setMyName] = useState('');
  const [role, setRole] = useState<TeamRole>('coach');
  const valid = name.trim() && myName.trim();
  return (
    <Dialog
      open
      title="New team"
      description="A coach and their students, or a player and their seconds. The team lives on this device and travels as a packet file."
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onCreate({ name: name.trim(), me: { name: myName.trim(), role } });
        }}
      >
        <Field label="Team name">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Academy U16 · Team Ana · Olympiad prep"
            className={INPUT}
            data-team-name
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name">
            <input
              value={myName}
              onChange={(event) => setMyName(event.target.value)}
              placeholder="As the others know you"
              className={INPUT}
              data-team-my-name
            />
          </Field>
          <RoleSelect value={role} onChange={setRole} label="Your role" />
        </div>
        <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={!valid}>
            Create team
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function MembersDialog({
  team,
  onClose,
  onAdd,
  onRemove,
  onChooseMe,
  onRename,
  onDelete,
}: {
  readonly team: TeamRecord;
  readonly onClose: () => void;
  readonly onAdd: (member: MemberInput) => void;
  readonly onRemove: (memberId: string) => void;
  readonly onChooseMe: (memberId: string) => void;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('student');
  const [lichess, setLichess] = useState('');
  const [teamName, setTeamName] = useState(team.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Dialog open title="Team" onClose={onClose} width="w-[600px]">
      <div className="flex flex-col gap-4 px-4 py-3">
        <Field label="Team name">
          <div className="flex gap-2">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              className={`${INPUT} flex-1`}
            />
            <Button
              type="button"
              variant="subtle"
              disabled={!teamName.trim() || teamName.trim() === team.name}
              onClick={() => onRename(teamName.trim())}
            >
              Rename
            </Button>
          </div>
        </Field>

        <div>
          <h4 className="text-[9.5px] text-tertiary">Members</h4>
          <p className="mt-0.5 text-[10.5px] text-tertiary">
            Roles are labels for the thread, not permissions: whoever holds the packet can edit it.
            Mark which member you are, so your handovers carry your name.
          </p>
          <ul className="mt-2 divide-y divide-line-subtle rounded-[6px] border border-line-subtle">
            {team.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isMe={member.id === team.me}
                onChooseMe={() => onChooseMe(member.id)}
                onRemove={() => onRemove(member.id)}
              />
            ))}
            {team.members.length === 0 ? (
              <li className="px-2.5 py-2 text-[10.5px] text-tertiary">Nobody yet.</li>
            ) : null}
          </ul>
        </div>

        <form
          className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onAdd({
              name: name.trim(),
              role,
              ...(lichess.trim() ? { lichessUsername: lichess.trim() } : {}),
            });
            setName('');
            setLichess('');
          }}
        >
          <Field label="Add a member">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className={INPUT}
              data-team-member-name
            />
          </Field>
          <RoleSelect value={role} onChange={setRole} />
          <Field label="Lichess (optional)">
            <input
              value={lichess}
              onChange={(event) => setLichess(event.target.value)}
              placeholder="username"
              className={INPUT}
            />
          </Field>
          <Button type="submit" variant="subtle" disabled={!name.trim()}>
            Add
          </Button>
        </form>

        <div className="flex items-center justify-between border-t border-line-subtle pt-3">
          <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete team from this device
          </Button>
          <Button type="button" variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${team.name}” from this device?`}
        description="Every assignment and handover in it goes with it, here. A packet that still holds them brings them back when received."
        onConfirm={async () => {
          await onDelete();
          setConfirmDelete(false);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Dialog>
  );
}

function MemberRow({
  member,
  isMe,
  onChooseMe,
  onRemove,
}: {
  readonly member: TeamMember;
  readonly isMe: boolean;
  readonly onChooseMe: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5" data-team-member={member.name}>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-primary">
        <input
          type="radio"
          name="team-me"
          checked={isMe}
          onChange={onChooseMe}
          className="accent-accent"
          aria-label={`This is me: ${member.name}`}
        />
        <span className="truncate">{member.name}</span>
        <span className="shrink-0 text-[10px] text-tertiary">
          {ROLE_LABEL[member.role]}
          {member.lichessUsername ? ` · ${member.lichessUsername}` : ''}
          {isMe ? ' · you' : ''}
        </span>
      </label>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}

export function NewAssignmentDialog({
  team,
  onClose,
  onCreate,
}: {
  readonly team: TeamRecord;
  readonly onClose: () => void;
  readonly onCreate: (input: Omit<CreateAssignmentInput, 'teamId' | 'setBy'>) => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AssignmentKind>('game');
  const [assignedTo, setAssignedTo] = useState('');
  const [due, setDue] = useState('');
  const [brief, setBrief] = useState('');
  const [opponent, setOpponent] = useState('');
  const [myColor, setMyColor] = useState<Color>('w');
  return (
    <Dialog open title="New assignment" onClose={onClose} width="w-[600px]">
      <form
        className="flex flex-col gap-3 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          onCreate({
            title: title.trim(),
            kind,
            brief,
            ...(assignedTo ? { assignedTo } : {}),
            ...(due ? { due } : {}),
            ...(kind === 'opponent' && opponent.trim()
              ? { opponent: opponent.trim(), myColor }
              : {}),
          });
        }}
      >
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Round 3 game · Najdorf 6.h3 file · Positions from Tuesday"
            className={INPUT}
            data-team-assignment-title
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Kind">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as AssignmentKind)}
              className={INPUT}
            >
              {KINDS.map((entry) => (
                <option key={entry} value={entry}>
                  {KIND_LABEL[entry]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="For">
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className={INPUT}
              data-team-assignment-for
            >
              <option value="">The whole team</option>
              {team.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due">
            <input
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              className={INPUT}
            />
          </Field>
        </div>
        {kind === 'opponent' ? (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Opponent">
              <input
                value={opponent}
                onChange={(event) => setOpponent(event.target.value)}
                placeholder="As their name appears in the games"
                className={INPUT}
                data-team-assignment-opponent
              />
            </Field>
            <Field label="Our colour">
              <select
                value={myColor}
                onChange={(event) => setMyColor(event.target.value as Color)}
                className={INPUT}
              >
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </Field>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-secondary">A clear brief makes a useful hand-in.</span>
          <Button
            type="button"
            size="sm"
            disabled={Boolean(brief.trim())}
            title={
              brief.trim() ? 'Clear the brief to start again. Your writing is kept.' : undefined
            }
            onClick={() => setBrief(BRIEF_STARTERS[kind])}
          >
            Use suggested brief
          </Button>
        </div>
        <Field label="Brief">
          <textarea
            rows={7}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="What to do, and what a good hand-in looks like. “Annotate your game; mark the move where you stopped calculating and say what you saw.”"
            className="resize-y rounded-[6px] border border-line bg-surface-inset px-2 py-1.5 text-[11px] leading-relaxed text-primary outline-none focus:border-accent/60"
            data-team-assignment-brief
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={!title.trim()}>
            Set assignment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
