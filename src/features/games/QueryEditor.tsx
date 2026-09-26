'use client';

/**
 * A query built in the interface, with `and`, `or` and `not` (Phase 86, P0.2).
 *
 * The Library's filters are a conjunction — every field narrows. Some
 * questions are not: "a Sicilian or a French, but not a draw". This builds
 * any query the model (`src/database/query/ast.ts`) can express as a tree of
 * groups — "all of these", "any of these" — with each condition or group
 * negatable, says the result in words as it is built (with what it leaves out
 * for want of a field), refuses a query that cannot mean anything with the
 * reason, and saves it as a saved query that runs like any other.
 */

import { useState } from 'react';

import { positionKey } from '@/chess/fen';
import { STRATEGIC_THEMES } from '@/chess/themes';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  describeQuery,
  parseQuery,
  QUERY_VERSION,
  type GameQuery,
  type QueryNode,
  type QueryPredicate,
} from '@/database/query/ast';
import { TIME_CLASSES, TIME_CLASS_LABEL } from '@/search/time-control';
import { useAnalysis } from '@/stores/analysis-store';

type PredicateType = QueryPredicate['type'];

const KINDS: readonly { readonly type: PredicateType; readonly label: string }[] = [
  { type: 'player', label: 'Player' },
  { type: 'text', label: 'Text (names, event, opening)' },
  { type: 'result', label: 'Result' },
  { type: 'year', label: 'Year' },
  { type: 'date', label: 'Date' },
  { type: 'rating', label: 'Rating' },
  { type: 'ratingDifference', label: 'Rating difference' },
  { type: 'event', label: 'Event' },
  { type: 'site', label: 'Site' },
  { type: 'eco', label: 'ECO' },
  { type: 'opening', label: 'Opening name' },
  { type: 'timeClass', label: 'Time control' },
  { type: 'position', label: 'Position (the board’s)' },
  { type: 'material', label: 'Material' },
  { type: 'theme', label: 'Theme' },
  { type: 'route', label: 'Piece route' },
  { type: 'comment', label: 'Comment text' },
  { type: 'nag', label: 'Annotation symbol' },
];

const NAGS = [
  { code: 1, label: '! good move' },
  { code: 2, label: '? mistake' },
  { code: 3, label: '!! brilliant' },
  { code: 4, label: '?? blunder' },
  { code: 5, label: '!? interesting' },
  { code: 6, label: '?! dubious' },
];

const FIELD =
  'h-7 min-w-0 rounded-[5px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary';

function blank(type: PredicateType, boardKey: string): QueryPredicate {
  switch (type) {
    case 'player':
      return { type, name: '' };
    case 'text':
      return { type, value: '' };
    case 'result':
      return { type, value: '1-0' };
    case 'year':
      return { type, from: new Date().getFullYear() - 1 };
    case 'date':
      return { type, from: `${new Date().getFullYear()}-01-01` };
    case 'rating':
      return { type, min: 2200 };
    case 'ratingDifference':
      return { type, min: 0 };
    case 'event':
    case 'site':
    case 'opening':
    case 'comment':
      return { type, contains: '' };
    case 'eco':
      return { type, prefix: '' };
    case 'timeClass':
      return { type, value: 'classical' };
    case 'position':
      return { type, key: boardKey };
    case 'material':
      return { type, text: 'R v B' };
    case 'theme':
      return { type, id: STRATEGIC_THEMES[0]!.id };
    case 'route':
      return { type, text: 'N g1 f3' };
    case 'nag':
      return { type, code: 1 };
  }
}

const numberOrUndefined = (text: string) => (text.trim() === '' ? undefined : Number(text));

