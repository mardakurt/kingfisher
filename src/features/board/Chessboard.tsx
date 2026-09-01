'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Brush, Shape } from '@/chess/annotations';
import { boardSquares, squareColor } from '@/chess/board';
import { parseFen } from '@/chess/fen';
import { FILES, RANKS } from '@/chess/types';
import type { Color, Fen, Piece, PromotionPiece, Square } from '@/chess/types';
import { cn } from '@/lib/cn';

import { BoardShapes } from './BoardShapes';
import {
  EMPTY_TRACKER,
  squareFromPoint,
  squareOffset,
  trackPieces,
  type TrackerState,
} from './layout';
import { PieceIcon, pieceLabel } from './pieces';
import { boardTheme, boardThemeVariables } from './themes';
import type { ChessboardProps } from './types';

/**
 * What the pointer is currently doing.
 *
 * Held in a ref rather than in state because press and release can happen in
 * the same tick — a fast click, or any touch tap — and a state value read on
 * release would still be the value from before the press. Getting this wrong
 * makes a single click play its move twice.
 */
type Interaction =
  | { readonly kind: 'select'; readonly from: Square }
  | { readonly kind: 'shape'; readonly from: Square; readonly brush: Brush }
  | { readonly kind: 'done' };

interface DragState {
  readonly from: Square;
  readonly piece: Piece;
  readonly x: number;
  readonly y: number;
  /** The board's box, captured on press, so rendering never reads the DOM. */
  readonly rect: { left: number; top: number; size: number };
}

interface ShapeDraft {
  readonly from: Square;
  readonly to: Square;
  readonly brush: Brush;
}

interface PendingPromotion {
  readonly from: Square;
  readonly to: Square;
}

const PROMOTION_ORDER: readonly PromotionPiece[] = ['q', 'n', 'r', 'b'];

/** Modifier keys pick the annotation colour, as in every board annotation tool. */
function brushFor(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean }): Brush {
  if (event.shiftKey && event.altKey) return 'yellow';
  if (event.shiftKey) return 'red';
  if (event.altKey || event.ctrlKey) return 'blue';
  return 'green';
}

