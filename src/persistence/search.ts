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
  | 'study'
  | 'chapter'
  | 'game'
  | 'player'
  | 'repertoire'
  | 'training'
  | 'model-game'
  | 'decision'
  | 'critical-position'
  | 'training-set'
  | 'opening-file'
  | 'preparation'
  | 'endgame'
  | 'theme'
  | 'tag';

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

  const [
    studies,
    chapters,
    repertoires,
    training,
    links,
    decisions,
    reviewItems,
    sets,
    openingFiles,
    sessions,
    endgames,
    gameResult,
  ] = await Promise.all([
    repositories.studies.list(),
    repositories.raw.getAll<ChapterRecord>(STORE_NAMES.chapters),
    repositories.repertoires.list(),
    repositories.training.list(),
    repositories.modelGames.list(),
    repositories.review.listDecisions(500),
    repositories.review.listReviewItems(),
    repositories.trainingSets.list(),
    repositories.openingFiles.list(),
    repositories.preparation.list(),
    repositories.endgames.list(),
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

  for (const file of openingFiles) {
    if (
      includes(`${file.name} ${file.eco ?? ''} ${file.summary ?? ''} ${file.notes ?? ''}`, needle)
    ) {
      add({
        id: `opening-file:${file.id}`,
        kind: 'opening-file',
        title: file.name,
        subtitle: `${file.color === 'w' ? 'White' : 'Black'} · ${file.positions.length} positions`,
        targetId: file.id,
      });
    }
  }

  for (const session of sessions) {
    const searchable = [session.title, session.opponent, session.event, session.notes].join(' ');
    if (includes(searchable, needle)) {
      add({
        id: `preparation:${session.id}`,
        kind: 'preparation',
        title: session.title,
        subtitle: session.opponent ? `vs ${session.opponent}` : 'Preparation session',
        targetId: session.id,
      });
    }
  }

  for (const record of endgames) {
    if (includes(`${record.title} ${record.note ?? ''} ${record.tags.join(' ')}`, needle)) {
      add({
        id: `endgame:${record.id}`,
        kind: 'endgame',
        title: record.title,
        subtitle: `${record.pieceCount} pieces`,
        targetId: record.id,
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

  for (const decision of decisions) {
    const searchable = [
      decision.plan,
      decision.calculationNotes,
      decision.chosenSan,
      ...decision.themes,
      ...decision.candidates.flatMap((candidate) => [
        candidate.san,
        candidate.note,
        ...(candidate.line ?? []),
      ]),
    ]
      .filter(Boolean)
      .join(' ');
    if (includes(searchable, needle)) {
      add({
        id: `decision:${decision.id}`,
        kind: 'decision',
        title: decision.plan || decision.chosenSan || 'Decision record',
        subtitle: 'Your pre-reveal analysis',
        targetId: decision.id,
      });
    }
  }

  for (const item of reviewItems) {
    if (includes([item.gameLabel, item.reason, item.category, ...item.themes].join(' '), needle)) {
      add({
        id: `critical:${item.id}`,
        kind: 'critical-position',
        title: item.gameLabel || 'Critical position',
        subtitle: [item.category, ...item.themes].filter(Boolean).join(' · '),
        targetId: item.id,
      });
    }
  }

  for (const set of sets) {
    const searchable = [set.name, ...(set.query?.themes ?? []), ...(set.query?.tags ?? [])].join(
      ' ',
    );
    if (includes(searchable, needle)) {
      add({
        id: `training-set:${set.id}`,
        kind: 'training-set',
        title: set.name,
        subtitle: set.kind === 'dynamic' ? 'Dynamic training set' : 'Training set',
        targetId: set.id,
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
    add({
      id: `player:${key}`,
      kind: 'player',
      title: name,
      subtitle: 'Open player profile',
      // The canonical key, which is what the profile route is keyed on, so the
      // palette never has to re-derive it from a display name.
      targetId: key,
    });
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

  const themes = new Set<string>();
  for (const decision of decisions)
    for (const theme of decision.themes) if (includes(theme, needle)) themes.add(theme);
  for (const item of reviewItems)
    for (const theme of item.themes) if (includes(theme, needle)) themes.add(theme);
  for (const theme of themes) {
    add({ id: `theme:${theme}`, kind: 'theme', title: theme, subtitle: 'Improvement theme' });
  }

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
