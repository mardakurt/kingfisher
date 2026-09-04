'use client';

import { useMemo, useState } from 'react';

import { boardSquares, squareAt, squareIndex } from '@/chess/board';
import { START_FEN } from '@/chess/fen';
import type { Piece, PieceType, Square } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PieceLayer, SquareLayer, type PlacedPieceView } from '@/features/board/BoardLayers';
import { PieceIcon } from '@/features/board/pieces';
import { boardTheme, boardThemeVariables } from '@/features/board/themes';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import {
  clearSetup,
  setupFen,
  setupFromFen,
  startingSetup,
  validateSetup,
  withPiece,
  type PositionSetupState,
} from './model';

type Tool = Piece | 'erase';
const PIECES: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export function PositionSetupDialog() {
  const open = useUi((state) => state.positionSetupOpen);
  const setOpen = useUi((state) => state.setPositionSetupOpen);
  const notify = useUi((state) => state.notify);
  const currentFen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? START_FEN);
  const loadFen = useAnalysis((state) => state.loadFen);
  const theme = usePreferences((state) => state.boardTheme);
  const pieceSet = usePreferences((state) => state.pieceSet);
  const [state, setState] = useState<PositionSetupState>(
    () => setupFromFen(currentFen).state ?? startingSetup(),
  );
  const [tool, setTool] = useState<Tool>({ color: 'w', type: 'q' });
  const [fenText, setFenText] = useState<string>(() => currentFen);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const validation = useMemo(() => validateSetup(state), [state]);
  const squares = useMemo(() => boardSquares('w'), []);
  const pieces = useMemo<readonly PlacedPieceView[]>(
    () =>
      state.board.flatMap((piece, index) =>
        piece ? [{ key: squareAt(index), square: squareAt(index), piece }] : [],
      ),
    [state.board],
  );

  const replace = (next: PositionSetupState) => {
    setState(next);
    setFenText(setupFen(next));
    setPasteError(null);
  };
  const place = (square: Square, nextTool: Tool = tool) =>
    replace(withPiece(state, square, nextTool === 'erase' ? null : nextTool));

  const paste = () => {
    const parsed = setupFromFen(fenText);
    if (!parsed.ok) {
      setPasteError(parsed.message);
      return;
    }
    replace(parsed.state);
  };

  const apply = () => {
    if (!validation.ok) return;
    const result = loadFen(validation.fen);
    if (!result.ok) {
      notify({
        tone: 'error',
        message: 'The position could not be applied.',
        detail: result.error.message,
      });
      return;
    }
    setOpen(false);
    notify({ tone: 'success', message: 'Position applied to Analysis.' });
  };

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Set up position"
      description="Build a legal position with the same pieces and rules used by the analysis board."
      width="w-[880px]"
      footer={
        <>
          <Button variant="subtle" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="accent" onClick={apply} disabled={!validation.ok}>
            Apply position
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(300px,460px)_minmax(260px,1fr)]">
        <div>
          <div
            className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-board)] border border-line-strong shadow-[var(--shadow-panel)]"
            style={boardThemeVariables(boardTheme(theme))}
            data-position-setup-board
          >
            <SquareLayer
              squares={squares}
              className="absolute inset-0"
              cell={(square) => {
                const piece = state.board[squareIndex(square)];
                return (
                  <button
                    type="button"
                    draggable={Boolean(piece)}
                    aria-label={`${square}, ${piece ? `${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : 'empty'}`}
                    onClick={() => place(square)}
                    onDragStart={(event) => {
                      if (!piece) return;
                      event.dataTransfer.setData(
                        'application/x-kingfisher-piece',
                        JSON.stringify({ piece, from: square }),
                      );
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const raw = event.dataTransfer.getData('application/x-kingfisher-piece');
                      if (!raw) return;
                      const dropped = JSON.parse(raw) as { piece: Piece; from?: Square };
                      let next = state;
                      if (dropped.from) next = withPiece(next, dropped.from, null);
                      replace(withPiece(next, square, dropped.piece));
                    }}
                    className="absolute inset-0 z-20 focus-visible:outline-offset-[-3px]"
                  />
                );
              }}
            />
            <PieceLayer pieces={pieces} orientation="w" pieceSet={pieceSet} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-tertiary">
            Choose a piece and click a square, or drag a piece between squares. Choose Erase to
            remove pieces.
          </p>
        </div>

        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold text-primary">Pieces</h3>
            {(['w', 'b'] as const).map((color) => (
              <div key={color} className="mb-1.5 flex gap-1">
                {PIECES.map((type) => {
                  const piece: Piece = { color, type };
                  const selected = tool !== 'erase' && tool.color === color && tool.type === type;
                  return (
                    <button
                      key={`${color}${type}`}
                      type="button"
                      draggable
                      aria-label={`Place ${color === 'w' ? 'white' : 'black'} ${type}`}
                      aria-pressed={selected}
                      onClick={() => setTool(piece)}
                      onDragStart={(event) =>
                        event.dataTransfer.setData(
                          'application/x-kingfisher-piece',
                          JSON.stringify({ piece }),
                        )
                      }
                      className={`size-10 rounded-[var(--radius-control)] border p-1 ${selected ? 'border-accent bg-accent-muted' : 'border-line bg-surface-2 hover:border-line-strong'}`}
                    >
                      <PieceIcon piece={piece} set={pieceSet} decorative />
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="mt-2 flex gap-2">
              <Button variant="subtle" active={tool === 'erase'} onClick={() => setTool('erase')}>
                Erase
              </Button>
              <Button variant="subtle" onClick={() => replace(clearSetup())}>
                Clear board
              </Button>
              <Button variant="subtle" onClick={() => replace(startingSetup())}>
                Starting position
              </Button>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 border-t border-line-subtle pt-3">
            <label className="text-xs text-tertiary">
              Side to move
              <select
                aria-label="Side to move"
                value={state.turn}
                onChange={(event) =>
                  replace({ ...state, turn: event.target.value as 'w' | 'b', epSquare: null })
                }
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-sm text-primary"
              >
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </label>
            <label className="text-xs text-tertiary">
              En passant
              <input
                aria-label="En passant square"
                value={state.epSquare ?? '-'}
                onChange={(event) =>
                  replace({
                    ...state,
                    epSquare: event.target.value === '-' ? null : (event.target.value as Square),
                  })
                }
                className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 font-mono text-sm text-primary"
              />
            </label>
          </section>

          <fieldset className="border-t border-line-subtle pt-3">
            <legend className="text-xs font-semibold text-primary">Castling rights</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-secondary">
              {(
                [
                  ['whiteKing', 'White O-O'],
                  ['whiteQueen', 'White O-O-O'],
                  ['blackKing', 'Black O-O'],
                  ['blackQueen', 'Black O-O-O'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={state[key]}
                    onChange={(event) => replace({ ...state, [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <details className="border-t border-line-subtle pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-primary">
              Move counters
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="text-xs text-tertiary">
                Halfmove
                <input
                  aria-label="Halfmove clock"
                  type="number"
                  min="0"
                  value={state.halfmoveClock}
                  onChange={(event) =>
                    replace({ ...state, halfmoveClock: Number(event.target.value) })
                  }
                  className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
                />
              </label>
              <label className="text-xs text-tertiary">
                Fullmove
                <input
                  aria-label="Fullmove number"
                  type="number"
                  min="1"
                  value={state.fullmoveNumber}
                  onChange={(event) =>
                    replace({ ...state, fullmoveNumber: Number(event.target.value) })
                  }
                  className="mt-1 h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-primary"
                />
              </label>
            </div>
          </details>

          <section className="border-t border-line-subtle pt-3">
            <label className="text-xs text-tertiary">
              FEN
              <textarea
                aria-label="Position FEN"
                value={fenText}
                onChange={(event) => setFenText(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-[var(--radius-control)] border border-line bg-surface-inset p-2 font-mono text-xs leading-relaxed text-primary"
              />
            </label>
            <Button variant="subtle" onClick={paste}>
              Load FEN
            </Button>
          </section>

          <p
            role="status"
            className={`text-xs leading-relaxed ${validation.ok && !pasteError ? 'text-positive' : 'text-negative'}`}
          >
            {pasteError ?? (validation.ok ? 'Legal position. Ready to apply.' : validation.message)}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