export function Chessboard({
  fen,
  orientation,
  lastMove = null,
  checkSquare = null,
  destinations,
  onMove,
  isPromotion,
  promotionColor,
  shapes = [],
  onShapeToggle,
  onShapesClear,
  theme,
  pieceSet,
  coordinates = 'inside',
  animationMs = 130,
  emphasis = [],
  className,
}: ChessboardProps) {
  const outsideCoordinates = coordinates === 'outside';
  const insideCoordinates = coordinates === 'inside';
  const boardRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const selectedRef = useRef<Square | null>(null);

  const [selected, setSelectedState] = useState<Square | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  /** Keep the ref and the rendered value in step; handlers read the ref. */
  const select = useCallback((square: Square | null) => {
    selectedRef.current = square;
    setSelectedState(square);
  }, []);

  const parsed = useMemo(() => parseFen(fen), [fen]);
  const board = parsed.ok ? parsed.value.board : null;

  /**
   * Piece identity is carried across positions so a move animates instead of
   * the piece disappearing and reappearing. It is state derived from a prop,
   * adjusted during render rather than in an effect — an effect would paint one
   * frame with the pieces in the wrong place first.
   */
  const [layout, setLayout] = useState<{ fen: Fen; tracker: TrackerState }>(() => {
    const initial = parseFen(fen);
    return {
      fen,
      tracker: initial.ok ? trackPieces(EMPTY_TRACKER, initial.value.board, null) : EMPTY_TRACKER,
    };
  });

  if (layout.fen !== fen && board) {
    setLayout({ fen, tracker: trackPieces(layout.tracker, board, lastMove) });
    if (drag) setDrag(null);
    if (pendingPromotion) setPendingPromotion(null);
  }

  const squares = useMemo(() => boardSquares(orientation), [orientation]);

  /**
   * A selection made in a previous position is simply not a selection any more.
   * Validating it here — rather than clearing it when the position changes —
   * means no state has to be reset in render, and a stale selection can never
   * produce a move: every use goes through the current destinations map.
   */
  const activeSelection = selected && destinations?.has(selected) ? selected : null;

  const pointToSquare = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const element = boardRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return squareFromPoint(
        (clientX - rect.left) / rect.width,
        (clientY - rect.top) / rect.height,
        orientation,
      );
    },
    [orientation],
  );

  const isLegalTarget = useCallback(
    (from: Square, to: Square): boolean => destinations?.get(from)?.includes(to) ?? false,
    [destinations],
  );

  /**
   * The board never reports an illegal move: legality is rechecked against the
   * destinations of the position currently rendered, so a click that races a
   * position change is dropped instead of becoming a rejected intent.
   */
  const commitMove = useCallback(
    (from: Square, to: Square) => {
      select(null);
      if (!isLegalTarget(from, to)) return;
      if (isPromotion?.(from, to)) {
        setPendingPromotion({ from, to });
        return;
      }
      onMove?.({ from, to });
    },
    [isLegalTarget, isPromotion, onMove, select],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pendingPromotion) return;
      const square = pointToSquare(event.clientX, event.clientY);
      if (!square) return;

      // The right button draws annotations rather than moving pieces.
      if (event.button === 2) {
        event.preventDefault();
        const brush = brushFor(event);
        interactionRef.current = { kind: 'shape', from: square, brush };
        setShapeDraft({ from: square, to: square, brush });
        boardRef.current?.setPointerCapture(event.pointerId);
        return;
      }
      if (event.button !== 0) return;

      if (shapes.length > 0 && onShapesClear) onShapesClear();

      const origin = selectedRef.current;
      if (origin && isLegalTarget(origin, square)) {
        interactionRef.current = { kind: 'done' };
        commitMove(origin, square);
        return;
      }

      const piece = board?.[squareIndexOf(square)] ?? null;
      if (piece && (destinations?.get(square)?.length ?? 0) > 0) {
        const box = boardRef.current?.getBoundingClientRect();
        interactionRef.current = { kind: 'select', from: square };
        select(square);
        setDrag({
          from: square,
          piece,
          x: event.clientX,
          y: event.clientY,
          rect: box
            ? { left: box.left, top: box.top, size: box.width / 8 }
            : { left: 0, top: 0, size: 0 },
        });
        boardRef.current?.setPointerCapture(event.pointerId);
        return;
      }

      interactionRef.current = { kind: 'done' };
      select(null);
    },
    [
      board,
      commitMove,
      destinations,
      isLegalTarget,
      onShapesClear,
      pendingPromotion,
      pointToSquare,
      select,
      shapes.length,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      if (interaction.kind === 'select') {
        setDrag((current) =>
          current ? { ...current, x: event.clientX, y: event.clientY } : current,
        );
        return;
      }
      if (interaction.kind === 'shape') {
        const square = pointToSquare(event.clientX, event.clientY);
        if (!square) return;
        setShapeDraft((current) =>
          current && current.to !== square ? { ...current, to: square } : current,
        );
      }
    },
    [pointToSquare],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current;
      interactionRef.current = null;
      if (!interaction) return;

      const square = pointToSquare(event.clientX, event.clientY);

      if (interaction.kind === 'shape') {
        const target = square ?? interaction.from;
        const shape: Shape =
          target === interaction.from
            ? { kind: 'square', square: interaction.from, brush: interaction.brush }
            : { kind: 'arrow', from: interaction.from, to: target, brush: interaction.brush };
        setShapeDraft(null);
        onShapeToggle?.(shape);
        return;
      }

      if (interaction.kind !== 'select') return;

      setDrag(null);
      // Releasing on the origin square keeps the piece selected, which is what
      // makes click-to-move and drag-to-move the same gesture.
      if (!square || square === interaction.from) return;
      commitMove(interaction.from, square);
    },
    [commitMove, onShapeToggle, pointToSquare],
  );

  const handlePointerCancel = useCallback(() => {
    interactionRef.current = null;
    setDrag(null);
    setShapeDraft(null);
  }, []);

  const finishPromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const pending = pendingPromotion;
      setPendingPromotion(null);
      if (!pending || !piece) return;
      if (!isLegalTarget(pending.from, pending.to)) return;
      onMove?.({ from: pending.from, to: pending.to, promotion: piece });
    },
    [isLegalTarget, onMove, pendingPromotion],
  );

  const themeTokens = boardThemeVariables(boardTheme(theme));
  const legalTargets = activeSelection ? (destinations?.get(activeSelection) ?? []) : [];
  const emphasised = new Set(emphasis);

  if (!board) {
    return (
      <div
        className={cn(
          'flex aspect-square w-full items-center justify-center rounded-md border border-line bg-surface-2 text-sm text-secondary',
          className,
        )}
      >
        This position could not be displayed.
      </div>
    );
  }

  return (
    <div
      className={cn('relative aspect-square w-full touch-none select-none', className)}
      style={themeTokens as React.CSSProperties}
    >
      {/*
        Outside coordinates live in gutters on the root, and the board area is
        inset by the same amount. The board element's own box is therefore
        untouched, so pointer-to-square mapping needs no adjustment at all.
      */}
      {outsideCoordinates && <OutsideCoordinates orientation={orientation} />}

      <div
        className="absolute"
        style={
          outsideCoordinates ? { left: GUTTER, right: 0, top: 0, bottom: GUTTER } : { inset: 0 }
        }
      >
        <div
          ref={boardRef}
          className="absolute inset-0 grid grid-cols-8 grid-rows-8 overflow-hidden rounded-[3px] shadow-[0_2px_18px_rgba(0,0,0,0.28)] ring-1 ring-black/25"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          role="grid"
          aria-label="Chessboard"
        >
          {squares.map((square, index) => {
            const light = squareColor(square) === 'light';
            const isLastMove = lastMove?.from === square || lastMove?.to === square;
            const isTarget = legalTargets.includes(square);
            const squarePiece = board[squareIndexOf(square)] ?? null;
            const occupied = squarePiece != null;
            const canSelect = (destinations?.get(square)?.length ?? 0) > 0;
            const showFile = insideCoordinates && index >= 56;
            const showRank = insideCoordinates && index % 8 === 0;

            return (
              <div
                key={square}
                className={cn('relative', (canSelect || isTarget) && 'cursor-pointer')}
                style={{ background: light ? 'var(--square-light)' : 'var(--square-dark)' }}
                role="gridcell"
                aria-label={
                  squarePiece ? `${square}, ${pieceLabel(squarePiece)}` : `${square}, empty`
                }
              >
                {isLastMove && (
                  <div
                    className="absolute inset-0"
                    style={{ background: 'var(--square-last-move)' }}
                  />
                )}
                {activeSelection === square && (
                  <div
                    className="absolute inset-0"
                    style={{ background: 'var(--square-selected)' }}
                  />
                )}
                {emphasised.has(square) && (
                  <div className="absolute inset-0 ring-2 ring-inset ring-[var(--accent)]/70" />
                )}
                {checkSquare === square && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 50%, var(--square-check) 0%, color-mix(in srgb, var(--square-check) 55%, transparent) 42%, transparent 72%)',
                    }}
                  />
                )}
                {isTarget &&
                  (occupied ? (
                    <div
                      className="absolute inset-0 rounded-[2px] border-[5px]"
                      style={{ borderColor: 'var(--square-legal)' }}
                    />
                  ) : (
                    <div
                      className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ background: 'var(--square-legal)' }}
                    />
                  ))}

                {showRank && (
                  <span
                    className="pointer-events-none absolute left-[3px] top-[1px] text-[9px] font-medium leading-none tabular"
                    style={{ color: light ? 'var(--coord-on-light)' : 'var(--coord-on-dark)' }}
                  >
                    {square[1]}
                  </span>
                )}
                {showFile && (
                  <span
                    className="pointer-events-none absolute bottom-[1px] right-[3px] text-[9px] font-medium leading-none"
                    style={{ color: light ? 'var(--coord-on-light)' : 'var(--coord-on-dark)' }}
                  >
                    {square[0]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {layout.tracker.pieces.map(({ key, piece, square }) => {
            const dragging = drag?.from === square;
            const offset = squareOffset(square, orientation);
            const style: React.CSSProperties = dragging
              ? dragStyle(drag)
              : {
                  transform: `translate(${offset.x}%, ${offset.y}%)`,
                  transition:
                    animationMs > 0
                      ? `transform ${animationMs}ms cubic-bezier(0.2, 0.8, 0.3, 1)`
                      : undefined,
                };

            return (
              <div
                key={key}
                className="absolute left-0 top-0 h-[12.5%] w-[12.5%]"
                style={{ ...style, zIndex: dragging ? 30 : 10 }}
              >
                <PieceIcon
                  piece={piece}
                  set={pieceSet}
                  className={cn('h-full w-full p-[6%]', dragging && 'scale-[1.08] drop-shadow-lg')}
                />
              </div>
            );
          })}
        </div>

        <BoardShapes
          shapes={shapes}
          draft={
            shapeDraft
              ? shapeDraft.from === shapeDraft.to
                ? { kind: 'square', square: shapeDraft.from, brush: shapeDraft.brush }
                : {
                    kind: 'arrow',
                    from: shapeDraft.from,
                    to: shapeDraft.to,
                    brush: shapeDraft.brush,
                  }
              : null
          }
          orientation={orientation}
        />

        {pendingPromotion && (
          <PromotionPicker
            square={pendingPromotion.to}
            orientation={orientation}
            color={promotionColor ?? 'w'}
            pieceSet={pieceSet}
            onChoose={finishPromotion}
          />
        )}
      </div>
    </div>
  );
}

/** Width of the coordinate gutters, in pixels, when they sit outside the board. */
const GUTTER = 15;

/**
 * Labels always name the real square, so they follow the board when it is
 * flipped. There is deliberately no "always from White's side" option: it would
 * print `a1` under what is actually `h8`, which is not a preference, it is a
 * bug with a settings toggle.
 */
function OutsideCoordinates({ orientation }: { readonly orientation: Color }) {
  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'w' ? [...RANKS].reverse() : RANKS;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 text-tertiary">
      <div
        className="absolute left-0 top-0 flex flex-col"
        style={{ width: GUTTER, bottom: GUTTER }}
      >
        {ranks.map((rank) => (
          <span
            key={rank}
            className="flex flex-1 items-center justify-center text-[9px] font-medium leading-none tabular"
          >
            {rank}
          </span>
        ))}
      </div>
      <div className="absolute bottom-0 right-0 flex" style={{ height: GUTTER, left: GUTTER }}>
        {files.map((file) => (
          <span
            key={file}
            className="flex flex-1 items-center justify-center text-[9px] font-medium leading-none"
          >
            {file}
          </span>
        ))}
      </div>
    </div>
  );
}

