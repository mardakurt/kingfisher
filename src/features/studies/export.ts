/**
 * Studies out of the application.
 *
 * A study is exported as a multi-game PGN: one game per chapter, tagged with
 * the study and chapter names. That is a format every chess program already
 * reads, so nothing here invents a private container — a user who exports a
 * repertoire can open it in ChessBase or Lichess tomorrow.
 */

import { serializePgn } from '@/chess/pgn';
import { setHeaders } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { ChapterRecord, StudyWithChapters } from '@/persistence/types';

/** Chapter headers, with anything the tree already carries left untouched. */
export function chapterTree(chapter: ChapterRecord, studyTitle: string): GameTree {
  return setHeaders(chapter.tree, {
    Event: chapter.tree.headers.Event ?? studyTitle,
    Site: chapter.tree.headers.Site ?? 'Kingfisher',
    ...chapter.tree.headers,
    // The chapter name is the one thing the tree cannot know.
    StudyName: studyTitle,
    ChapterName: chapter.title,
  });
}

export function exportChapterPgn(chapter: ChapterRecord, studyTitle: string): string {
  return serializePgn(chapterTree(chapter, studyTitle));
}

export function exportStudyPgn(study: StudyWithChapters): string {
  return study.chapters.map((chapter) => exportChapterPgn(chapter, study.study.title)).join('\n\n');
}
