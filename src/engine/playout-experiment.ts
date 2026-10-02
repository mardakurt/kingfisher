/** Experiment checkpoints live in ordinary study chapters, hence in portable backups. */
import { Position } from '@/chess/position';
import { createTree, setComment } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import type { EngineIdentity } from './types';
import type { Playout, PlayoutOptions } from './playouts';

export interface PlayoutExperiment {
  readonly format: 'kingfisher-playout-experiment';
  readonly version: 1;
  readonly fen: Fen;
  readonly engineId: string;
  readonly identity: EngineIdentity;
  readonly options: PlayoutOptions;
  readonly parameters: { readonly threads: 1; readonly hashMb: 32 };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completed: readonly Playout[];
}

export function experimentTree(experiment: PlayoutExperiment): GameTree {
  return setComment(
    createTree(experiment.fen, {
      Event: 'Playout experiment',
      Result: '*',
      SetUp: '1',
      FEN: experiment.fen,
      KingfisherExperiment: JSON.stringify(experiment),
    }),
    'r',
    `Experiment by ${experiment.identity.name}. ${experiment.completed.length} of ${experiment.options.playouts} games checkpointed. Seed ${experiment.options.seed}; ${experiment.options.msPerMove} ms/move, MultiPV ${experiment.options.multiPv}, threads 1, hash 32 MiB. Open this chapter and use Engine → Playouts → Resume saved experiment. Time-limited engine answers may vary between runs; the seed does not guarantee identical results.`,
  );
}

export function readExperiment(tree: GameTree): PlayoutExperiment | null {
  const raw = tree.headers.KingfisherExperiment;
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid experiment checkpoint.');
  const experiment = value as PlayoutExperiment;
  if (
    experiment.format !== 'kingfisher-playout-experiment' ||
    experiment.version !== 1 ||
    experiment.fen !== tree.startFen ||
    typeof experiment.engineId !== 'string' ||
    !experiment.identity?.name ||
    !Array.isArray(experiment.completed) ||
    experiment.completed.length > 100 ||
    !experiment.options ||
    experiment.parameters?.threads !== 1 ||
    experiment.parameters?.hashMb !== 32
  )
    throw new Error('Invalid experiment checkpoint.');
  const options = experiment.options;
  if (
    ![
      options.playouts,
      options.msPerMove,
      options.multiPv,
      options.marginCp,
      options.maxPlies,
      options.seed,
    ].every(Number.isSafeInteger) ||
    options.playouts < 1 ||
    options.playouts > 100 ||
    options.msPerMove < 1 ||
    options.multiPv < 1 ||
    options.multiPv > 5 ||
    options.marginCp < 0 ||
    options.maxPlies < 1 ||
    options.maxPlies > 1000 ||
    experiment.completed.length > options.playouts
  )
    throw new Error('Invalid experiment budget.');
  for (const game of experiment.completed) {
    if (!Array.isArray(game.moves) || game.moves.length > options.maxPlies)
      throw new Error('Invalid checkpoint moves.');
    const start = Position.fromFen(experiment.fen);
    if (!start.ok) throw new Error('Invalid checkpoint position.');
    let position = start.value;
    const seen = new Map([[position.hash(), 1]]);
    for (const uci of game.moves) {
      if (position.outcome() || (seen.get(position.hash()) ?? 0) >= 3 || typeof uci !== 'string')
        throw new Error('Checkpoint continues past its outcome.');
      const move = position.playUci(uci);
      if (!move.ok) throw new Error('Illegal checkpoint move.');
      const next = position.advance({
        from: move.value.from,
        to: move.value.to,
        ...(move.value.promotion ? { promotion: move.value.promotion } : {}),
      });
      if (!next.ok) throw new Error('Illegal checkpoint move.');
      position = next.value.next;
      seen.set(position.hash(), (seen.get(position.hash()) ?? 0) + 1);
    }
    const outcome = position.outcome();
    const ending =
      outcome?.kind ??
      ((seen.get(position.hash()) ?? 0) >= 3
        ? 'threefold-repetition'
        : game.moves.length === options.maxPlies
          ? 'unfinished'
          : null);
    if (
      game.ending !== ending ||
      game.winner !== (outcome?.kind === 'checkmate' ? outcome.winner : undefined)
    )
      throw new Error('Checkpoint outcome disagrees with its moves.');
  }
  return experiment;
}
