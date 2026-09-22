'use client';

/**
 * Opening a search hit, once.
 *
 * The palette and the search page both have to turn "a chapter, at this
 * node" into a route and a loaded document, and two implementations of that
 * is how one of them silently stops landing on the move. Both call here.
 */

import { gameTitle } from '@/persistence/describe';
import { openStoredGame } from '@/features/games/open-game';
import type { PositionHit } from '@/persistence/position-search';
import type { WorkspaceSearchHit } from '@/persistence/search';
import { getRepositories } from '@/persistence/repositories';
import { playerKey } from '@/persistence/schema/migrations';
import { useAnalysis } from '@/stores/analysis-store';

export type Navigate = (href: string) => void;

/** A position hit: a place in the player's own work where this position is. */
export async function openPositionHit(hit: PositionHit, navigate: Navigate): Promise<void> {
  const at = hit.ply !== undefined ? `&ply=${hit.ply}` : '';
  if (hit.kind === 'game' || hit.kind === 'model-game') {
    try {
      await openStoredGame(hit.targetId, hit.ply !== undefined ? { ply: hit.ply } : {});
      navigate('/analysis');
    } catch {
      navigate('/games');
    }
    return;
  }
  if (hit.kind === 'chapter') {
    navigate(
      `/studies?study=${encodeURIComponent(hit.parentId ?? '')}&chapter=${encodeURIComponent(hit.targetId)}${hit.nodeId ? `&node=${encodeURIComponent(hit.nodeId)}` : ''}`,
    );
    return;
  }
  if (hit.kind === 'team') {
    /*
     * The hit's id encodes both the assignment and the hand-in (the team
     * repository is the only one whose hits cover a thread, not a single
     * document). The ply names the matched node; the hand-in is what the
     * Team workspace has to open before going to that node.
     */
    const [, assignmentId, handoverId] = hit.id.split(':');
    const handover = assignmentId && handoverId ? `&handover=${encodeURIComponent(handoverId)}` : '';
    navigate(
      `/team?team=${encodeURIComponent(hit.parentId ?? '')}&assignment=${encodeURIComponent(hit.targetId)}${handover}${at}`,
    );
    return;
  }
  if (hit.kind === 'repertoire') {
    navigate(`/repertoire?repertoire=${encodeURIComponent(hit.targetId)}`);
    return;
  }
  if (hit.kind === 'endgame') navigate('/endgame');
  else if (hit.kind === 'opening-file') navigate('/opening-files');
  else if (hit.kind === 'preparation') navigate('/preparation');
  else if (hit.kind === 'decision' || hit.kind === 'critical-position') navigate('/review');
  else navigate('/training');
}

/** A text hit: a thing, by name. */
export async function openWorkspaceHit(hit: WorkspaceSearchHit, navigate: Navigate): Promise<void> {
  const repositories = await getRepositories();
  if (hit.kind === 'game' || hit.kind === 'model-game') {
    const game = hit.targetId ? await repositories.games.get(hit.targetId) : null;
    if (!game) throw new Error('That game is no longer in the database.');
    useAnalysis.getState().openDocument({
      tree: game.tree,
      document: { kind: 'database-game', title: gameTitle(game), gameId: game.id },
    });
    navigate('/analysis');
    return;
  }
  if (hit.kind === 'chapter') {
    const chapter = hit.targetId ? await repositories.studies.getChapter(hit.targetId) : null;
    if (!chapter) throw new Error('That chapter is no longer available.');
    const study = await repositories.studies.get(chapter.studyId);
    useAnalysis.getState().openDocument({
      tree: chapter.tree,
      document: {
        kind: 'study-chapter',
        title: chapter.title,
        studyId: chapter.studyId,
        studyTitle: study?.study.title ?? 'Study',
        chapterId: chapter.id,
        revision: chapter.revision,
      },
    });
    navigate('/analysis');
    return;
  }
  if (hit.kind === 'study') navigate(`/studies?study=${encodeURIComponent(hit.targetId ?? '')}`);
  else if (hit.kind === 'repertoire') navigate('/repertoire');
  else if (hit.kind === 'player')
    navigate(`/player/${encodeURIComponent(hit.targetId ?? playerKey(hit.title))}`);
  else if (hit.kind === 'decision' || hit.kind === 'critical-position' || hit.kind === 'theme')
    navigate('/review');
  else if (hit.kind === 'training-set')
    navigate(`/training?set=${encodeURIComponent(hit.targetId ?? '')}`);
  else if (hit.kind === 'opening-file') navigate('/opening-files');
  else if (hit.kind === 'preparation') navigate('/preparation');
  else if (hit.kind === 'endgame') navigate('/endgame');
  else navigate('/training');
}
