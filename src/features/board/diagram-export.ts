'use client';

/**
 * The browser half of diagram export: fetch the piece artwork the board is
 * drawn with, compose the SVG (`diagram.ts`), rasterise it, and hand it to the
 * clipboard or the downloads folder.
 *
 * A geometry piece set has no artwork files — it is drawn in code — so its
 * diagrams use Cburnett, the default artwork, and the result says so.
 */

import type { Shape } from '@/chess/annotations';
import type { Color, PieceType } from '@/chess/types';
import type { BoardThemeId } from '@/lib/board-options';
import type { PieceSetId } from '@/lib/board-options';
import { publishFilename } from '@/publish/publish';

import { diagramSvg, sideToMoveCaption, type PieceArtwork } from './diagram';
import { DEFAULT_PIECE_SET_ID, pieceAssetUrl, pieceSet } from './piece-sets';
import { boardTheme } from './themes';

const TYPES: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const LETTER: Record<PieceType, string> = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
const cache = new Map<string, Promise<PieceArtwork>>();

async function loadArtwork(
  id: PieceSetId,
): Promise<{ artwork: PieceArtwork; set: string; scale: number }> {
  let definition = pieceSet(id);
  if (definition.kind !== 'vector') definition = pieceSet(DEFAULT_PIECE_SET_ID);
  if (definition.kind !== 'vector') throw new Error('No piece artwork is available for diagrams.');
  const set = definition;
  let pending = cache.get(set.id);
  if (!pending) {
    pending = (async () => {
      const entries = await Promise.all(
        (['w', 'b'] as const).flatMap((color) =>
          TYPES.map(async (type) => {
            const response = await fetch(pieceAssetUrl(set, { color, type }));
            if (!response.ok)
              throw new Error(`Piece artwork ${color}${LETTER[type]} could not be read.`);
            return [`${color}${LETTER[type]}`, await response.text()] as const;
          }),
        ),
      );
      return Object.fromEntries(entries);
    })();
    pending.catch(() => cache.delete(set.id));
    cache.set(set.id, pending);
  }
  return { artwork: await pending, set: set.name, scale: Math.min(0.95, 0.86 * set.visualScale) };
}

export interface DiagramRequest {
  readonly fen: string;
  readonly orientation: Color;
  readonly shapes: readonly Shape[];
  readonly theme: BoardThemeId;
  readonly pieceSet: PieceSetId;
  /** For the file name and nothing else. */
  readonly title?: string;
}

export async function buildDiagram(request: DiagramRequest): Promise<{ svg: string; set: string }> {
  const { artwork, set, scale } = await loadArtwork(request.pieceSet);
  const theme = boardTheme(request.theme);
  const svg = diagramSvg({
    fen: request.fen,
    orientation: request.orientation,
    colours: theme,
    artwork,
    pieceScale: scale,
    shapes: request.shapes,
    coordinates: true,
    caption: sideToMoveCaption(request.fen),
  });
  if (!svg) throw new Error('This position could not be drawn.');
  return { svg, set };
}

/** The SVG rasterised: `pixels` is the width of the PNG. */
export async function diagramPng(svg: string, pixels = 1200): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The diagram could not be rasterised.'));
    });
    image.src = url;
    await loaded;
    const ratio = pixels / image.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The diagram could not be rasterised.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('The diagram could not be rasterised.')),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copy the diagram to the clipboard as a PNG image. Resolves to the artwork set used. */
export async function copyDiagram(request: DiagramRequest): Promise<string> {
  const { svg, set } = await buildDiagram(request);
  const png = await diagramPng(svg);
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('This browser cannot put an image on the clipboard; save the diagram instead.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  return set;
}

/** Save the diagram as a PNG or SVG file. Resolves to the artwork set used. */
export async function saveDiagram(request: DiagramRequest, format: 'png' | 'svg'): Promise<string> {
  const { svg, set } = await buildDiagram(request);
  const name = publishFilename(request.title ?? 'diagram', format);
  if (format === 'svg') download(new Blob([svg], { type: 'image/svg+xml' }), name);
  else download(await diagramPng(svg), name);
  return set;
}
