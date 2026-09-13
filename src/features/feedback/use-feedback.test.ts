import { describe, expect, it } from 'vitest';

import { buildEnvelopeFromDraft } from './use-feedback';

describe('buildEnvelopeFromDraft', () => {
  it('carries the fill-time stamp, the position and the technical snapshot to the wire', () => {
    /* The route refuses a submission without `openedAtMs` (fill-time
       gate) and can only attach a FEN or a technical snapshot that is
       in the body. 1.1.1 built an envelope with none of the three, so
       a Send that reached the server was refused as too fast and the
       "Include current position" switch attached nothing. */
    const envelope = buildEnvelopeFromDraft(
      {
        category: 'data-issue',
        message: '  The explorer disagrees with the board.  ',
        currentFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        includeTechnical: true,
        technicalInfo: { snapshot: 'browser=Chromium' },
      },
      { clientVersion: '1.1.2', surface: 'web', openedAtMs: 1_700_000_000_000 },
    );
    expect(envelope).toEqual({
      category: 'data-issue',
      message: 'The explorer disagrees with the board.',
      currentFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      includeTechnical: true,
      technicalInfo: { snapshot: 'browser=Chromium' },
      clientVersion: '1.1.2',
      surface: 'web',
      openedAtMs: 1_700_000_000_000,
    });
  });

  it('sends no technical snapshot when the switch is off, even if one was collected', () => {
    const envelope = buildEnvelopeFromDraft(
      {
        category: 'general',
        message: 'Thanks.',
        includeTechnical: false,
        technicalInfo: { snapshot: 'must not leave the browser' },
      },
      { clientVersion: '1.1.2', surface: 'desktop', openedAtMs: 5 },
    );
    expect(envelope).not.toHaveProperty('technicalInfo');
    expect(envelope).not.toHaveProperty('currentFen');
    expect(envelope.openedAtMs).toBe(5);
  });
});
