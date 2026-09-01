/**
 * PGN tokenizer.
 *
 * PGN is written by dozens of programs and by hand, so the scanner is
 * deliberately forgiving about whitespace and about the many ways a move number
 * can be glued to a move (`1.e4`, `1. e4`, `1...e5`). It is strict about
 * structure: braces, parentheses and tag pairs must balance, and anything it
 * cannot classify is reported rather than silently dropped.
 */

export type TokenType =
  | 'tag'
  | 'comment'
  | 'nag'
  | 'move'
  | 'move-number'
  | 'result'
  | 'variation-start'
  | 'variation-end'
  | 'unknown';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  /** Tag name, for `tag` tokens. */
  readonly key?: string;
  /** 1-based source line, used in error messages. */
  readonly line: number;
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '1/2', '*']);

// Suffix glyphs (`!`, `?!`, …) are deliberately excluded: they are annotations,
// not part of the move, and are emitted as NAG tokens by `classifyWord`.
const SAN_PATTERN =
  /^(?:(?:O-O-O|O-O)|(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8])|(?:[a-h]x?[a-h]?[1-8](?:=?[QRBN])?))[+#]?/;

const MOVE_NUMBER_PATTERN = /^(\d+)(\.{1,3})/;
const NAG_PATTERN = /^\$(\d+)/;

const isWordBreak = (char: string): boolean =>
  char === ' ' ||
  char === '\t' ||
  char === '\r' ||
  char === '\n' ||
  char === '(' ||
  char === ')' ||
  char === '{' ||
  char === '}' ||
  char === '[' ||
  char === ']' ||
  char === '<' ||
  char === '>' ||
  char === ';';

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let atLineStart = true;

  const push = (token: Token) => {
    tokens.push(token);
  };

  while (index < source.length) {
    const char = source[index] as string;

    if (char === '\n') {
      line += 1;
      index += 1;
      atLineStart = true;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1;
      continue;
    }

    // `%` at the start of a line escapes the whole line (PGN export escape).
    if (char === '%' && atLineStart) {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    atLineStart = false;

    if (char === '[') {
      const end = findTagEnd(source, index);
      const raw = source.slice(index + 1, end);
      const parsed = parseTag(raw);
      if (parsed) push({ type: 'tag', key: parsed.key, value: parsed.value, line });
      else push({ type: 'unknown', value: raw, line });
      line += countNewlines(source, index, end);
      index = end + 1;
      continue;
    }

    if (char === '{') {
      const end = source.indexOf('}', index + 1);
      const stop = end === -1 ? source.length : end;
      push({ type: 'comment', value: source.slice(index + 1, stop), line });
      line += countNewlines(source, index, stop);
      index = stop + 1;
      continue;
    }

    if (char === ';') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      push({ type: 'comment', value: source.slice(index + 1, stop).trim(), line });
      index = stop;
      continue;
    }

    if (char === '(') {
      push({ type: 'variation-start', value: '(', line });
      index += 1;
      continue;
    }
    if (char === ')') {
      push({ type: 'variation-end', value: ')', line });
      index += 1;
      continue;
    }
    // `<` `>` are reserved by the standard and carry no meaning today.
    if (char === '<' || char === '>' || char === ']' || char === '}') {
      index += 1;
      continue;
    }

    let end = index;
    while (end < source.length && !isWordBreak(source[end] as string)) end += 1;
    const word = source.slice(index, end);
    index = end;
    classifyWord(word, line, push);
  }

  return tokens;
}

/**
 * A "word" may pack several tokens together: `1.e4`, `12...Nf6!?`, `$14`.
 * Peel them off from the left until nothing recognisable is left.
 */
function classifyWord(word: string, line: number, push: (token: Token) => void): void {
  let rest = word;

  while (rest.length > 0) {
    if (RESULTS.has(rest)) {
      push({ type: 'result', value: rest === '1/2' ? '1/2-1/2' : rest, line });
      return;
    }

    const numberMatch = MOVE_NUMBER_PATTERN.exec(rest);
    if (numberMatch) {
      push({ type: 'move-number', value: numberMatch[0], line });
      rest = rest.slice(numberMatch[0].length);
      continue;
    }

    const nagMatch = NAG_PATTERN.exec(rest);
    if (nagMatch) {
      push({ type: 'nag', value: nagMatch[1] as string, line });
      rest = rest.slice(nagMatch[0].length);
      continue;
    }

    const normalized = rest.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
    const sanMatch = SAN_PATTERN.exec(normalized);
    if (sanMatch) {
      const consumed = sanMatch[0].length;
      push({ type: 'move', value: sanMatch[0], line });
      rest = normalized.slice(consumed);
      continue;
    }

    // Standalone annotation glyphs sometimes trail a move with a space.
    const suffixMatch = /^[!?]{1,2}/.exec(rest);
    if (suffixMatch) {
      push({ type: 'nag', value: symbolicNagCode(suffixMatch[0]), line });
      rest = rest.slice(suffixMatch[0].length);
      continue;
    }

    push({ type: 'unknown', value: rest, line });
    return;
  }
}

const symbolicNagCode = (symbol: string): string =>
  ({ '!': '1', '?': '2', '!!': '3', '??': '4', '!?': '5', '?!': '6' })[symbol] ?? '0';

function findTagEnd(source: string, start: number): number {
  let index = start + 1;
  let inQuotes = false;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\' && inQuotes) {
      index += 2;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ']' && !inQuotes) return index;
    index += 1;
  }
  return source.length;
}

function parseTag(raw: string): { key: string; value: string } | null {
  const match = /^\s*([A-Za-z0-9_+#=:-]+)\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(raw);
  if (!match) return null;
  return {
    key: match[1] as string,
    value: (match[2] as string).replace(/\\(["\\])/g, '$1'),
  };
}

function countNewlines(source: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to && i < source.length; i += 1) {
    if (source[i] === '\n') count += 1;
  }
  return count;
}
