/**
 * Customisable keyboard bindings.
 *
 * `shortcuts.ts` has always been a table of what the keys *are*, rendered in
 * the reference dialog, while the handler was a separate chain of `if`s. The
 * two agreeing was a matter of somebody remembering — which is how the `D`
 * binding came to be documented for a whole phase while doing nothing.
 *
 * This module makes the table authoritative. A binding is a normalised key
 * description; the handler resolves an event to an action id through the same
 * map the settings screen edits, so a rebind takes effect everywhere at once
 * and a documented binding cannot be a binding that does nothing.
 *
 * Deliberately not a full chord grammar. Kingfisher's keys are single keys
 * with at most shift and the platform modifier, and inventing `Ctrl+K Ctrl+S`
 * sequences would add a parser, a timeout and a class of unreachable states in
 * exchange for nothing a chess player asked for.
 */

export interface KeyChord {
  /** Lower-cased `event.key`, or a named key like `arrowleft`. */
  readonly key: string;
  readonly shift: boolean;
  /** Cmd on macOS, Ctrl elsewhere — the platform's own modifier. */
  readonly meta: boolean;
}

/** A binding as stored and displayed: `shift+c`, `mod+k`, `arrowleft`. */
export type Binding = string;

export function parseBinding(binding: Binding): KeyChord | null {
  const parts = binding
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return null;

  const key = parts[parts.length - 1] as string;
  const modifiers = parts.slice(0, -1);
  if (modifiers.some((part) => part !== 'shift' && part !== 'mod')) return null;
  if (key === 'shift' || key === 'mod') return null;

  return {
    key,
    shift: modifiers.includes('shift'),
    meta: modifiers.includes('mod'),
  };
}

/** The binding an event represents, in the same notation the store uses. */
export function bindingFromEvent(event: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}): Binding {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  /*
    Shift is recorded only for keys whose identity it does not already change.
    On `?` the shift is how you type the character at all, so recording it
    would produce `shift+?`, which no event ever matches.
  */
  const key = event.key.toLowerCase();
  if (event.shiftKey && /^[a-z]$/.test(key)) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

/** `⇧C`, `⌘K`, `←` — what a human reads, from what the store holds. */
export function formatBinding(binding: Binding, platform: 'mac' | 'other' = 'mac'): string {
  const chord = parseBinding(binding);
  if (!chord) return binding;
  const named: Record<string, string> = {
    arrowleft: '←',
    arrowright: '→',
    arrowup: '↑',
    arrowdown: '↓',
    home: 'Home',
    end: 'End',
    delete: 'Delete',
    backspace: 'Backspace',
    escape: 'Esc',
    ' ': 'Space',
  };
  const key = named[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  return `${chord.meta ? (platform === 'mac' ? '⌘' : 'Ctrl+') : ''}${chord.shift ? '⇧' : ''}${key}`;
}

export interface BindingConflict {
  readonly binding: Binding;
  /** Action ids sharing this binding, in table order. */
  readonly actions: readonly string[];
}

/**
 * Bindings claimed by more than one action.
 *
 * §38's requirement is that a conflict is never silent. Reporting them all,
 * rather than refusing the assignment that created one, is what lets the
 * settings screen say "C is already assigned to Comment" and offer a choice —
 * a rebind dialog that simply refuses is a dialog that gives the user no way
 * to make the swap they intended.
 */
export function findConflicts(
  bindings: Readonly<Record<string, Binding>>,
): readonly BindingConflict[] {
  const byBinding = new Map<Binding, string[]>();
  for (const [action, binding] of Object.entries(bindings)) {
    if (binding === '') continue;
    const existing = byBinding.get(binding);
    if (existing) existing.push(action);
    else byBinding.set(binding, [action]);
  }
  return [...byBinding.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([binding, actions]) => ({ binding, actions }));
}

/** The actions, other than this one, that already hold a binding. */
export function conflictsWith(
  bindings: Readonly<Record<string, Binding>>,
  action: string,
  binding: Binding,
): readonly string[] {
  return Object.entries(bindings)
    .filter(([id, value]) => id !== action && value === binding)
    .map(([id]) => id);
}

/** Whether an event matches a binding. */
export function matchesBinding(
  binding: Binding,
  event: {
    readonly key: string;
    readonly shiftKey: boolean;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
  },
): boolean {
  const chord = parseBinding(binding);
  if (!chord) return false;
  if (chord.key !== event.key.toLowerCase()) return false;
  if (chord.meta !== (event.metaKey || event.ctrlKey)) return false;
  // Shift is only significant where it was significant when the binding was
  // recorded; see `bindingFromEvent`.
  if (/^[a-z]$/.test(chord.key) && chord.shift !== event.shiftKey) return false;
  return true;
}

/** The action an event triggers, or null. */
export function resolveAction(
  bindings: Readonly<Record<string, Binding>>,
  event: {
    readonly key: string;
    readonly shiftKey: boolean;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
  },
): string | null {
  for (const [action, binding] of Object.entries(bindings)) {
    if (matchesBinding(binding, event)) return action;
  }
  return null;
}
