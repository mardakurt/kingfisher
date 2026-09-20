import type { AssignmentKind } from '@/persistence/domain';

/** Authored prompts, not generated chess advice. Saved as an ordinary editable brief. */
export const BRIEF_STARTERS: Readonly<Record<AssignmentKind, string>> = {
  game: `Your thinking: annotate the critical decisions before consulting an engine. Include candidate moves, calculated lines and where you felt unsure.

Check: use Stockfish to test those decisions, keeping your original thoughts and explaining what changed.

Hand in: the annotated game, one key lesson and one question for your coach.`,
  opening: `Objective: name the branch, our colour and the position we want to reach.

Investigate: compare candidate moves and test the opponent’s strongest replies. Explain the plans and flag unresolved positions; record engine checks on the board.

Hand in: a concise recommended line with the critical alternatives, practical risks and a short list of positions to rehearse. Keep exploratory analysis in a separate study.`,
  opponent: `Context: add the event, round, start time with time zone and time available for the player to review.

Evidence: name the game source, date range and time control. Separate observed choices from guesses; say when there are too few games.

Decision: agree an opening that fits the player’s repertoire. Check the likely replies and one fallback with Stockfish; explain the plans and unresolved risks.

Hand in: a short annotated board, what to remember and an estimated review time. After the game, record where play diverged and what to update.`,
  positions: `Task: state the starting position, side to move and thinking time. Calculate without an engine first and write down candidate moves and your chosen line.

Check: compare your reasoning with Stockfish afterwards and explain any missed defence.

Hand in: your variations, what you missed and one pattern to practise again.`,
  other: `Objective: what decision or skill should this work improve?

Hand in: the annotated board, your conclusion and any unresolved questions.`,
};
