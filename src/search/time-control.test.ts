import { describe, expect, it } from 'vitest';

import { classifyTimeControl, estimatedSeconds } from './time-control';

describe('classifyTimeControl', () => {
  it.each([
    ['15+0', 'ultrabullet'],
    ['29+0', 'ultrabullet'],
    ['30+0', 'bullet'],
    ['60+0', 'bullet'],
    ['120+1', 'bullet'], // 160 s
    ['179+0', 'bullet'],
    ['180+0', 'blitz'],
    ['180+2', 'blitz'], // 260 s
    ['479+0', 'blitz'],
    ['480+0', 'rapid'],
    ['600+5', 'rapid'], // 800 s
    ['1499+0', 'rapid'],
    ['1500+0', 'classical'],
    // 900 + 40 × 10 = 1,300 s. Intuition says 15+10 is nearly classical; the
    // rule says rapid, and the rule is what the filter prints.
    ['900+10', 'rapid'],
  ] as const)('%s', (tag, expected) => {
    expect(classifyTimeControl(tag)).toBe(expected);
  });

  it('counts the increment forty times, as Lichess does', () => {
    // 60 + 40 × 3 = 180: the first second of blitz.
    expect(estimatedSeconds('60+3')).toBe(180);
    expect(classifyTimeControl('60+3')).toBe('blitz');
    expect(classifyTimeControl('60+2')).toBe('bullet');
  });

  it('reads a per-move allowance as correspondence, however long', () => {
    expect(classifyTimeControl('1/86400')).toBe('correspondence');
    expect(classifyTimeControl('1/259200')).toBe('correspondence');
  });

  it('classes a multi-period control by its first period', () => {
    // FIDE classical: 5,400 + 40 × 30 = 6,600 s.
    expect(classifyTimeControl('40/5400+30:1800+30')).toBe('classical');
    expect(estimatedSeconds('40/5400+30:1800+30')).toBe(6600);
  });

  it('keeps "no time control" apart from "no information"', () => {
    expect(classifyTimeControl('-')).toBe('none');
    expect(classifyTimeControl(undefined)).toBe('unknown');
    expect(classifyTimeControl('')).toBe('unknown');
    expect(classifyTimeControl('?')).toBe('unknown');
    expect(classifyTimeControl('sandclock')).toBe('unknown');
    expect(classifyTimeControl('0/600')).toBe('unknown');
  });
});
