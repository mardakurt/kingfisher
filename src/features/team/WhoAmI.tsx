'use client';

/**
 * "Which of these people are you?" — one select and one button.
 *
 * Asked wherever the answer is needed and missing: a team a packet just
 * created has a roster and no idea which member is sitting at this machine.
 * Nothing is guessed from a name; the person says.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import type { TeamRecord } from '@/persistence/domain';

import { ROLE_LABEL } from './labels';

export function WhoAmI({
  team,
  onChoose,
  busy,
}: {
  readonly team: TeamRecord;
  readonly onChoose: (memberId: string) => void;
  readonly busy: boolean;
}) {
  const [memberId, setMemberId] = useState(team.members[0]?.id ?? '');
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (memberId) onChoose(memberId);
      }}
    >
      <p className="text-[10.5px] text-secondary">
        Who are you in <span className="text-primary">{team.name}</span>? Your hand-ins and reviews
        will carry that name.
      </p>
      <div className="flex gap-1.5">
        <select
          aria-label="I am"
          value={memberId}
          onChange={(event) => setMemberId(event.target.value)}
          className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary outline-none focus:border-accent/60"
          data-team-who-select
        >
          {team.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} · {ROLE_LABEL[member.role]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="accent" size="sm" disabled={busy || !memberId}>
          That’s me
        </Button>
      </div>
      <p className="text-[10px] text-tertiary">Not listed? Add yourself under Members….</p>
    </form>
  );
}
