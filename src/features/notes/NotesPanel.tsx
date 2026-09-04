'use client';

import { observationNags, positionNags, qualityNags } from '@/chess/annotations';
import { Trash } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';

/**
 * Annotation for the current move.
 *
 * Comments and glyphs are chess data — they round-trip through PGN and belong
 * to the node, not to a side table — so this panel edits the tree directly.
 */
export function NotesPanel() {
  const { node, currentId } = useAnalysisPosition();
  const comment = useAnalysis((state) => state.comment);
  const toggleNag = useAnalysis((state) => state.toggleNag);
  const clearShapes = useAnalysis((state) => state.clearShapes);

  const isRoot = node.move === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          node.shapes.length > 0 ? (
            <Button size="sm" icon={<Trash />} onClick={() => clearShapes(currentId)}>
              {node.shapes.length} shape{node.shapes.length === 1 ? '' : 's'}
            </Button>
          ) : null
        }
      >
        {isRoot ? 'Game commentary' : `Note on ${node.move?.san}`}
      </PanelHeader>

      <PanelBody className="flex flex-col gap-3 p-2.5">
        {/*
          Keyed by node so that moving the cursor loads that move's note; the
          field is uncontrolled, so typing does not re-render the tree on every
          keystroke, and the value is committed on blur.
        */}
        <textarea
          key={currentId}
          /*
            A placeholder is not a name. Screen readers announce the placeholder
            only while the field is empty, so the moment somebody types a note
            the field goes nameless — which is exactly when they most need to be
            able to find it again.
          */
          aria-label={isRoot ? 'Note about this game or position' : 'Note about this move'}
          defaultValue={node.comment ?? ''}
          onBlur={(event) => comment(currentId, event.target.value)}
          placeholder={
            isRoot
              ? 'What is this game or position about?'
              : 'What is the idea? What did you miss? What should you remember?'
          }
          className="h-28 w-full resize-none rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 text-xs leading-relaxed text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
        />

        {isRoot ? (
          <EmptyState
            title="Move annotations appear here"
            description="Select a move to give it a glyph, a comment, arrows or highlighted squares."
          />
        ) : (
          <>
            <NagGroup
              title="Move"
              nags={qualityNags}
              active={node.nags}
              onToggle={(code) => toggleNag(currentId, code)}
            />
            <NagGroup
              title="Position"
              nags={positionNags}
              active={node.nags}
              onToggle={(code) => toggleNag(currentId, code)}
            />
            <NagGroup
              title="Observation"
              nags={observationNags}
              active={node.nags}
              onToggle={(code) => toggleNag(currentId, code)}
            />

            <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
              Right-drag on the board to draw an arrow, right-click to highlight a square. Hold ⇧
              for red, ⌥ for blue, ⇧⌥ for yellow. Everything here is written back out with the PGN.
            </p>
          </>
        )}
      </PanelBody>
    </div>
  );
}

interface NagGroupProps {
  readonly title: string;
  readonly nags: readonly { code: number; symbol: string; label: string }[];
  readonly active: readonly number[];
  readonly onToggle: (code: number) => void;
}

const NagGroup = ({ title, nags, active, onToggle }: NagGroupProps) => (
  <section>
    <h3 className="mb-1 text-[10px] uppercase tracking-wide text-tertiary">{title}</h3>
    <div className="flex flex-wrap gap-1">
      {nags.map((nag) => (
        <button
          key={nag.code}
          type="button"
          title={nag.label}
          aria-pressed={active.includes(nag.code)}
          onClick={() => onToggle(nag.code)}
          className={cn(
            'h-6 min-w-7 rounded-[4px] border px-1.5 text-xs transition-colors',
            active.includes(nag.code)
              ? 'border-accent bg-accent-muted text-primary'
              : 'border-line bg-surface-2 text-secondary hover:border-line-strong hover:text-primary',
          )}
        >
          {nag.symbol}
        </button>
      ))}
    </div>
  </section>
);
