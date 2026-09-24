/**
 * Engine evaluations as a file one Kingfisher gives another (Phase 85).
 *
 * ChessBase pools its users' evaluations on a server (Let's Check). The
 * owner chose a file instead: nothing leaves a machine unless a person saves
 * the file and hands it on, and nothing arrives unless a person opens one.
 * What travels is evidence, each evaluation with its provenance — the
 * engine by name, the depth, the nodes, the time, the line, when it was
 * searched, and who exported it — and it is shown beside the local engine,
 * labelled, never mixed into it.
 *
 * A received file is data, not instructions: every FEN is parsed by
 * Kingfisher's own parser and the position key recomputed from it; every
 * line is replayed through the rules and cut at its first illegal move;
 * every number is checked. An evaluation that fails is left out and counted.
 */

import type { Score } from '@/chess/evaluation';
import { parseFen, positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { Fen, Uci } from '@/chess/types';

export const EVALUATIONS_FORMAT = 'kingfisher-evaluations';
export const EVALUATIONS_VERSION = 1;
/** A file larger than this is refused rather than read into memory. */
export const MAX_EVALUATIONS = 200_000;

export interface SharedLine {
  readonly score: Score;
  readonly pv: readonly Uci[];
}

export interface SharedEvaluation {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly engine: string;
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
  readonly score: Score;
  readonly pv: readonly Uci[];
  /** The engine's other lines, best first, when the search kept them. */
  readonly alternatives?: readonly SharedLine[];
  readonly analysedAt: number;
}

export interface EvaluationsFile {
  readonly format: typeof EVALUATIONS_FORMAT;
  readonly version: typeof EVALUATIONS_VERSION;
  readonly exportedAt: number;
  /** Who exported it, as they chose to write it; null when they gave no name. */
  readonly from: string | null;
  readonly evaluations: readonly SharedEvaluation[];
}

/** An evaluation from this machine, before it is written into a file. */
export interface LocalEvaluation {
  readonly fen: string;
  readonly engine: string;
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
  readonly score: Score;
  readonly pv: readonly string[];
  readonly alternatives?: readonly { readonly score: Score; readonly pv: readonly string[] }[];
  readonly analysedAt: number;
}

/**
 * One evaluation per position and engine — the deepest, and of two equally
 * deep the newer — so a file carries the best evidence it has once.
 */
export function buildEvaluationsFile(
  local: readonly LocalEvaluation[],
  from: string | null,
  exportedAt = Date.now(),
): EvaluationsFile {
  const best = new Map<string, SharedEvaluation>();
  for (const entry of local) {
    const checked = checkEvaluation(entry);
    if (!checked) continue;
    const key = `${checked.positionKey}\u001f${checked.engine}`;
    const known = best.get(key);
    if (
      !known ||
      checked.depth > known.depth ||
      (checked.depth === known.depth && checked.analysedAt > known.analysedAt)
    ) {
      best.set(key, checked);
    }
  }
  const trimmed = from?.trim().slice(0, 80);
  return {
    format: EVALUATIONS_FORMAT,
    version: EVALUATIONS_VERSION,
    exportedAt,
    from: trimmed ? trimmed : null,
    evaluations: [...best.values()].sort(
      (a, b) => a.positionKey.localeCompare(b.positionKey) || a.engine.localeCompare(b.engine),
    ),
  };
}

export interface ParsedEvaluations {
  readonly from: string | null;
  readonly exportedAt: number;
  readonly evaluations: readonly SharedEvaluation[];
  /** Evaluations left out because something in them did not check. */
  readonly refused: number;
}

export class EvaluationsFileError extends Error {}

export function parseEvaluationsFile(value: unknown): ParsedEvaluations {
  if (typeof value !== 'object' || value === null) {
    throw new EvaluationsFileError('This is not a Kingfisher evaluations file.');
  }
  const file = value as Record<string, unknown>;
  if (file.format !== EVALUATIONS_FORMAT) {
    throw new EvaluationsFileError('This is not a Kingfisher evaluations file.');
  }
  if (file.version !== EVALUATIONS_VERSION) {
    throw new EvaluationsFileError(
      `This file is version ${String(file.version)}; this Kingfisher reads version ${EVALUATIONS_VERSION}.`,
    );
  }
  if (!Array.isArray(file.evaluations)) {
    throw new EvaluationsFileError('The file has no list of evaluations.');
  }
  if (file.evaluations.length > MAX_EVALUATIONS) {
    throw new EvaluationsFileError(
      `The file holds ${file.evaluations.length.toLocaleString('en-US')} evaluations; at most ${MAX_EVALUATIONS.toLocaleString('en-US')} are read.`,
    );
  }
  const evaluations: SharedEvaluation[] = [];
  let refused = 0;
  for (const raw of file.evaluations) {
    const checked = checkEvaluation(raw as LocalEvaluation);
    if (checked) evaluations.push(checked);
    else refused += 1;
  }
  const from =
    typeof file.from === 'string' && file.from.trim() ? file.from.trim().slice(0, 80) : null;
  const exportedAt = finite(file.exportedAt) ? (file.exportedAt as number) : 0;
  return { from, exportedAt, evaluations, refused };
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function score(value: unknown): Score | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'cp' && finite(candidate.cp) && Math.abs(candidate.cp) < 100_000) {
    return { kind: 'cp', cp: Math.round(candidate.cp) };
  }
  if (
    candidate.kind === 'mate' &&
    finite(candidate.moves) &&
    Number.isInteger(candidate.moves) &&
    candidate.moves !== 0 &&
    Math.abs(candidate.moves) < 1_000
  ) {
    return { kind: 'mate', moves: candidate.moves };
  }
  return null;
}

