import fs from 'node:fs';
import path from 'node:path';

/**
 * Every custom property the source reads, somebody defines.
 *
 * An undefined `var(--name)` is not an error anywhere: CSS treats the
 * declaration as invalid at computed-value time and the property falls back
 * to its initial value — no stroke, a transparent background, the inherited
 * text colour. That is how the evaluation graph drew neither its equality
 * line nor its ticks (it read `--line-strong`, Tailwind's colour name, not
 * the stylesheet's `--border-strong`) and how the season picker's selected
 * kind set dark text on the accent (`--accent-foreground`, a token from
 * another design system). Neither was visible to a test that did not look
 * at pixels. This one reads the source instead.
 *
 * A definition is a declaration (`--name:`), a key in a style object
 * (`'--name'`), or a `next/font` variable. References built from a template
 * (`var(--shape-${colour})`) are checked by their own tests.
 */
const ROOT = path.resolve(__dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(css|tsx?)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('design token references', () => {
  it('reads no custom property that nothing defines', () => {
    const defined = new Set<string>();
    const read = new Map<string, Set<string>>();
    for (const file of sources(ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(match[1]!);
      for (const match of text.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]/g)) defined.add(match[1]!);
      for (const match of text.matchAll(/variable:\s*['"](--[a-zA-Z0-9-]+)/g))
        defined.add(match[1]!);
      for (const match of text.matchAll(/var\((--[a-zA-Z0-9-]+)(?![a-zA-Z0-9-]*\$)/g)) {
        const name = match[1]!;
        // Tailwind's own internals, and a name cut short by a template.
        if (name.startsWith('--tw-') || name.endsWith('-')) continue;
        if (!read.has(name)) read.set(name, new Set());
        read.get(name)!.add(path.relative(ROOT, file));
      }
    }
    const undefinedReads = [...read]
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `${name} in ${[...files].join(', ')}`);
    expect(undefinedReads).toEqual([]);
  });
});
