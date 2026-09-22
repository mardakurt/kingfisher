/**
 * Asking a model to read the sheet, and reading what it says back.
 *
 * The request goes to the assistant endpoint the user configured (ADR 0016:
 * no key ships, an unconfigured assistant is a disabled one), with the photo
 * attached the way OpenAI-compatible endpoints take images. The reply is
 * data: a list of tokens as written, the indexes the model was unsure of,
 * and the header fields it could see. Every token is then resolved against
 * the rules like a typed one; nothing the model says reaches the board
 * unchecked.
 */

export interface SheetReading {
  readonly tokens: readonly string[];
  readonly uncertain: ReadonlySet<number>;
  readonly headers: Readonly<Record<string, string>>;
}

export const SHEET_SYSTEM_PROMPT = `You transcribe handwritten chess scoresheets. Reply with one JSON object and nothing else:
{"moves": ["e4","c5","Nf3", ...], "uncertain": [12, 30], "white": "", "black": "", "event": "", "round": "", "date": "", "result": ""}
Rules: "moves" lists every move cell in playing order, White then Black, exactly as written (keep the writer's notation; do not correct, complete or translate it). Use "?" for a cell you cannot read at all. Put the zero-based index of every move you are not sure of in "uncertain". Leave a header field empty when it is not on the sheet. Do not add moves that are not written.`;

const HEADER_KEYS = ['white', 'black', 'event', 'round', 'date', 'result', 'site'] as const;
const MAX_TOKENS = 600;

/** The first JSON object in a reply, fenced or not, or null. */
function firstJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Plain movetext as a fallback: move numbers dropped, `?token` marks doubt. */
function tokensFromText(text: string): SheetReading {
  const tokens: string[] = [];
  const uncertain = new Set<number>();
  for (const raw of text.split(/\s+/)) {
    const piece = raw.replace(/^\d+\.+/, '').trim();
    if (!piece || /^\d+\.*$/.test(piece)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(piece)) continue;
    let token = piece;
    if (token.startsWith('?') && token.length > 1) {
      uncertain.add(tokens.length);
      token = token.slice(1);
    }
    tokens.push(token);
    if (tokens.length >= MAX_TOKENS) break;
  }
  return { tokens, uncertain, headers: {} };
}

export function parseReading(text: string): SheetReading {
  const json = firstJson(text);
  if (!json || typeof json !== 'object' || !Array.isArray((json as { moves?: unknown }).moves)) {
    return tokensFromText(text);
  }
  const object = json as { moves: unknown[]; uncertain?: unknown } & Record<string, unknown>;
  const tokens: string[] = [];
  const uncertain = new Set<number>();
  for (const entry of object.moves) {
    if (typeof entry !== 'string') continue;
    const token = entry.trim();
    if (!token) continue;
    if (token.startsWith('?') && token.length > 1) {
      uncertain.add(tokens.length);
      tokens.push(token.slice(1));
    } else tokens.push(token);
    if (tokens.length >= MAX_TOKENS) break;
  }
  if (Array.isArray(object.uncertain)) {
    for (const index of object.uncertain) {
      if (
        typeof index === 'number' &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < tokens.length
      )
        uncertain.add(index);
    }
  }
  const headers: Record<string, string> = {};
  for (const key of HEADER_KEYS) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) headers[key] = value.trim().slice(0, 120);
  }
  return { tokens, uncertain, headers };
}
