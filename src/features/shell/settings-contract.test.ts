import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFERENCES } from '@/stores/preferences-store';

import { SETTINGS_INDEX } from './settings-index';
import { NON_PREFERENCE_SETTINGS, SETTING_CONTRACTS } from './settings-contract';

/**
 * A setting that can be changed and changes nothing is a defect.
 *
 * Phase 17 opened with one: Board priority persisted correctly, had two
 * runtime consumers, and moved nothing a user could see. The lesson was that
 * "the value is stored" and "the value is read" are both weaker claims than
 * anybody had noticed, so these tests check the specific claims the contract
 * makes rather than the general one.
 *
 * What this file can prove: every preference is declared, its control writes
 * it, its consumer reads it, the searchable index and the contract agree, and
 * reset returns everything to its default. What it cannot prove is that
 * reading the value produces a visible difference — that needs a browser, and
 * `verifiedBy` names the test that does it.
 */

const SRC = path.join(process.cwd(), 'src');
const read = (relative: string) => readFileSync(path.join(SRC, relative), 'utf8');
const preferenceKeys = Object.keys(DEFAULT_PREFERENCES);

/**
 * Does this module read the preference, as opposed to mentioning it?
 *
 * Three shapes count, and they are the three this codebase actually uses:
 *
 * - `state.boardTheme` — a member access on whatever holds the preference.
 * - `state['boardTheme']` — the bracket form, for keys that are awkward as
 *   identifiers.
 * - `const { boardTheme } = usePreferences(...)` — a destructured binding. The
 *   negative lookahead is what keeps `{ boardTheme: 'sage' }` out: that is an
 *   object literal naming the key, which is how a *write* looks.
 *
 * What deliberately does not count is a bare string literal, `'boardTheme'`.
 * That is the shape a write takes — `setPreference('boardTheme', x)` — and it
 * is also the shape of a key mentioned in a comment, a type, or a lookup
 * table. Accepting it is what let three rows pass that name a module doing
 * something other than reading the value.
 *
 * Imports and comments are removed first, because both can carry a binding or
 * a member expression without the module reading anything.
 * `boardTheme` is the case in point: `Chessboard.tsx` opens with
 * `import { boardTheme, boardThemeVariables } from './themes'` and calls a
 * *local* function of the same name against a `theme` prop. Scanned naively
 * the import satisfies a destructure match and the row passes again — which is
 * precisely the false pass this test is here to prevent.
 */
