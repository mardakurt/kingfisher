/**
 * English descriptive notation, as the chess books of Capablanca's time
 * printed it: `P - Q 4`, `Kt - K B 3`, `B x B`, `K R - Kt 1`, `Q x Q P`,
 * `O - O`. (Phase 85: a public-domain annotated set is transcribed from such
 * books.)
 *
 * Descriptive notation names squares from the mover's side of the board and
 * leaves out whatever the writer thought obvious — `Kt 5` does not say which
 * knight file, `B x B` does not say which bishop takes which. So a move is not
 * *translated*; it is *resolved*: every legal move in the position is tested
 * against what the text says, and the text is accepted only when exactly one
 * legal move fits. Two candidates is an ambiguity the text did not resolve,
 * and is refused — a transcription that guessed would be a legal, plausible,
 * wrong move, the one failure this project refuses everywhere.
 *
 * Pure, over `Position`'s legal moves; no rules of its own.
 */

import { Position } from './position';
import { err, fail, ok, type Result } from './result';
import type { ChessMove, Color, PieceType, Square } from './types';

const PIECES: Readonly<Record<string, PieceType>> = {
  P: 'p',
  KT: 'n',
  N: 'n',
  B: 'b',
  R: 'r',
  Q: 'q',
  K: 'k',
};

/** File letters a descriptive file name can mean: `B` alone is either bishop's file. */
const FILES: Readonly<Record<string, readonly string[]>> = {
  QR: ['a'],
  QKT: ['b'],
  QN: ['b'],
  QB: ['c'],
  Q: ['d'],
  K: ['e'],
  KB: ['f'],
  KKT: ['g'],
  KN: ['g'],
  KR: ['h'],
  R: ['a', 'h'],
  KT: ['b', 'g'],
  N: ['b', 'g'],
  B: ['c', 'f'],
};

const rankFor = (colour: Color, rank: number): number => (colour === 'w' ? rank : 9 - rank);

/** The squares a descriptive square (`Q B 3`, `Kt 5`) can name, for the side to move. */
function squaresOf(words: readonly string[], colour: Color): Square[] | null {
  const last = words[words.length - 1];
  if (!last || !/^[1-8]$/.test(last)) return null;
  const files = FILES[words.slice(0, -1).join('')];
  if (!files) return null;
  const rank = rankFor(colour, Number(last));
  return files.map((file) => `${file}${rank}` as Square);
}

/** The piece a capture target names (`B`, `Q P`, `K Kt P`), and the files its pawn may stand on. */
function capturedOf(
  words: readonly string[],
): { type: PieceType; files: readonly string[] | null } | null {
  if (words.length === 0) return null;
  const last = words[words.length - 1]!;
  const type = PIECES[last];
  if (!type) return null;
  if (words.length === 1) return { type, files: null };
  // `Q B P` is the pawn on the queen's bishop's file; `K Kt` is the king's knight.
  const files = FILES[words.slice(0, -1).join('')];
  return files ? { type, files } : null;
}

/** What the printed text says beyond the move: a check, and the author's `!`/`?`. */
export interface DescriptiveMarks {
  readonly check: 'check' | 'mate' | 'none';
  readonly annotation: string | null;
}

export function marksOf(text: string): DescriptiveMarks {
  const upper = text.toUpperCase();
  const check = /\bMATE\b/.test(upper) ? 'mate' : /\bCH\b|\+/.test(upper) ? 'check' : 'none';
  const annotation = /(!!|\?\?|!\?|\?!|!|\?)\s*$/.exec(text.trim())?.[1] ?? null;
  return { check, annotation };
}

const spaced = (text: string): string => text.replace(/([A-Z])(\d)/g, '$1 $2');

/**
 * Every legal move in `position` the text can mean. Nothing here guesses: the
 * list is whatever fits, and deciding among several is the caller's business
 * (`resolveDescriptive` refuses; `transcribeDescriptive` asks the rest of the
 * game). A misprint that fits nothing is an empty list; text that is not a
 * move at all is an error.
 */
