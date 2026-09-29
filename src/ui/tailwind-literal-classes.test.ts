import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A Tailwind class name is a build-time string, not a runtime value.
 *
 * Tailwind v4 finds utilities by scanning the *text* of the source tree for
 * complete class names. It does not evaluate TypeScript, so a class assembled
 * by interpolation — `` `h-[${SIZE}px]` ``, `` `[@${QUERY}]:py-1` `` — contains
 * no complete class, nothing is emitted, and the rule simply does not exist.
 *
 * This session hit that three times, in three different files, and the failure
 * mode is the reason it deserves a gate rather than a memory:
 *
 *   - the titlebar band header came out **36px** where 56 was contracted, and
 *     `e2e/window-chrome.spec.ts` caught it;
 *   - one board square's size class vanished, every piece lost its
 *     constraint, and the board rendered as a few enormous pieces;
 *   - the workspace lost its `sm:px-5` / `sm:py-4` at every tall viewport,
 *     which showed up as **eleven** failing visual baselines and nothing else.
 *
 * In all three: typecheck clean, lint clean, every unit test green. Nothing in
 * the ordinary gates can see a class that was never generated, because the code
 * that references it is perfectly valid TypeScript. Only a render shows it, and
 * the cheapest render that shows it is a text scan.
 *
 * The rule is therefore narrow on purpose: a template literal is a problem only
 * when it *also* looks like a class — it carries a Tailwind prefix (`h-`, `p-`,
 * `text-`, `sm:`, `rounded-`, `bg-`, …) or a bracket form (`[@…]`, `[&…]`). Any
 * other interpolated string is ordinary code.
 */

const SRC = path.join(process.cwd(), 'src');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\.\w+$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The dangerous shape, precisely.
 *
 * A template literal that composes classes is usually fine: `` `flex ${w} gap-2` ``
 * interpolates at a *token boundary*, and `w` is itself a complete literal
 * class somewhere in the same file, so Tailwind finds both and emits both. The
 * codebase does that a dozen times and it is correct.
 *
 * The defect is interpolation *inside* a class token, where the class is not
 * complete until it has been evaluated: `h-[${SIZE}%]`, `w-[${N}px]`,
 * `[@${QUERY}]:py-1`. The bytes Tailwind sees are `h-[` and `]`, which name
 * nothing. So the rule is simply: does the character immediately before `${
 * ` belong to a class token rather than a separator?
 */