function PredicateFields({
  node,
  onChange,
  boardKey,
}: {
  readonly node: QueryPredicate;
  readonly onChange: (node: QueryPredicate) => void;
  readonly boardKey: string;
}) {
  const text = (label: string, value: string, set: (value: string) => void, placeholder = '') => (
    <input
      aria-label={label}
      className={`${FIELD} flex-1`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => set(event.target.value)}
    />
  );
  const num = (
    label: string,
    value: number | undefined,
    set: (value: number | undefined) => void,
  ) => (
    <input
      aria-label={label}
      inputMode="numeric"
      className={`${FIELD} w-20`}
      value={value ?? ''}
      placeholder={label}
      onChange={(event) => set(numberOrUndefined(event.target.value.replace(/[^\d-]/g, '')))}
    />
  );
  switch (node.type) {
    case 'player':
      return (
        <>
          {text(
            'Player name',
            node.name,
            (name) => onChange({ ...node, name }),
            'Surname, Forename',
          )}
          <select
            aria-label="Colour"
            className={FIELD}
            value={node.color ?? ''}
            onChange={(event) => {
              const { color: _drop, ...rest } = node;
              void _drop;
              onChange(
                event.target.value ? { ...rest, color: event.target.value as 'w' | 'b' } : rest,
              );
            }}
          >
            <option value="">either colour</option>
            <option value="w">as White</option>
            <option value="b">as Black</option>
          </select>
        </>
      );
    case 'text':
      return text('Text', node.value, (value) => onChange({ ...node, value }));
    case 'result':
      return (
        <select
          aria-label="Result"
          className={FIELD}
          value={node.value}
          onChange={(event) =>
            onChange({ ...node, value: event.target.value as typeof node.value })
          }
        >
          <option value="1-0">White won</option>
          <option value="0-1">Black won</option>
          <option value="1/2-1/2">Drawn</option>
          <option value="*">Unfinished</option>
        </select>
      );
    case 'year':
      return (
        <>
          {num('From year', node.from, (from) =>
            onChange({
              type: 'year',
              ...(from !== undefined ? { from } : {}),
              ...(node.to !== undefined ? { to: node.to } : {}),
            }),
          )}
          {num('To year', node.to, (to) =>
            onChange({
              type: 'year',
              ...(node.from !== undefined ? { from: node.from } : {}),
              ...(to !== undefined ? { to } : {}),
            }),
          )}
        </>
      );
    case 'date':
      return (
        <>
          <input
            aria-label="From date"
            type="date"
            className={FIELD}
            value={node.from ?? ''}
            onChange={(event) =>
              onChange({
                type: 'date',
                ...(event.target.value ? { from: event.target.value } : {}),
                ...(node.to ? { to: node.to } : {}),
              })
            }
          />
          <input
            aria-label="To date"
            type="date"
            className={FIELD}
            value={node.to ?? ''}
            onChange={(event) =>
              onChange({
                type: 'date',
                ...(node.from ? { from: node.from } : {}),
                ...(event.target.value ? { to: event.target.value } : {}),
              })
            }
          />
        </>
      );
    case 'rating':
      return (
        <>
          {num('Minimum', node.min, (min) =>
            onChange({
              type: 'rating',
              ...(min !== undefined ? { min } : {}),
              ...(node.max !== undefined ? { max: node.max } : {}),
              ...(node.scope ? { scope: node.scope } : {}),
            }),
          )}
          {num('Maximum', node.max, (max) =>
            onChange({
              type: 'rating',
              ...(node.min !== undefined ? { min: node.min } : {}),
              ...(max !== undefined ? { max } : {}),
              ...(node.scope ? { scope: node.scope } : {}),
            }),
          )}
          <select
            aria-label="Whose rating"
            className={FIELD}
            value={node.scope ?? 'either'}
            onChange={(event) =>
              onChange({ ...node, scope: event.target.value as 'either' | 'both' })
            }
          >
            <option value="either">either player</option>
            <option value="both">both players</option>
          </select>
        </>
      );
    case 'ratingDifference':
      return (
        <>
          {num('White minus Black, at least', node.min, (min) =>
            onChange({
              type: 'ratingDifference',
              ...(min !== undefined ? { min } : {}),
              ...(node.max !== undefined ? { max: node.max } : {}),
            }),
          )}
          {num('at most', node.max, (max) =>
            onChange({
              type: 'ratingDifference',
              ...(node.min !== undefined ? { min: node.min } : {}),
              ...(max !== undefined ? { max } : {}),
            }),
          )}
        </>
      );
    case 'event':
    case 'site':
    case 'opening':
    case 'comment':
      return text(`${node.type} contains`, node.contains, (contains) =>
        onChange({ ...node, contains }),
      );
    case 'eco':
      return text(
        'ECO starts with',
        node.prefix,
        (prefix) => onChange({ ...node, prefix: prefix.toUpperCase().slice(0, 3) }),
        'B9',
      );
    case 'timeClass':
      return (
        <select
          aria-label="Time control"
          className={FIELD}
          value={node.value}
          onChange={(event) =>
            onChange({ ...node, value: event.target.value as typeof node.value })
          }
        >
          {TIME_CLASSES.map((entry) => (
            <option key={entry} value={entry}>
              {TIME_CLASS_LABEL[entry]}
            </option>
          ))}
        </select>
      );
    case 'position':
      return (
        <>
          <span className="truncate text-[10.5px] text-tertiary" title={node.key}>
            {node.key === boardKey ? 'the position on the board' : 'a saved position'}
          </span>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...node, key: boardKey })}>
            Use the board’s
          </Button>
          <label className="flex items-center gap-1 text-[10.5px] text-tertiary">
            <input
              type="checkbox"
              checked={Boolean(node.inVariations)}
              onChange={(event) =>
                onChange({
                  type: 'position',
                  key: node.key,
                  ...(event.target.checked ? { inVariations: true } : {}),
                })
              }
            />
            variations too
          </label>
        </>
      );
    case 'material':
      return text('Material', node.text, (value) => onChange({ ...node, text: value }), 'R v B');
    case 'theme':
      return (
        <select
          aria-label="Theme"
          className={FIELD}
          value={node.id}
          onChange={(event) => onChange({ ...node, id: event.target.value })}
        >
          {STRATEGIC_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      );
    case 'route':
      return text('Route', node.text, (value) => onChange({ ...node, text: value }), 'N g1 f3 d4');
    case 'nag':
      return (
        <select
          aria-label="Symbol"
          className={FIELD}
          value={node.code}
          onChange={(event) => onChange({ ...node, code: Number(event.target.value) })}
        >
          {NAGS.map((nag) => (
            <option key={nag.code} value={nag.code}>
              {nag.label}
            </option>
          ))}
        </select>
      );
  }
}

