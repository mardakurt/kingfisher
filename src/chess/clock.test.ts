import { describe, expect, it } from 'vitest';

import { formatClockReading, isTimeTrouble, parseTimeControlTag, thinkTimeSeconds } from './clock';

describe('thinkTimeSeconds', () => {
  it('returns the difference between two clock readings', () => {
    expect(thinkTimeSeconds({ seconds: 100 }, { seconds: 82 })).toBe(18);
  });

  it('refuses a negative difference', () => {
    /* A negative clock diff can only mean missing metadata;
       reporting it would be inventing evidence. */
    expect(thinkTimeSeconds({ seconds: 80 }, { seconds: 100 })).toBeNull();
  });

  it('refuses a zero difference — that is "no signal", not "instant move"', () => {
    expect(thinkTimeSeconds({ seconds: 80 }, { seconds: 80 })).toBeNull();
  });
});

describe('formatClockReading', () => {
  it('formats under an hour as MM:SS', () => {
    expect(formatClockReading(42)).toBe('0:42');
    expect(formatClockReading(125)).toBe('2:05');
  });

  it('formats over an hour as H:MM:SS', () => {
    expect(formatClockReading(3600 + 60 * 22 + 9)).toBe('1:22:09');
  });

  it('clamps negative numbers to 0:00', () => {
    expect(formatClockReading(-5)).toBe('0:00');
  });
});

describe('isTimeTrouble', () => {
  it('does NOT fire on bullet games with high increment', () => {
    expect(
      isTimeTrouble({
        remaining: 4,
        moveNumber: 8,
        control: { initialSeconds: 5, incrementSeconds: 0 },
      }),
    ).toBe(false);
  });

  it('fires on a classical game at move 35 with a small fraction left', () => {
    expect(
      isTimeTrouble({
        remaining: 18,
        moveNumber: 35,
        control: { initialSeconds: 1800, incrementSeconds: 0 },
      }),
    ).toBe(true);
  });

  it('does NOT fire at move 18 even when low on time', () => {
    expect(
      isTimeTrouble({
        remaining: 30,
        moveNumber: 18,
        control: { initialSeconds: 1800, incrementSeconds: 0 },
      }),
    ).toBe(false);
  });

  it('does NOT fire when control metadata is missing', () => {
    expect(isTimeTrouble({ remaining: 5, moveNumber: 30 })).toBe(false);
  });

  it('does NOT fire on a 30+30 game with 25s left', () => {
    /* Increment is large enough that 25s is two clocks of
       comfortable thinking — labelling that "time trouble"
       would be wrong. */
    expect(
      isTimeTrouble({
        remaining: 25,
        moveNumber: 35,
        control: { initialSeconds: 1800, incrementSeconds: 30 },
      }),
    ).toBe(false);
  });
});

describe('parseTimeControlTag', () => {
  it('parses "300+0" as a 5-minute bullet', () => {
    expect(parseTimeControlTag('300+0')).toEqual({ initialSeconds: 300, incrementSeconds: 0 });
  });

  it('parses "5400+30" as a 90-minute rapid with 30s increment', () => {
    expect(parseTimeControlTag('5400+30')).toEqual({
      initialSeconds: 5400,
      incrementSeconds: 30,
    });
  });

  it('parses plain seconds with no increment', () => {
    expect(parseTimeControlTag('180')).toEqual({ initialSeconds: 180, incrementSeconds: 0 });
  });

  it('returns null for the moves/seconds form — too ambiguous', () => {
    expect(parseTimeControlTag('40/5400+30:3600')).toBeNull();
  });

  it('returns null for garbage input rather than throwing', () => {
    expect(parseTimeControlTag('not-a-control')).toBeNull();
    expect(parseTimeControlTag('')).toBeNull();
    expect(parseTimeControlTag(undefined)).toBeNull();
  });
});
