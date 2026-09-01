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

import { useMemo } from 'react';

import { positionFeatures, type ColorFeatures, type PositionFeatures } from '@/chess/features';
import { parseFen } from '@/chess/fen';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';

import { useAnalysisPosition } from './useAnalysisPosition';

export function FeaturesPanel() {
  const { node } = useAnalysisPosition();
  const features = useMemo(() => {
    const parsed = parseFen(node.fen);
    return parsed.ok ? positionFeatures(parsed.value) : null;
  }, [node.fen]);

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
      </PanelBody>
    </div>
  );
}

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
