import { describe, expect, it } from 'vitest';

import { resolveBoardCapabilities } from './board-capabilities';

describe('resolveBoardCapabilities', () => {
  it('gives an interactive board everything', () => {
    const caps = resolveBoardCapabilities({ mode: 'interactive' });
    expect(caps.allowMoves).toBe(true);
    expect(caps.showEvaluation).toBe(true);
    expect(caps.showAnnotations).toBe(true);
  });

  it('makes a preview a picture rather than a workspace', () => {
    const caps = resolveBoardCapabilities({ mode: 'preview' });
    expect(caps.allowMoves).toBe(false);
    expect(caps.allowAnnotations).toBe(false);
    expect(caps.allowContextActions).toBe(false);
    expect(caps.allowFlip).toBe(false);
  });

  it('keeps a read-only board fully legible while refusing edits', () => {
    const caps = resolveBoardCapabilities({ mode: 'read-only' });
    expect(caps.allowMoves).toBe(false);
    expect(caps.showEvaluation).toBe(true);
    expect(caps.showAnnotations).toBe(true);
  });

  it('lets a surface narrow a capability', () => {
    const caps = resolveBoardCapabilities({
      mode: 'interactive',
      overrides: { showEvaluation: false },
    });
    expect(caps.showEvaluation).toBe(false);
    expect(caps.allowMoves).toBe(true);
  });
});

describe('concealment', () => {
  it('withholds every channel that could carry the answer', () => {
    const caps = resolveBoardCapabilities({ mode: 'interactive', conceal: true });
    expect(caps.showEvaluation).toBe(false);
    expect(caps.showLegalHints).toBe(false);
    // A stored `!` on the next move is the answer written on the board.
    expect(caps.showAnnotations).toBe(false);
    expect(caps.allowAnnotations).toBe(false);
  });

  it('still lets the player move, because answering is the exercise', () => {
    expect(resolveBoardCapabilities({ mode: 'interactive', conceal: true }).allowMoves).toBe(true);
  });

  /*
    The regression this file exists for. Four routes conceal evidence and each
    used to do it its own way; the danger is a fifth one passing an override
    that quietly re-enables the evaluation bar inside a hidden session.
  */
  it('cannot be overridden back on by a call site', () => {
    const caps = resolveBoardCapabilities({
      mode: 'interactive',
      overrides: { showEvaluation: true, showLegalHints: true, showAnnotations: true },
      conceal: true,
    });
    expect(caps.showEvaluation).toBe(false);
    expect(caps.showLegalHints).toBe(false);
    expect(caps.showAnnotations).toBe(false);
  });

  it('conceals training boards by construction, not by the caller remembering', () => {
    const caps = resolveBoardCapabilities({ mode: 'training' });
    expect(caps.showEvaluation).toBe(false);
    expect(caps.showLegalHints).toBe(false);
    expect(caps.showAnnotations).toBe(false);
  });

  it('hides the pieces only when asked, and keeps the board playable', () => {
    const caps = resolveBoardCapabilities({ mode: 'interactive', concealPieces: true });
    expect(caps.concealPieces).toBe(true);
    // The blindfold exercise is entering a move you cannot see.
    expect(caps.allowMoves).toBe(true);
  });

  it('leaves an unconcealed board alone', () => {
    expect(resolveBoardCapabilities({ mode: 'interactive', conceal: false }).showEvaluation).toBe(
      true,
    );
  });
});
