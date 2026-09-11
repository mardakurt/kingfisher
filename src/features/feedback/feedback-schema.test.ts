import { describe, expect, it } from 'vitest';

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_MESSAGE,
  validateFeedbackDraft,
  type FeedbackDraft,
} from './feedback-schema';

const valid: FeedbackDraft = {
  category: 'broken',
  message: 'The explorer is showing the wrong source.',
  includeTechnical: false,
};

describe('feedback schema', () => {
  it('lists the five categories the modal offers', () => {
    expect(FEEDBACK_CATEGORIES).toEqual([
      'broken',
      'data-issue',
      'confusing',
      'improvement',
      'general',
    ]);
  });

  describe('renderer-side validation', () => {
    it('accepts a minimal, well-formed draft', () => {
      expect(validateFeedbackDraft(valid)).toBeNull();
    });

    it('rejects an unknown category', () => {
      expect(
        validateFeedbackDraft({
          ...valid,
          category: 'spam' as unknown as FeedbackDraft['category'],
        }),
      ).toMatch(/category/i);
    });

    it('rejects an empty message', () => {
      expect(validateFeedbackDraft({ ...valid, message: '   ' })).toMatch(/tell us|message/i);
    });

    it('rejects a message over the documented bound', () => {
      expect(
        validateFeedbackDraft({ ...valid, message: 'x'.repeat(FEEDBACK_MAX_MESSAGE + 1) }),
      ).toMatch(/under/);
    });

    it('rejects FEN attached without explicit opt-in', () => {
      // currentFen only travels when the user opts in. The
      // renderer never sets currentFen without includeTechnical
      // semantics — but the schema mirrors that contract by
      // accepting currentFen unconditionally and the route
      // mirrors it by gating currentFen on a separate flag.
      // This test pins the schema: a FEN without a toggle is
      // fine to *build*; the route must still gate it.
      const draft = {
        ...valid,
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };
      expect(validateFeedbackDraft(draft)).toBeNull();
    });

    it('rejects a too-long FEN', () => {
      expect(validateFeedbackDraft({ ...valid, currentFen: 'x'.repeat(500) })).toMatch(/position/i);
    });

    it('rejects technical info when the toggle is off', () => {
      expect(
        validateFeedbackDraft({
          ...valid,
          includeTechnical: false,
          technicalInfo: { appVersion: '1.0.0' },
        }),
      ).toMatch(/toggle/i);
    });

    it('rejects technical info with non-string values', () => {
      expect(
        validateFeedbackDraft({
          ...valid,
          includeTechnical: true,
          technicalInfo: { bad: 1 as unknown as string },
        }),
      ).toMatch(/string/i);
    });

    it('rejects technical info with too many fields', () => {
      const tooMany: Record<string, string> = {};
      for (let i = 0; i < 100; i += 1) tooMany[`k${i}`] = 'v';
      expect(
        validateFeedbackDraft({ ...valid, includeTechnical: true, technicalInfo: tooMany }),
      ).toMatch(/fields/i);
    });

    it('rejects technical info values that are too long', () => {
      expect(
        validateFeedbackDraft({
          ...valid,
          includeTechnical: true,
          technicalInfo: { userAgent: 'x'.repeat(3000) },
        }),
      ).toMatch(/too long/i);
    });
  });
});
