'use client';

/**
 * Threats and safety, in the Features panel.
 *
 * Two different kinds of answer, kept visibly apart:
 *
 * - **Counted from the diagram**: which pieces the other side wins material by
 *   capturing (a static exchange on that square, pins not considered) and
 *   which pieces nobody defends. Checkable in a second; no engine involved.
 * - **Asked of an engine**: what the side not to move would play if it were
 *   its turn. That is an engine's opinion about a position that did not occur,
 *   searched for a fixed short time, and it is labelled with the engine, the
 *   depth and the budget.
 *
 * Hovering a row emphasises its squares on the board.
 */

import { useEffect, useMemo } from 'react';

import { formatScore } from '@/chess/evaluation';
import type { FenParts } from '@/chess/fen';
import { safetyOf, type PieceSafety } from '@/chess/safety';
import type { Color, Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { usePreferences } from '@/stores/preferences-store';
import { THREAT_SEARCH_MS, useThreats } from '@/stores/threat-store';
import { useUi } from '@/stores/ui-store';

const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
} as const;
const SIDE = { w: 'White', b: 'Black' } as const;

export function SafetySection({ fen, parts }: { readonly fen: Fen; readonly parts: FenParts }) {
  const setEmphasis = useUi((state) => state.setBoardEmphasis);
  const engineId = usePreferences((state) => state.primaryEngineId);
  const threats = useThreats();
  const mover = parts.turn;
  const other: Color = mover === 'w' ? 'b' : 'w';
  const reports = useMemo(() => ({ w: safetyOf(parts, 'w'), b: safetyOf(parts, 'b') }), [parts]);

  // A new position makes the last answer about somewhere else.
  const reset = threats.reset;
  useEffect(() => {
    reset();
    setEmphasis(null);
  }, [fen, reset, setEmphasis]);

  const emphasise = (squares: readonly string[]) => setEmphasis({ fen, squares });
  const clear = () => setEmphasis(null);
  const answer = threats.answer?.fen === fen ? threats.answer : null;

  const row = (entry: PieceSafety, kind: 'en-prise' | 'loose') => (
    <li
      key={`${kind}-${entry.square}`}
      className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-surface-2"
      onMouseEnter={() => emphasise([entry.square, ...entry.attackers])}
      onMouseLeave={clear}
      data-safety-row={kind}
      data-square={entry.square}
    >
      <span className="text-primary">
        {PIECE_NAMES[entry.piece.type]} {entry.square}
      </span>
      <span className="text-tertiary">
        {kind === 'en-prise'
          ? `${entry.attackers.length} attacker${entry.attackers.length === 1 ? '' : 's'}, ${entry.defenders.length} defender${entry.defenders.length === 1 ? '' : 's'} · loses ${entry.exchange}`
          : entry.attackers.length > 0
            ? `undefended, attacked ${entry.attackers.length}×`
            : 'undefended'}
      </span>
    </li>
  );

  return (
    <section className="border-t border-line-subtle px-3 py-2.5 text-[11.5px]" data-safety>
      <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-tertiary">
        Threats and safety
      </h3>
      {(['w', 'b'] as const).map((color) => {
        const report = reports[color];
        const empty = report.enPrise.length === 0 && report.loose.length === 0;
        return (
          <div key={color} className="mb-1.5" data-safety-side={color}>
            <p className="font-medium text-secondary">{SIDE[color]}</p>
            {empty ? (
              <p className="text-tertiary">Nothing en prise, nothing loose.</p>
            ) : (
              <ul>
                {report.enPrise.map((entry) => row(entry, 'en-prise'))}
                {report.loose.map((entry) => row(entry, 'loose'))}
              </ul>
            )}
          </div>
        );
      })}
      <p className="mb-2 text-[10.5px] leading-snug text-tertiary">
        “Loses n” is the material the other side wins by capturing there, in pawns (1/3/3/5/9),
        exchanging on that one square with the least valuable piece first; pins are not considered.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void threats.ask(fen, engineId)}
          disabled={threats.status === 'running'}
          data-threat-ask
        >
          {threats.status === 'running'
            ? 'Asking the engine…'
            : `What does ${SIDE[other]} threaten?`}
        </Button>
      </div>
      {threats.status === 'unavailable' || threats.status === 'error' ? (
        <p className="mt-1 text-tertiary" role="status" data-threat-message>
          {threats.message}
        </p>
      ) : null}
      {answer ? (
        <div
          className="mt-1.5 rounded border border-line-subtle px-2 py-1.5"
          onMouseEnter={() =>
            answer.move ? emphasise([answer.move.from, answer.move.to]) : undefined
          }
          onMouseLeave={clear}
          data-threat-answer
        >
          {answer.move ? (
            <p className="text-primary">
              <span className="font-semibold" data-threat-move>
                {other === 'b' ? '…' : ''}
                {answer.move.san}
              </span>
              {answer.line.length > 1 ? (
                <span className="text-tertiary"> then {answer.line.slice(1).join(' ')}</span>
              ) : null}
            </p>
          ) : (
            <p className="text-secondary">The engine returned no move.</p>
          )}
          <p className="text-[10.5px] text-tertiary">
            {answer.engineName}, depth {answer.depth}, {THREAT_SEARCH_MS / 1000} s, with the turn
            passed to {SIDE[other]}
            {answer.score ? ` · ${formatScore(answer.score)} (White’s view)` : ''}. An engine’s
            opinion of a position that did not occur.
          </p>
        </div>
      ) : null}
    </section>
  );
}