function NodeEditor({
  node,
  onChange,
  onRemove,
  boardKey,
  depth,
}: {
  readonly node: QueryNode;
  readonly onChange: (node: QueryNode) => void;
  readonly onRemove?: () => void;
  readonly boardKey: string;
  readonly depth: number;
}) {
  const negated = node.type === 'not';
  const inner = negated ? node.of : node;
  const wrap = (next: QueryNode) => onChange(negated ? { type: 'not', of: next } : next);
  const toggleNot = (
    <label className="flex items-center gap-1 text-[10.5px] text-tertiary">
      <input
        type="checkbox"
        checked={negated}
        onChange={(event) => onChange(event.target.checked ? { type: 'not', of: inner } : inner)}
      />
      not
    </label>
  );
  if (inner.type === 'and' || inner.type === 'or') {
    const group = inner;
    return (
      <div
        className="flex flex-col gap-1.5 rounded-[6px] border border-line p-2"
        data-query-group={group.type}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {depth > 0 ? toggleNot : null}
          <select
            aria-label="Group"
            className={FIELD}
            value={group.type}
            onChange={(event) => wrap({ type: event.target.value as 'and' | 'or', of: group.of })}
          >
            <option value="and">All of these</option>
            <option value="or">Any of these</option>
          </select>
          <select
            aria-label="Add a condition"
            className={FIELD}
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              wrap({
                ...group,
                of: [...group.of, blank(event.target.value as PredicateType, boardKey)],
              });
            }}
          >
            <option value="">Add a condition…</option>
            {KINDS.map((kind) => (
              <option key={kind.type} value={kind.type}>
                {kind.label}
              </option>
            ))}
          </select>
          {depth < 3 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => wrap({ ...group, of: [...group.of, { type: 'or', of: [] }] })}
            >
              Add a group
            </Button>
          ) : null}
          {onRemove ? (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove group
            </Button>
          ) : null}
        </div>
        {group.of.map((child, index) => (
          <NodeEditor
            key={index}
            node={child}
            depth={depth + 1}
            boardKey={boardKey}
            onChange={(next) =>
              wrap({ ...group, of: group.of.map((entry, at) => (at === index ? next : entry)) })
            }
            onRemove={() => wrap({ ...group, of: group.of.filter((_, at) => at !== index) })}
          />
        ))}
      </div>
    );
  }
  if (inner.type === 'not') {
    // "not not": shown as written, one negation inside the other.
    return (
      <div className="flex flex-col gap-1 pl-2">
        {toggleNot}
        <NodeEditor
          node={inner}
          depth={depth + 1}
          boardKey={boardKey}
          onChange={wrap}
          {...(onRemove ? { onRemove } : {})}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-query-condition={inner.type}>
      {toggleNot}
      <span className="w-28 shrink-0 text-[10.5px] text-secondary">
        {KINDS.find((kind) => kind.type === inner.type)?.label}
      </span>
      <PredicateFields node={inner} boardKey={boardKey} onChange={(next) => wrap(next)} />
      {onRemove ? (
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove condition">
          ×
        </Button>
      ) : null}
    </div>
  );
}