export function descriptiveCandidates(
  position: Position,
  text: string,
  origins?: ReadonlyMap<Square, Square>,
): Result<readonly ChessMove[]> {
  const colour = position.turn;
  const marks = marksOf(text);
  let raw = spaced(
    text
      .toUpperCase()
      .replace(/\b(DIS\.? ?CH|DBL\.? ?CH|CH|MATE)\b\.?/g, ' ')
      .replace(/\bE\.\s*P\.?/g, ' ')
      .replace(/[!?+#,;]/g, ' ')
      .replace(/\.(?!\d)/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  let promotion: PieceType | null = null;
  const promoted = /\((Q|R|B|KT|N)\)|=\s*(Q|R|B|KT|N)\b/.exec(raw);
  if (promoted) {
    promotion = PIECES[(promoted[1] ?? promoted[2])!] ?? null;
    raw = raw.replace(promoted[0], ' ').trim();
  }
  const legal = position.legalMoves();
  const checked = (moves: readonly ChessMove[]) =>
    moves.filter((move) =>
      marks.check === 'mate'
        ? move.san.endsWith('#')
        : marks.check === 'check'
          ? /[+#]$/.test(move.san)
          : !/[+#]$/.test(move.san),
    );

  const compact = raw.replace(/\s+/g, '');
  if (/^(O|0)-(O|0)-(O|0)$/.test(compact)) {
    return ok(checked(legal.filter((move) => move.flags.queensideCastle)));
  }
  if (/^(O|0)-(O|0)$/.test(compact)) {
    return ok(checked(legal.filter((move) => move.flags.kingsideCastle)));
  }

  // `R (Q 2) - K 2`, `Kt x P (B 3)`: a square in brackets says where the
  // piece stands (on the left) or where the capture is made (on the right).
  let fromSquares: Square[] | null = null;
  let toSquares: Square[] | null = null;
  const bracket = /\(([A-Z ]+ \d)\)/g;
  for (const found of [...raw.matchAll(bracket)]) {
    const squares = squaresOf(found[1]!.trim().split(' '), colour);
    if (!squares) return fail('invalid-san', `"${text}" has a square in brackets that is not one.`);
    const before = raw.slice(0, found.index);
    if (/X|-/.test(before)) toSquares = squares;
    else fromSquares = squares;
  }
  raw = raw.replace(bracket, ' ').replace(/\s+/g, ' ').trim();

  // A dropped hyphen (`P K 4`, a misprint in more than one old book) is read
  // as the one split into piece and square that parses; there is at most one.
  if (!raw.includes('-') && !raw.includes('X')) {
    const words = raw.split(' ');
    for (let at = 1; at < words.length; at += 1) {
      if (PIECES[words[at - 1]!] && squaresOf(words.slice(at), colour)) {
        raw = `${words.slice(0, at).join(' ')} - ${words.slice(at).join(' ')}`;
        break;
      }
    }
  }
  const capture = raw.includes('X');
  const [left = '', right = ''] = raw.split(capture ? /\s*X\s*/ : /\s*-\s*/);
  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);
  if (leftWords.length === 0 || (rightWords.length === 0 && !toSquares)) {
    return fail('invalid-san', `"${text}" is not a descriptive move.`);
  }

  const moverType = PIECES[leftWords[leftWords.length - 1]!];
  if (!moverType) return fail('invalid-san', `"${text}" does not name the piece that moves.`);
  // `K R`, `Q Kt`, `Q B P`: the side or file the moving piece belongs to.
  const qualifier = leftWords.slice(0, -1).join('');

  let candidates = legal.filter((move) => move.piece === moverType);
  if (promotion) candidates = candidates.filter((move) => move.promotion === promotion);
  else candidates = candidates.filter((move) => !move.promotion || move.promotion === 'q');
  if (fromSquares) candidates = candidates.filter((move) => fromSquares!.includes(move.from));
  if (toSquares) candidates = candidates.filter((move) => toSquares!.includes(move.to));

  if (capture) {
    const target = capturedOf(rightWords);
    if (!target) return fail('invalid-san', `"${text}" does not name what is taken.`);
    candidates = candidates.filter((move) => move.flags.capture && move.captured === target.type);
    if (target.files) candidates = candidates.filter((move) => target.files!.includes(move.to[0]!));
  } else {
    const squares = squaresOf(rightWords, colour);
    if (!squares) return fail('invalid-san', `"${text}" does not name a square.`);
    candidates = candidates.filter((move) => !move.flags.capture && squares.includes(move.to));
  }

  if (qualifier) {
    // A pawn is named by the file it stands on (`Q B P`); a piece by the side
    // of the board it began on (`K R`, `Q Kt`) or its own starting file
    // (`K Kt`), which is why the caller tracks where each piece came from.
    const files = FILES[qualifier];
    const side = qualifier === 'K' ? 'efgh' : qualifier === 'Q' ? 'abcd' : null;
    candidates = candidates.filter((move) => {
      if (moverType === 'p') return files ? files.includes(move.from[0]!) : false;
      const home = (origins?.get(move.from) ?? move.from)[0]!;
      if (side) return side.includes(home);
      return files ? files.includes(home) : false;
    });
  }
  return ok(checked(candidates));
}

/**
 * The one legal move the text names in `fen`, or why there is not exactly one.
 * A book marks every check (`ch`), so a move printed without one does not
 * give check, and one printed with it does.
 */
export function resolveDescriptive(
  fen: string,
  text: string,
  origins?: ReadonlyMap<Square, Square>,
): Result<ChessMove> {
  const built = Position.fromFen(fen);
  if (!built.ok) return built;
  const candidates = descriptiveCandidates(built.value, text, origins);
  if (!candidates.ok) return candidates;
  return only(candidates.value, text);
}

function only(candidates: readonly ChessMove[], text: string): Result<ChessMove> {
  if (candidates.length === 1) return ok(candidates[0]!);
  if (candidates.length === 0) return fail('illegal-move', `No legal move is "${text}".`);
  return fail(
    'illegal-move',
    `"${text}" fits ${candidates.length} legal moves (${candidates.map((move) => move.san).join(', ')}); the text does not say which.`,
  );
}

export interface TranscribedMove {
  /** The book's text, as printed. */
  readonly text: string;
  readonly move: ChessMove;
  /** The author's `!` or `?`, when printed. */
  readonly annotation: string | null;
  /**
   * The other legal moves the text alone could have meant, each of which
   * left some later move of the score with nothing to name. Empty when the
   * text named this move by itself.
   */
  readonly excluded: readonly string[];
}

export interface TranscriptionFailure {
  readonly index: number;
  readonly text: string;
  readonly message: string;
}

const EXPLORATION_LIMIT = 20_000;

/**
 * A whole game in descriptive notation, resolved from `startFen` (the initial
 * position when omitted).
 *
 * Each piece's starting square is followed through the game, so `K R` still
 * means the king's rook after it has left the h-file. When a move's text fits
 * more than one legal move — books wrote `B - R 4` when only one bishop could
 * sensibly go there — the rest of the printed score decides: every reading is
 * followed, and the transcription is accepted only when exactly one of them
 * reaches the last printed move with every move naming a legal one. Two
 * complete readings is a score the text does not settle, and is refused with
 * the move where they part; none is a misprint, refused at the move no
 * reading got past.
 */
export function transcribeDescriptive(
  texts: readonly string[],
  startFen?: string,
): Result<readonly TranscribedMove[], TranscriptionFailure> {
  const built = startFen ? Position.fromFen(startFen) : ok(Position.initial());
  if (!built.ok) {
    return err({ index: -1, text: startFen ?? '', message: built.error.message });
  }
  const origins = new Map<Square, Square>();
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}` as Square;
      if (built.value.pieceAt(square)) origins.set(square, square);
    }
  }

  const complete: TranscribedMove[][] = [];
  let deepest: TranscriptionFailure = { index: 0, text: texts[0] ?? '', message: 'No moves.' };
  let explored = 0;
  const path: TranscribedMove[] = [];

  const walk = (position: Position, homes: Map<Square, Square>, index: number): void => {
    if (complete.length > 1 || explored > EXPLORATION_LIMIT) return;
    explored += 1;
    if (index === texts.length) {
      complete.push([...path]);
      return;
    }
    const text = texts[index]!;
    const found = descriptiveCandidates(position, text, homes);
    if (!found.ok || found.value.length === 0) {
      if (index >= deepest.index) {
        deepest = {
          index,
          text,
          message: found.ok ? `No legal move is "${text}".` : found.error.message,
        };
      }
      return;
    }
    const annotation = marksOf(text).annotation;
    for (const move of found.value) {
      const next = new Map(homes);
      const home = next.get(move.from) ?? move.from;
      next.delete(move.from);
      next.set(move.to, home);
      if (move.flags.kingsideCastle || move.flags.queensideCastle) {
        const rank = move.color === 'w' ? '1' : '8';
        const [rookFrom, rookTo] = move.flags.kingsideCastle ? ['h', 'f'] : ['a', 'd'];
        const rook = next.get(`${rookFrom}${rank}` as Square);
        next.delete(`${rookFrom}${rank}` as Square);
        if (rook) next.set(`${rookTo}${rank}` as Square, rook);
      }
      path.push({
        text,
        move,
        annotation,
        excluded: found.value.filter((other) => other !== move).map((other) => other.san),
      });
      walk(position.after(move), next, index + 1);
      path.pop();
    }
  };
  walk(built.value, origins, 0);

  if (explored > EXPLORATION_LIMIT) {
    return err({ index: 0, text: '', message: 'The score has too many readings to settle.' });
  }
  if (complete.length === 0) return err(deepest);
  if (complete.length > 1) {
    const [a, b] = complete as [TranscribedMove[], TranscribedMove[]];
    const at = a.findIndex((entry, index) => entry.move.san !== b[index]!.move.san);
    return err({
      index: at,
      text: texts[at]!,
      message: `"${texts[at]}" fits ${a[at]!.move.san} and ${b[at]!.move.san}, and the rest of the score is legal after either.`,
    });
  }
  return ok(complete[0]!);
}