function dragStyle(drag: DragState): React.CSSProperties {
  const { left, top, size } = drag.rect;
  if (size === 0) return {};
  return {
    transform: `translate(${drag.x - left - size / 2}px, ${drag.y - top - size / 2}px)`,
    transition: 'none',
  };
}

interface PromotionPickerProps {
  readonly square: Square;
  readonly orientation: Color;
  readonly color: Color;
  readonly pieceSet: ChessboardProps['pieceSet'];
  readonly onChoose: (piece: PromotionPiece | null) => void;
}

function PromotionPicker({ square, orientation, color, pieceSet, onChoose }: PromotionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const { x, y } = squareOffset(square, orientation);
  const downwards = y < 400;

  useEffect(() => {
    pickerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 bg-black/45 animate-fade-in"
      onPointerDown={(event) => {
        event.stopPropagation();
        onChoose(null);
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onChoose(null);
        }
      }}
    >
      <div
        ref={pickerRef}
        role="dialog"
        aria-modal
        aria-label="Choose promotion piece"
        className="absolute flex w-[12.5%] flex-col overflow-hidden rounded-[3px] border border-line-strong bg-surface-1 shadow-xl"
        style={{
          left: `${x / 8}%`,
          [downwards ? 'top' : 'bottom']: `${downwards ? y / 8 : (700 - y) / 8}%`,
          flexDirection: downwards ? 'column' : 'column-reverse',
        }}
      >
        {PROMOTION_ORDER.map((type) => (
          <button
            key={type}
            type="button"
            className="aspect-square w-full bg-surface-2 transition-colors hover:bg-accent-muted"
            onPointerDown={(event) => {
              event.stopPropagation();
              onChoose(type);
            }}
            aria-label={`Promote to ${PROMOTION_NAMES[type]}`}
          >
            <PieceIcon piece={{ color, type }} set={pieceSet} className="h-full w-full p-[10%]" />
          </button>
        ))}
      </div>
    </div>
  );
}

const PROMOTION_NAMES: Record<PromotionPiece, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

const squareIndexOf = (square: Square): number =>
  (square.charCodeAt(1) - 49) * 8 + (square.charCodeAt(0) - 97);
