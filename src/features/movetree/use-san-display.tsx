'use client';

/**
 * How a move is drawn on screen: SAN in letters (`Nf3`), or with the piece
 * drawn as a figure (`♘f3`), as ChessBase and printed books show moves.
 *
 * The figure is the user's own piece set, not a Unicode glyph: the
 * interface font has no chess figures, and the system's fallback drew them
 * a few pixels high and unreadable. Each figure keeps its letter as hidden
 * text, so the move is still named and copied as "Nf3". Display only — what
 * is stored, compared, copied or exported stays the SAN.
 */

import { useCallback, type ReactNode } from 'react';

import type { PieceType } from '@/chess/types';
import { pieceAssetUrl, pieceSet } from '@/features/board/piece-sets';
import { usePreferences } from '@/stores/preferences-store';

const TYPES: Readonly<Record<string, PieceType>> = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' };
const GLYPHS: Readonly<Record<string, string>> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };

function Figure({ letter, setId }: { readonly letter: string; readonly setId: string }) {
  const definition = pieceSet(setId as Parameters<typeof pieceSet>[0]);
  /*
    The letter is in the text at size zero, and the picture is hidden from
    assistive technology. So the move is still named "Nf3", and selecting the
    notation and copying it still copies "Nf3". Not `sr-only`: Chrome reads
    an absolutely positioned letter as a word of its own, "N f3".
  */
  return (
    <>
      <span className="text-[0px]">{letter}</span>
      {definition.kind === 'vector' ? (
        // A few hundred bytes of SVG from our own origin; see PieceIcon.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pieceAssetUrl(definition, { color: 'w', type: TYPES[letter]! })}
          alt=""
          aria-hidden
          draggable={false}
          data-figurine={letter}
          className="inline h-[1.2em] w-[1.2em] align-[-0.25em]"
        />
      ) : (
        <span aria-hidden data-figurine={letter}>
          {GLYPHS[letter]}
        </span>
      )}
    </>
  );
}

export function useSanDisplay(): (san: string) => ReactNode {
  const figurines = usePreferences((state) => state.pieceNotation === 'figurines');
  const setId = usePreferences((state) => state.pieceSet);
  return useCallback(
    (san: string): ReactNode => {
      if (!figurines) return san;
      const lead = /^[KQRBN]/.exec(san)?.[0];
      const promotion = /=([QRBN])/.exec(san);
      const body = lead ? san.slice(1) : san;
      const [before, after] = promotion
        ? [body.slice(0, body.indexOf('=') + 1), body.slice(body.indexOf('=') + 2)]
        : [body, ''];
      return (
        <>
          {lead ? <Figure letter={lead} setId={setId} /> : null}
          {before}
          {promotion ? <Figure letter={promotion[1]!} setId={setId} /> : null}
          {after}
        </>
      );
    },
    [figurines, setId],
  );
}
