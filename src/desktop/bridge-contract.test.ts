/**
 * The check that would have caught two phases of dead capability.
 *
 * Everything here reads the source rather than running the application,
 * because the claim being tested is structural: that a capability the shell
 * offers is reached from somewhere, and that the row saying where is true.
 *
 * A browser cannot test this — the bridge is null there, which is the whole
 * point of it — and an end-to-end test in the packaged application would only
 * cover the methods that particular walk happened to use. Reading the source
 * covers all of them, including the ones nobody thought to walk.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRIDGE_CONTRACTS } from './bridge-contract';

const SRC = path.join(process.cwd(), 'src');
const DESKTOP = path.join(process.cwd(), 'desktop', 'src');

/** Every production `.ts`/`.tsx` under `src/`, tests excluded. */
function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, found);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

const PRODUCTION = sources(SRC).map((file) => ({
  relative: path.relative(SRC, file),
  text: readFileSync(file, 'utf8'),
}));

const bridgeSource = readFileSync(path.join(SRC, 'desktop', 'bridge.ts'), 'utf8');
const preloadSource = readFileSync(path.join(DESKTOP, 'preload.cjs'), 'utf8');

/**
 * The capabilities the bridge interface actually declares.
 *
 * Methods, and the properties that carry something the shell knows and the
 * application cannot find out for itself. `platform`, `os` and `version` are
 * facts about the process rather than capabilities, and `companion` is covered
 * by the pairing check in the desktop smoke; `windowChrome` is neither, so it
 * is held to the same standard as a method.
 */
const DESCRIPTIVE = ['platform', 'os', 'version', 'companion'];

/*
  Read out of the `DesktopBridge` block rather than the whole file. The file
  also declares the shapes the bridge passes around — a document, a choice, the
  diagnostics — and their fields are not capabilities; an earlier version of
  this scan took the lot and demanded a contract row for `packaged`.
*/
const bridgeBlock = /export interface DesktopBridge \{\n([\s\S]*?)\n\}/.exec(bridgeSource)?.[1];
if (!bridgeBlock) throw new Error('DesktopBridge is not declared the way this scan expects');

const declared = [...bridgeBlock.matchAll(/^ {2}(?:readonly )?(\w+)\??[(:]/gm)]
  .map((match) => match[1] ?? '')
  .filter((name) => name && !DESCRIPTIVE.includes(name));

describe('the desktop bridge contract', () => {
  it('covers every method the bridge declares, and invents none', () => {
    const covered = BRIDGE_CONTRACTS.map((entry) => entry.method);
    const missing = declared.filter((name) => !covered.includes(name as never));
    const unknown = covered.filter((name) => !declared.includes(name));

    expect(missing, 'bridge methods with no contract row — add one, or remove the method').toEqual(
      [],
    );
    expect(unknown, 'contract rows naming a method the bridge does not have').toEqual([]);
  });

  /*
    The assertion this file was written for.

    Not "does something mention the name" — a type import mentions the name.
    The row has to name a module, and that module has to reach the method.
  */
  it('names, for every capability, either a caller or a reason there is none', () => {
    const undeclared = BRIDGE_CONTRACTS.filter(
      (entry) => entry.caller === null && !entry.noCallerBecause,
    ).map((entry) => entry.method);

    expect(
      undeclared,
      'capabilities reachable from nothing, with no reason given — this is the defect shape ' +
        'Phase 19 hit four times; either wire it to a control or say why it has none',
    ).toEqual([]);
  });

  it('names a caller that really calls it', () => {
    const wrong: string[] = [];
    for (const entry of BRIDGE_CONTRACTS) {
      if (entry.caller === null) continue;
      const file = PRODUCTION.find((candidate) => candidate.relative === entry.caller);
      if (!file) {
        wrong.push(`${entry.method}: no such module ${entry.caller}`);
        continue;
      }
      // A method is called; a property is read. Either counts as reaching it.
      if (!new RegExp(`\\.?\\b${entry.method}\\b`).test(file.text)) {
        wrong.push(`${entry.method}: ${entry.caller} does not reach it`);
      }
    }
    expect(wrong, 'contract rows whose caller has drifted').toEqual([]);
  });

  /*
    The other direction.

    A row may say "nothing calls this, and here is why". If something starts
    calling it, the reason is now false and the row is the thing to fix — a
    stale exemption is how a contract stops being evidence.
  */
  it('has no excused method that something now calls', () => {
    const stale: string[] = [];
    for (const entry of BRIDGE_CONTRACTS) {
      if (entry.caller !== null) continue;
      const callers = PRODUCTION.filter(
        (file) =>
          file.relative !== 'desktop/bridge.ts' &&
          file.relative !== 'desktop/bridge-contract.ts' &&
          new RegExp(`\\.${entry.method}\\s*\\(`).test(file.text),
      );
      const first = callers[0];
      if (first) stale.push(`${entry.method} is excused but called by ${first.relative}`);
    }
    expect(stale, 'exemptions that are no longer true').toEqual([]);
  });

  /*
    The bridge is only half of it.

    A method typed on the interface with no preload entry is not a capability
    at all — it is `undefined` at runtime, and the first call throws inside a
    click handler. The interface and the preload have to agree.
  */
  it('is backed, for every method, by something the preload actually exposes', () => {
    const missing = declared.filter((name) => !new RegExp(`\\b${name}\\s*:`).test(preloadSource));
    expect(
      missing,
      'bridge methods the preload never exposes — these are undefined at runtime',
    ).toEqual([]);
  });
});