export function QueryEditorDialog({
  initial,
  onSave,
  onClose,
}: {
  readonly initial?: { readonly name: string; readonly query: GameQuery };
  readonly onSave: (name: string, query: GameQuery) => Promise<void>;
  readonly onClose: () => void;
}) {
  const fen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? '');
  const boardKey = fen ? positionKey(fen) : '';
  const [name, setName] = useState(initial?.name ?? '');
  const [query, setQuery] = useState<GameQuery>(
    initial?.query ?? { version: QUERY_VERSION, where: { type: 'and', of: [] } },
  );
  const parsed = parseQuery(query);
  const words = parsed.ok ? describeQuery(parsed.query) : null;
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open
      onClose={onClose}
      title={initial ? `Edit “${initial.name}”` : 'New query'}
      description="Groups of conditions: all of them, or any of them, and any condition or group can be turned into its opposite. The query is saved with your saved queries and runs over My games."
      width="w-[760px]"
      footer={
        <>
          <input
            aria-label="Query name"
            placeholder="Name"
            className={`${FIELD} h-8 w-56`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            variant="accent"
            disabled={!parsed.ok || !name.trim() || saving}
            onClick={async () => {
              if (!parsed.ok) return;
              setSaving(true);
              try {
                await onSave(name.trim(), parsed.query);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            Save query
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-xs" data-query-editor>
        <NodeEditor
          node={query.where}
          depth={0}
          boardKey={boardKey}
          onChange={(where) => setQuery({ ...query, where })}
        />
        <section className="rounded-[6px] bg-surface-2 p-2" aria-live="polite">
          {words ? (
            <>
              <p className="text-secondary" data-query-words>
                Games where {words.summary}.
              </p>
              {words.exclusions.map((note) => (
                <p key={note} className="text-[10.5px] text-tertiary">
                  {note}
                </p>
              ))}
            </>
          ) : (
            <p className="text-negative" role="alert" data-query-error>
              {parsed.ok ? '' : parsed.error}
            </p>
          )}
        </section>
      </div>
    </Dialog>
  );
}
