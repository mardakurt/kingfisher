'use client';

/**
 * Structural facts about the position on the board.
 *
 * Every line here is countable from the diagram. There is no evaluation, no
 * advice and no adjective: "White has an isolated pawn on d4" is a fact the
 * user can check in a second, and what it is worth is their judgement to make.
 * That restraint is what makes this a fourth evidence source alongside the
 * engine, the database and the repertoire rather than a fifth opinion.
 */

import { useMemo, useState } from 'react';

import { positionFeatures, type ColorFeatures, type PositionFeatures } from '@/chess/features';
import { parseFen } from '@/chess/fen';
import { SQUARES } from '@/chess/board';
import { relationsFor } from '@/chess/relations';
import type { FenParts } from '@/chess/fen';
import type { Square } from '@/chess/types';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';

import { useAnalysisPosition } from './useAnalysisPosition';
import { StructureSearchPanel } from './StructureSearchPanel';

export function FeaturesPanel() {
  const { node } = useAnalysisPosition();
  const position = useMemo(() => {
    const parsed = parseFen(node.fen);
    return parsed.ok ? { parts: parsed.value, features: positionFeatures(parsed.value) } : null;
  }, [node.fen]);
  const features = position?.features ?? null;

  if (!features) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeader>Structure</PanelHeader>
        <PanelBody>
          <EmptyState title="This position could not be read." />
        </PanelBody>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>
        Structure
        <span className="normal-case tracking-normal">{features.pieceCount} pieces</span>
      </PanelHeader>
      <PanelBody>
        <Material features={features} />
        <div className="grid grid-cols-2 gap-px bg-line-subtle">
          <Side title="White" side={features.white} />
          <Side title="Black" side={features.black} />
        </div>
        <RelationInspector parts={position?.parts ?? null} />
        <StructureSearchPanel fen={node.fen} />
      </PanelBody>
    </div>
  );
}

function RelationInspector({ parts }: { readonly parts: FenParts | null }) {
  const occupied = useMemo(
    () => SQUARES.filter((square) => parts?.board[SQUARES.indexOf(square)]),
    [parts],
  );
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const square = selectedSquare && occupied.includes(selectedSquare) ? selectedSquare : occupied[0];

  if (!parts || !square) return null;
  const relations = relationsFor(parts, square);
  const rows: readonly (readonly [string, readonly Square[]])[] = [
    ['Attacked by', relations.attackedBy],
    ['Defended by', relations.defendedBy],
    ['Pieces attacked', relations.piecesAttacked],
    ['Pieces defended', relations.piecesDefended],
  ];

  return (
    <section className="border-b border-line-subtle px-3 py-3" aria-label="Attack relations">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-primary">Relations</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-tertiary">
            Pseudo-legal attack geometry; pins and king safety are ignored.
          </p>
        </div>
        <label className="text-[11px] text-tertiary">
          Piece
          <select
            aria-label="Relation square"
            value={square}
            onChange={(event) => setSelectedSquare(event.target.value as Square)}
            className="ml-2 h-8 rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 font-mono text-xs text-primary"
          >
            {occupied.map((candidate) => {
              const piece = parts.board[SQUARES.indexOf(candidate)];
              return (
                <option key={candidate} value={candidate}>
                  {candidate} · {piece?.color === 'w' ? 'White' : 'Black'} {pieceName(piece?.type)}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <dl className="mt-2 grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([label, squares]) => (
          <div key={label} className="contents">
            <dt className="text-tertiary">{label}</dt>
            <dd className="font-mono text-secondary">{squares.length ? squares.join(' ') : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const pieceName = (type: string | undefined): string =>
  ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[type ?? ''] ??
  'piece';

function Material({ features }: { readonly features: PositionFeatures }) {
  const { difference, balance } = features.material;
  const parts = (Object.entries(difference) as [keyof typeof difference, number][])
    .filter(([, value]) => value !== 0)
    .map(([type, value]) => `${value > 0 ? '+' : '−'}${Math.abs(value)}${type.toUpperCase()}`);

  return (
    <section className="border-b border-line-subtle px-3 py-2.5">
      <h3 className="text-[10px] uppercase tracking-wide text-tertiary">Material</h3>
      <p className="mt-1 text-[11.5px] text-secondary">
        {parts.length === 0 ? (
          'Level.'
        ) : (
          <>
            <span className="text-primary">{parts.join('  ')}</span>
            <span className="text-tertiary"> for White</span>
          </>
        )}
        {balance !== 0 ? (
          <span className="ml-2 text-tertiary tabular">
            ({balance > 0 ? '+' : ''}
            {balance} by the usual count)
          </span>
        ) : null}
      </p>
    </section>
  );
}

function Side({ title, side }: { readonly title: string; readonly side: ColorFeatures }) {
  const rows: readonly (readonly [string, string])[] = [
    ['Pawn islands', String(side.pawns.islands)],
    ['Isolated', list(side.pawns.isolated)],
    ['Doubled', list(side.pawns.doubled)],
    ['Passed', list(side.pawns.passed)],
    ['Connected passed', list(side.pawns.connectedPassed)],
    ['Backward', list(side.pawns.backward)],
    ['Open files', list(side.files.open)],
    ['Semi-open files', list(side.files.semiOpen)],
    ['Rook on open file', list(side.rooksOnOpenFiles)],
    ['Rook on semi-open', list(side.rooksOnSemiOpenFiles)],
    ['Bishop pair', side.bishopPair ? 'yes' : '—'],
    ['King', kingState(side)],
    ['Pawns near king', String(side.kingShieldPawns)],
  ];

  return (
    <div className="bg-surface-1 px-3 py-2.5">
      <h3 className="text-[10px] uppercase tracking-wide text-tertiary">{title}</h3>
      <dl className="mt-1.5 space-y-0.5 text-[10.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="min-w-0 flex-1 truncate text-tertiary">{label}</dt>
            <dd className={value === '—' ? 'text-tertiary/60' : 'text-secondary'}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const list = (values: readonly string[]): string => (values.length ? values.join(' ') : '—');

const kingState = (side: ColorFeatures): string => {
  if (side.castled) return `castled ${side.kingSquare ?? ''}`.trim();
  const rights = [side.canCastleKingside && 'O-O', side.canCastleQueenside && 'O-O-O'].filter(
    Boolean,
  );
  return rights.length ? rights.join(' / ') : (side.kingSquare ?? '—');
};
