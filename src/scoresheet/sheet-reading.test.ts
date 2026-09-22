import { describe, expect, it } from 'vitest';

import { parseReading } from './sheet-reading';

describe('parseReading', () => {
  it('reads the JSON the prompt asks for, fenced or bare', () => {
    const reading = parseReading(
      'Here you go:\n```json\n{"moves":["e4","c5","?","d6"],"uncertain":[1],"white":"Giri, A","result":"1-0","extra":1}\n```',
    );
    expect(reading.tokens).toEqual(['e4', 'c5', '?', 'd6']);
    expect([...reading.uncertain]).toEqual([1]);
    expect(reading.headers).toEqual({ white: 'Giri, A', result: '1-0' });
  });

  it('treats a leading ? on a move as doubt about that move', () => {
    const reading = parseReading('{"moves":["e4","?Nf3"]}');
    expect(reading.tokens).toEqual(['e4', 'Nf3']);
    expect(reading.uncertain.has(1)).toBe(true);
  });

  it('ignores indexes and values that are not what was asked for', () => {
    const reading = parseReading(
      '{"moves":["e4", 5, null, "e5"],"uncertain":[9, -1, "x", 1.5, 1],"white":42}',
    );
    expect(reading.tokens).toEqual(['e4', 'e5']);
    expect([...reading.uncertain]).toEqual([1]);
    expect(reading.headers).toEqual({});
  });

  it('falls back to movetext when the reply is not JSON', () => {
    const reading = parseReading('1. e4 c5 2. Nf3 ?d6 3. d4 1-0');
    expect(reading.tokens).toEqual(['e4', 'c5', 'Nf3', 'd6', 'd4']);
    expect([...reading.uncertain]).toEqual([3]);
  });
});