const INTERPOLATED_CLASS_TOKEN = /`([^`]*)\$\{/g;

/**
 * The signature, exactly: an arbitrary-value bracket that is still open when
 * the interpolation arrives.
 *
 * All three of this session's failures were arbitrary-value forms —
 * `h-[${SIZE}px]`, `w-[${N}px]`, `[@${QUERY}]:py-1` — because those are the
 * only Tailwind shapes where a variable is genuinely useful inside the class.
 * Matching on the unbalanced bracket rather than on "a template with a
 * `${` in it" keeps the gate quiet: a dozen templates compose classes at a
 * token boundary and are correct, and URLs, slugs and `workspace-${name}` all
 * interpolate happily without being classes.
 */
/**
 * An open bracket that begins a Tailwind arbitrary value.
 *
 * Two shapes count, and they are the two Tailwind actually has:
 *
 *   `h-[${SIZE}px]`     the `[` follows the utility name — a letter or `-`
 *   `[@${QUERY}]:py-1`  the `[` opens the token and is followed by `@`, which
 *                       is how an arbitrary *variant* is written
 *
 * Everything else that carries a bracket is not a class: `[%eval $1]` is a PGN
 * annotation, `https://ntfy.sh/${topic}` is a URL, `rounded-[var(--x)]` is
 * already balanced. This is the difference between a gate that catches three
 * real bugs and a gate that cries wolf on every template in the tree.
 */
const isTailwindBracketOpen = (source: string, index: number): boolean => {
  const before = source[index - 1];
  const after = source[index + 1];
  if (after === '@') return true; // [@media(...)] / [@supports...]
  // `[data-game-row="…"]` is a CSS attribute selector written into a style
  // attribute, not a Tailwind class, and it looks identical from here.
  if (source.startsWith('[data-', index) || source.startsWith('[aria-', index)) return false;
  return before !== undefined && /[A-Za-z-]/.test(before);
};

/** True when any bracket is still open when an interpolation arrives. */
const hasOpenClassBracket = (prefix: string): boolean => {
  const open: number[] = [];
  for (let i = 0; i < prefix.length; i += 1) {
    const ch = prefix[i];
    if (ch === '[') open.push(i);
    else if (ch === ']') open.pop();
  }
  return open.some((i) => isTailwindBracketOpen(prefix, i));
};

describe('Tailwind classes are literal, not interpolated', () => {
  const offenders: string[] = [];

  it('no class token is completed only at runtime', () => {
    for (const file of sources(SRC)) {
      // Comments are prose. This file and `breakpoints.ts` both *quote* the
      // broken form to explain why it is wrong, and a scanner that reads its
      // own documentation as a defect is a scanner nobody will run.
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/[^\n]*/gm, ' ');
      for (const match of source.matchAll(INTERPOLATED_CLASS_TOKEN)) {
        const prefix = match[1] ?? '';
        if (!hasOpenClassBracket(prefix)) continue;
        const line = source.slice(0, match.index ?? 0).split('\n').length;
        offenders.push(
          `${path.relative(process.cwd(), file)}:${line}  …${prefix.slice(-40)}${'${…}'}`,
        );
      }
    }
    expect(
      offenders,
      'these class names are completed by an interpolation, so Tailwind emits nothing for ' +
        'them. Spell the class out in full — a test can hold a literal and an interpolation ' +
        'in step, but only the literal reaches the stylesheet.',
    ).toEqual([]);
  });

  it('the scan is actually scanning', () => {
    // Same shape as the token-reference guard: a scanner that finds nothing
    // looks exactly like a scanner that is broken.
    expect(sources(SRC).length).toBeGreaterThan(200);
  });

  it('the check itself is checked', () => {
    /*
      A gate that cannot be seen to fire is a gate nobody trusts. These are the
      three shapes that actually broke this session, and the four that look
      similar and are correct — composed at a token boundary, a URL, a PGN
      annotation, an already-balanced arbitrary value.
    */
    // `String.match` with a /g flag returns whole matches, not capture groups —
    // getting this wrong made every case below look like "no match", which is
    // the same all-green-because-broken shape the scan itself guards against.
    const prefixOf = (s: string) => [...s.matchAll(INTERPOLATED_CLASS_TOKEN)][0]?.[1] ?? '';

    expect(hasOpenClassBracket(prefixOf('`h-[${SIZE}px]`')), 'h-[${SIZE}px]').toBe(true);
    expect(hasOpenClassBracket(prefixOf('`w-[${N}px]`')), 'w-[${N}px]').toBe(true);
    expect(hasOpenClassBracket(prefixOf('`[@${QUERY}]:py-1`')), '[@${QUERY}]:py-1').toBe(true);

    expect(
      hasOpenClassBracket(prefixOf("`flex ${wide ? 'w-48' : 'w-32'} gap-2`")),
      'a token-boundary composition',
    ).toBe(false);
    expect(hasOpenClassBracket(prefixOf('`${FIELD} flex-1`')), 'a leading value').toBe(false);
    expect(hasOpenClassBracket(prefixOf('`https://ntfy.sh/${topic}`')), 'a URL').toBe(false);
    expect(hasOpenClassBracket(prefixOf('`[%eval $1] ${moves}`')), 'a PGN tag').toBe(false);
    expect(
      hasOpenClassBracket(prefixOf('`rounded-[var(--radius-control)] px-1.5`')),
      'a balanced arbitrary value',
    ).toBe(false);
    expect(
      hasOpenClassBracket(prefixOf('`tr[data-game-row="${id}"]`')),
      'a CSS attribute selector',
    ).toBe(false);
  });
});
