'use client';

/**
 * Who this player is, as far as the user has said.
 *
 * Everything on this panel is an assertion somebody makes on purpose. Nothing
 * is suggested, nothing is pre-filled from a similar name, and there is no
 * "looks like the same player?" prompt — because the moment software offers
 * that, most people accept it, and a profile that has quietly merged two
 * careers is wrong in a way that is almost impossible to notice afterwards.
 *
 * Linking an alias visibly widens what the profile counts, which is why the
 * panel says so next to the control rather than in a tooltip.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { Plus, Trash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { getRepositories } from '@/persistence/repositories';
import { useUi } from '@/stores/ui-store';

import type { PlayerIdentityView } from './usePlayer';

interface PlayerIdentityPanelProps {
  readonly playerId: string;
  readonly identity: PlayerIdentityView | undefined;
  readonly onChanged: () => void;
}

export function PlayerIdentityPanel({ playerId, identity, onChanged }: PlayerIdentityPanelProps) {
  const notify = useUi((state) => state.notify);
  const [linking, setLinking] = useState(false);
  const [fideId, setFideId] = useState(identity?.fideId ?? '');
  const [lichess, setLichess] = useState(identity?.lichessUsername ?? '');
  const [chesscom, setChesscom] = useState(identity?.chessComUsername ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const repositories = await getRepositories();
      return repositories.playerIdentities.upsert({
        name: identity?.name ?? playerId,
        fideId,
        lichessUsername: lichess,
        chessComUsername: chesscom,
      });
    },
    onSuccess: () => {
      notify({ tone: 'success', message: 'Identity saved.' });
      onChanged();
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That could not be saved.',
      }),
  });

  const link = useMutation({
    mutationFn: async (alias: string) => {
      const repositories = await getRepositories();
      await repositories.playerIdentities.upsert({ name: identity?.name ?? playerId });
      return repositories.playerIdentities.linkAlias(playerId, alias);
    },
    onSuccess: (record) => {
      notify({
        tone: 'success',
        message: `Linked. This profile now counts games under ${record.aliases.length} names.`,
      });
      onChanged();
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That alias could not be linked.',
      }),
    onSettled: () => setLinking(false),
  });

  const unlink = useMutation({
    mutationFn: async (alias: string) => {
      const repositories = await getRepositories();
      return repositories.playerIdentities.unlinkAlias(playerId, alias);
    },
    onSuccess: () => {
      notify({ tone: 'success', message: 'Alias unlinked.' });
      onChanged();
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That alias could not be unlinked.',
      }),
  });

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-primary">Names</h2>
        <p className="mt-1 text-xs leading-relaxed text-tertiary">
          Games are matched on the exact name, so a player recorded under two spellings has two
          profiles until you say otherwise. Linking a name here makes this profile count its games
          too. Kingfisher never links names on its own — deciding that “M. Carlsen” and “Carlsen,
          Magnus” are one person is a judgement, and getting it wrong merges two careers.
        </p>
        <ul className="mt-3 space-y-1">
          {(identity?.aliases ?? [playerId]).map((alias) => (
            <li key={alias} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-primary">{alias}</span>
              {alias === identity?.name || !identity?.stored ? (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-tertiary">
                  primary
                </span>
              ) : (
                <IconButton
                  label={`Unlink ${alias}`}
                  tone="danger"
                  onClick={() => unlink.mutate(alias)}
                >
                  <Trash />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
        <Button size="sm" icon={<Plus />} className="mt-2" onClick={() => setLinking(true)}>
          Link another name
        </Button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-primary">Elsewhere</h2>
        <p className="mt-1 text-xs leading-relaxed text-tertiary">
          Recorded because you said so, and used only to label this profile and to offer a sync of
          the linked account. Nothing is looked up, and no account is contacted until you ask.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="FIDE ID" value={fideId} onChange={setFideId} placeholder="1503014" />
          <Field label="Lichess" value={lichess} onChange={setLichess} placeholder="username" />
          <Field label="Chess.com" value={chesscom} onChange={setChesscom} placeholder="username" />
        </div>
        <Button variant="accent" className="mt-3" onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save identity'}
        </Button>
      </div>

      <PromptDialog
        open={linking}
        title="Link another name"
        description="Games stored under this name will be counted in this profile from now on."
        label="Name as it appears in the database"
        placeholder="Carlsen,M"
        confirmLabel="Link name"
        onCancel={() => setLinking(false)}
        onSubmit={(value) => link.mutate(value)}
      />
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-tertiary">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
      />
    </label>
  );
}
