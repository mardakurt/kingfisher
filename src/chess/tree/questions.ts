/**
 * Questions inside a chapter: "find the move" at chosen moments of a game.
 *
 * ChessBase's training annotations let a coach turn an annotated game into
 * homework: at a marked move the replay stops and the student must find it.
 * Kingfisher marks the *answer* move — its `meta.question` holds the prompt,
 * '' for the default — so the question is asked at the position before it,
 * and the answer is the move the author played there. Sibling moves the
 * author marked `!` or `!!` are accepted too: a coach who gives two good moves
 * is saying either is right.
 *
 * Pure: the list is read from the tree, in reading order — the main line
 * first, then the variations, each by ply.
 */

import { isOnMainline, mustGetNode, setMeta } from './tree';
import type { GameTree, NodeId } from './types';
import type { Fen, San, Uci } from '../types';

export const DEFAULT_QUESTION_PROMPT = 'Find the move.';

/** `!` and `!!`: a sibling the author marked good is another right answer. */
const GOOD_NAGS = new Set([1, 3]);

export interface ChapterQuestion {
  /** The answer move's node. */
  readonly nodeId: NodeId;
  /** The position the question is asked at. */
  readonly fen: Fen;
  readonly ply: number;
  readonly prompt: string;
  readonly solutionUci: readonly Uci[];
  readonly solutionSan: readonly San[];
  /** What the author wrote after the move, shown once it is answered. */
  readonly explanation?: string;
  readonly mainline: boolean;
  /** What the author says finding it is worth; absent when none was set. */
  readonly points?: number;
  /** The author's time limit, in seconds; absent when the question is untimed. */
  readonly timeLimitSeconds?: number;
}

export function chapterQuestions(tree: GameTree): ChapterQuestion[] {
  const questions: ChapterQuestion[] = [];
  for (const node of Object.values(tree.nodes)) {
    if (node.meta.question === undefined || !node.move || !node.parentId) continue;
    const parent = mustGetNode(tree, node.parentId);
    const answers = [
      node,
      ...parent.children
        .map((id) => mustGetNode(tree, id))
        .filter(
          (sibling) => sibling.id !== node.id && sibling.nags.some((nag) => GOOD_NAGS.has(nag)),
        ),
    ].filter((answer) => answer.move);
    questions.push({
      nodeId: node.id,
      fen: parent.fen,
      ply: node.ply,
      prompt: node.meta.question.trim() || DEFAULT_QUESTION_PROMPT,
      solutionUci: answers.map((answer) => answer.move!.uci),
      solutionSan: answers.map((answer) => answer.move!.san),
      ...(node.comment?.trim() ? { explanation: node.comment.trim() } : {}),
      mainline: isOnMainline(tree, node.id),
      ...(node.meta.questionPoints !== undefined ? { points: node.meta.questionPoints } : {}),
      ...(node.meta.questionSeconds !== undefined
        ? { timeLimitSeconds: node.meta.questionSeconds }
        : {}),
    });
  }
  return questions.sort(
    (a, b) =>
      Number(b.mainline) - Number(a.mainline) || a.ply - b.ply || a.nodeId.localeCompare(b.nodeId),
  );
}

export interface QuestionSettings {
  /** Points for finding it: a whole number of at least one, or absent. */
  readonly points?: number;
  /** A time limit in seconds, or absent for an untimed question. */
  readonly seconds?: number;
}

const wholeOrNothing = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isInteger(value) && value >= 1 ? value : undefined;

/**
 * Mark a move as a question (with a prompt, '' for the default, and optional
 * points and time limit), or unmark it — which removes its points and time
 * too, since they belong to the question and to nothing else.
 */
export function setQuestion(
  tree: GameTree,
  nodeId: NodeId,
  prompt: string | null,
  settings: QuestionSettings = {},
): GameTree {
  const node = tree.nodes[nodeId];
  if (!node?.move) return tree;
  // `setMeta` merges, which cannot remove a key; the question's keys are rebuilt whole.
  const {
    question: _question,
    questionPoints: _points,
    questionSeconds: _seconds,
    ...rest
  } = node.meta;
  if (prompt === null)
    return { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, meta: rest } } };
  const points = wholeOrNothing(settings.points);
  const seconds = wholeOrNothing(settings.seconds);
  const meta = {
    ...rest,
    question: prompt.trim(),
    ...(points !== undefined ? { questionPoints: points } : {}),
    ...(seconds !== undefined ? { questionSeconds: seconds } : {}),
  };
  return setMeta(
    { ...tree, nodes: { ...tree.nodes, [nodeId]: { ...node, meta: rest } } },
    nodeId,
    meta,
  );
}