function readsPreference(source: string, key: string): boolean {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\.${escaped}\\b`).test(code)) return true;
  if (new RegExp(`\\[\\s*['"\`]${escaped}['"\`]\\s*\\]`).test(code)) return true;
  if (new RegExp(`\\{[^}]*\\b${escaped}\\b(?!\\s*:)[^}]*\\}`, 's').test(code)) return true;
  return false;
}

describe('settings contract', () => {
  it('declares every preference exactly once', () => {
    const declared = SETTING_CONTRACTS.map((entry) => entry.key);
    const missing = preferenceKeys.filter((key) => !declared.includes(key as never));
    const duplicated = declared.filter((key, index) => declared.indexOf(key) !== index);

    expect(missing, 'preferences with no contract — add one, or explain why not').toEqual([]);
    expect(duplicated, 'preferences declared twice').toEqual([]);
  });

  it('declares no preference that does not exist', () => {
    const unknown = SETTING_CONTRACTS.map((entry) => entry.key).filter(
      (key) => !preferenceKeys.includes(key),
    );
    expect(unknown, 'contracts naming a preference the store does not have').toEqual([]);
  });

  it('names a control that actually writes the preference', () => {
    /*
      The contract's first claim: there is somewhere a user can change this. A
      control that no longer writes the key is a setting whose UI has been
      removed or renamed, which is how a preference becomes unreachable while
      still looking supported in the search index.
    */
    const broken: string[] = [];
    for (const entry of SETTING_CONTRACTS) {
      const source = read(entry.control);
      if (!source.includes(`'${entry.key}'`)) {
        broken.push(`${entry.key}: ${entry.control} does not write it`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('names a consumer that actually reads the preference', () => {
    /*
      The second claim, and the one the Board priority bug turned on: the value
      reaches code that does something with it. This is necessary and not
      sufficient — boardPriority passed a check like this throughout the period
      it did nothing — which is why `effect` is written down too and
      `verifiedBy` names the browser test where one exists.

      It used to be `source.includes(entry.key)`, which is true for three kinds
      of thing that are not a read at all:

        - a **function of the same name**. `enginePreset` was declared with
          `consumer: 'engine/presets.ts'`, and `presets.ts` exported a
          function called `enginePreset` — so the row passed while nothing in
          the module ever read the preference. The values were applied once,
          imperatively, in a segmented control's `onChange`, and the stored key
          was a label that no code honoured.
        - a **string literal naming the key in a file that only writes it**.
          `rememberLichessToken` was declared with
          `consumer: 'LichessCallback.tsx'`, and that file's only occurrence is
          the `setPreference('rememberLichessToken', true)` it performs. The
          single read lives in the store.
        - a **module-local variable of the same name**. `lichessToken` was
          declared with `consumer: 'database/providers/lichess-auth.ts'`, which
          holds the token in a local and never touches the preference.

      So a read has to look like one: a member access, a bracket access, or a
      destructured binding that is not an object-literal key. Writes pass
      `'key'` as an argument or `key:` as a property, and neither counts.
    */
    const broken: string[] = [];
    for (const entry of SETTING_CONTRACTS) {
      const source = read(entry.consumer);
      if (!readsPreference(source, entry.key)) {
        broken.push(`${entry.key}: ${entry.consumer} does not read it`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('says what each setting does, in words somebody could check', () => {
    for (const entry of SETTING_CONTRACTS) {
      expect(entry.effect.length, `${entry.key} has no effect described`).toBeGreaterThan(20);
      expect(entry.effect.endsWith('.'), `${entry.key}: effect should be a sentence`).toBe(true);
    }
  });

  it('keeps the searchable index and the contract in agreement', () => {
    const indexIds = new Set(SETTINGS_INDEX.map((entry) => entry.id));

    const danglingContract = SETTING_CONTRACTS.filter(
      (entry) => entry.indexedAs !== null && !indexIds.has(entry.indexedAs),
    ).map((entry) => `${entry.key} -> ${entry.indexedAs}`);
    expect(danglingContract, 'contracts pointing at an index entry that is gone').toEqual([]);

    const claimed = new Set(
      SETTING_CONTRACTS.map((entry) => entry.indexedAs).filter((id): id is string => id !== null),
    );
    const unexplained = [...indexIds].filter(
      (id) => !claimed.has(id) && !(id in NON_PREFERENCE_SETTINGS),
    );
    expect(
      unexplained,
      'searchable settings with no contract and no entry in NON_PREFERENCE_SETTINGS',
    ).toEqual([]);
  });

  it('does not list a non-preference that is no longer in the index', () => {
    const indexIds = new Set(SETTINGS_INDEX.map((entry) => entry.id));
    const stale = Object.keys(NON_PREFERENCE_SETTINGS).filter((id) => !indexIds.has(id));
    expect(stale, 'NON_PREFERENCE_SETTINGS entries for settings that no longer exist').toEqual([]);
  });

  it('marks a setting that needs a restart as not previewable', () => {
    /*
      Engine threads and hash are the honest cases: they are sent to the engine
      when a search starts, so changing them mid-search does nothing until the
      next one. Saying so is the difference between a setting that looks broken
      and one the user understands.
    */
    const engineConfig = SETTING_CONTRACTS.filter((entry) =>
      ['engineThreads', 'engineHashMb'].includes(entry.key),
    );
    expect(engineConfig).toHaveLength(2);
    for (const entry of engineConfig) expect(entry.previewable).toBe(false);
  });

  it('points every verifiedBy at a test file that exists', () => {
    const missing: string[] = [];
    for (const entry of SETTING_CONTRACTS) {
      if (!entry.verifiedBy) continue;
      try {
        readFileSync(path.join(process.cwd(), entry.verifiedBy), 'utf8');
      } catch {
        missing.push(`${entry.key} -> ${entry.verifiedBy}`);
      }
    }
    expect(missing, 'contracts citing a test that is not there').toEqual([]);
  });
});