/** The moves of a line that are legal from the position, cut at the first that is not. */
function legalLine(position: Position, raw: unknown): Uci[] {
  if (!Array.isArray(raw)) return [];
  const out: Uci[] = [];
  let at = position;
  for (const move of raw.slice(0, 64)) {
    if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) break;
    const played = at.playUci(move);
    if (!isOk(played)) break;
    out.push(played.value.uci);
    at = Position.fromTrustedFen(played.value.after);
  }
  return out;
}

function checkEvaluation(raw: LocalEvaluation | null | undefined): SharedEvaluation | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.fen !== 'string') return null;
  const parts = parseFen(raw.fen);
  if (!isOk(parts)) return null;
  const built = Position.fromFen(raw.fen);
  if (!isOk(built)) return null;
  const engine = typeof raw.engine === 'string' ? raw.engine.trim().slice(0, 80) : '';
  if (!engine) return null;
  const main = score(raw.score);
  if (!main) return null;
  if (![raw.depth, raw.nodes, raw.timeMs, raw.analysedAt].every(finite)) return null;
  if (raw.depth < 1 || raw.depth > 250 || raw.nodes < 0 || raw.timeMs < 0) return null;
  const pv = legalLine(built.value, raw.pv);
  if (pv.length === 0) return null;
  const alternatives = Array.isArray(raw.alternatives)
    ? raw.alternatives.flatMap((line) => {
        const lineScore = score(line?.score);
        const linePv = legalLine(built.value, line?.pv);
        return lineScore && linePv.length > 0 ? [{ score: lineScore, pv: linePv }] : [];
      })
    : [];
  return {
    positionKey: positionKey(built.value.fen),
    fen: built.value.fen,
    engine,
    depth: Math.round(raw.depth),
    nodes: Math.round(raw.nodes),
    timeMs: Math.round(raw.timeMs),
    score: main,
    pv,
    ...(alternatives.length ? { alternatives: alternatives.slice(0, 8) } : {}),
    analysedAt: raw.analysedAt,
  };
}

/** `kingfisher-evaluations-2026-09-24.json` */
export const evaluationsFileName = (exportedAt: number): string =>
  `kingfisher-evaluations-${new Date(exportedAt).toISOString().slice(0, 10)}.json`;
