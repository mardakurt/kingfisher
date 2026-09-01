/**
 * Bounded cross-entity search for the command palette.
 *
 * This deliberately returns lightweight references. A game tree or chapter is
 * loaded only after the user selects it, preserving the summary/content split
 * that keeps large databases responsive.
 */

import type { ChapterRecord, GameSummary } from './types';
import { gameTitle } from './describe';
import type { AppRepositories } from './types';
import { STORE_NAMES } from './schema/migrations';

export type WorkspaceHitKind =
  'study' | 'chapter' | 'game' | 'player' | 'repertoire' | 'training' | 'model-game' | 'tag';

export interface WorkspaceSearchHit {
  readonly id: string;
  readonly kind: WorkspaceHitKind;
  readonly title: string;
  readonly subtitle?: string;
  readonly targetId?: string;
}

const includes = (value: string | undefined, needle: string): boolean =>
  value?.toLocaleLowerCase().includes(needle) ?? false;

export async function searchWorkspace(
  repositories: AppRepositories,
  query: string,
  limit = 36,
): Promise<readonly WorkspaceSearchHit[]> {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];

  const [studies, chapters, repertoires, training, links, gameResult] = await Promise.all([
    repositories.studies.list(),
    repositories.raw.getAll<ChapterRecord>(STORE_NAMES.chapters),
    repositories.repertoires.list(),
    repositories.training.list(),
    repositories.modelGames.list(),
    repositories.games.search({ text: query.trim(), limit: 18, sortBy: 'importedAt' }),
  ]);

  const hits: WorkspaceSearchHit[] = [];
  const add = (hit: WorkspaceSearchHit) => {
    if (hits.length < limit && !hits.some((candidate) => candidate.id === hit.id)) hits.push(hit);
  };

  for (const study of studies) {
    if (includes(`${study.title} ${study.description ?? ''}`, needle)) {
      add({ id: `study:${study.id}`, kind: 'study', title: study.title, targetId: study.id });
    }
  }

  const studiesById = new Map(studies.map((study) => [study.id, study]));
  for (const chapter of chapters) {
    if (includes(chapter.title, needle)) {
      add({
        id: `chapter:${chapter.id}`,
        kind: 'chapter',
        title: chapter.title,
        subtitle: studiesById.get(chapter.studyId)?.title,
        targetId: chapter.id,
      });
    }
  }

  for (const repertoire of repertoires) {
    if (includes(`${repertoire.title} ${repertoire.description ?? ''}`, needle)) {
      add({
        id: `repertoire:${repertoire.id}`,
        kind: 'repertoire',
        title: repertoire.title,
        subtitle: repertoire.color === 'w' ? 'White repertoire' : 'Black repertoire',
        targetId: repertoire.id,
      });
    }
  }

  for (const item of training) {
    const searchable = [item.prompt, item.explanation, ...item.tags, ...item.solutionSan].join(' ');
    if (includes(searchable, needle)) {
      add({
        id: `training:${item.id}`,
        kind: 'training',
        title: item.prompt,
        subtitle: `${item.mode.replaceAll('-', ' ')} · ${item.tags.join(', ') || 'untagged'}`,
        targetId: item.id,
      });
    }
  }

  for (const game of gameResult.games) add(gameHit(game));

  const players = new Map<string, string>();
  for (const game of gameResult.games) {
    if (includes(game.white, needle)) players.set(game.whiteKey, game.white);
    if (includes(game.black, needle)) players.set(game.blackKey, game.black);
  }
  for (const [key, name] of players) {
    add({ id: `player:${key}`, kind: 'player', title: name, subtitle: 'Prepare for player' });
  }

  const matchingLinks = links.filter((link) =>
    includes([...link.kinds, ...link.tags, link.note ?? ''].join(' '), needle),
  );
  const linkedGames = new Map(
    (await repositories.games.summaries(matchingLinks.map((link) => link.gameId))).map((game) => [
      game.id,
      game,
    ]),
  );
  for (const link of matchingLinks) {
    const game = linkedGames.get(link.gameId);
    if (!game) continue;
    add({
      id: `model:${link.id}`,
      kind: 'model-game',
      title: gameTitle(game),
      subtitle: [...link.kinds, ...link.tags].join(', '),
      targetId: game.id,
    });
  }

  const tags = new Set<string>();
  for (const item of training)
    for (const tag of item.tags) if (includes(tag, needle)) tags.add(tag);
  for (const link of links) for (const tag of link.tags) if (includes(tag, needle)) tags.add(tag);
  for (const tag of tags) add({ id: `tag:${tag}`, kind: 'tag', title: tag, subtitle: 'Tag' });

  return hits;
}

function gameHit(game: GameSummary): WorkspaceSearchHit {
  return {
    id: `game:${game.id}`,
    kind: 'game',
    title: gameTitle(game),
    subtitle: [game.eco, game.opening, game.date].filter(Boolean).join(' · '),
    targetId: game.id,
  };
}
