/**
 * Borrowing the board's moves without moving the board.
 *
 * Review's decision journal asks for the moves the player considered. Until
 * Phase 52 it asked on a second, 210-pixel board inside the dock — a board
 * beside the board, showing the same position at a third of the size, which
 * the owner read as a layout fault, and which was one: the position was
 * already on screen at full size with every move the person could want to
 * play on it. The journal now borrows the canonical board instead. While a
 * capture is active a move played there is handed to the capturer and the
 * board stays where it is; the capturer draws what it has recorded back on
 * the same board as shapes.
 *
 * One capture at a time, held here rather than threaded through props, so
 * the surface that renders the board and the tool in the dock that wants
 * its moves need not know about each other. The capture is cleared by the
 * tool that set it; a tool that unmounts without clearing would leave the
 * board mute, so the setter returns the release function and the tool's
 * effect returns it.
 */

import { create } from 'zustand';

import type { Shape } from '@/chess/annotations';
import type { San, Square, Uci } from '@/chess/types';

export interface CapturedMove {
  readonly uci: Uci;
  readonly san: San;
  readonly from: Square;
  readonly to: Square;
}

export interface BoardMoveCapture {
  /** Called with a legal move the person played. The board does not move. */
  readonly onMove: (move: CapturedMove) => void;
  /** Drawn over the board while the capture is active. */
  readonly shapes: readonly Shape[];
  /** What the board is doing, shown under it so a move that does not play is explained. */
  readonly label: string;
}

interface BoardMoveCaptureState {
  readonly capture: BoardMoveCapture | null;
  /** Install a capture; returns the function that removes exactly this one. */
  readonly set: (capture: BoardMoveCapture) => () => void;
}

export const useBoardMoveCapture = create<BoardMoveCaptureState>((set, get) => ({
  capture: null,
  set: (capture) => {
    set({ capture });
    return () => {
      if (get().capture === capture) set({ capture: null });
    };
  },
}));
