'use client';

/**
 * The tour of the sidebar.
 *
 * Phase 56 change: new users used to be dropped into a 13-section
 * sidebar with no orientation. The tour walks through each section in
 * one screenful, with what it is for and one concrete thing the user
 * will do there.
 *
 * Phase 61: the tour is no longer opened automatically. Phase 56 had
 * it auto-open on first launch and remember the dismiss via a
 * `tourShowOnLaunch` preference. The user wanted neither — neither the
 * prompt nor the opening tour. The tour is reachable on demand, from
 * Settings → Help ("Open the tour guide of the website"), and that is
 * the only way it opens. Phase 71 mounted it again — Phase 61 had
 * unmounted the dialog and Phase 62 added the Settings link to a dialog
 * nothing rendered — and removed the preference and its checkbox, which
 * had gone on being written while nothing read them.
 *
 * Phase 57: keyboard navigation. Left/Right arrows advance and retreat
 * through the steps, Esc closes and marks the tour as seen (the same
 * as the close button), and the title row now states the shortcuts so
 * a keyboard user knows they exist.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  Board,
  Clock,
  Dossier,
  Library,
  Notebook,
  PlayPosition,
  Repertoire,
  Recall,
  Search,
  Target,
  Players,
} from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useUi } from '@/stores/ui-store';

import { NAV_SECTIONS } from './navigation';

interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly icon: React.ReactNode;
}

const STEPS: readonly TourStep[] = NAV_SECTIONS.map((section) => ({
  id: section.id,
  title: section.label,
  detail: sectionTourDetail(section.id),
  icon: iconForSection(section.id),
}));

function iconForSection(id: string): React.ReactNode {
  switch (id) {
    case 'recent':
      // Phase 62: 'recent' is the first NAV_SECTION but had no case
      // here, so the tour opened with the Analysis (Board) icon next
      // to the Recent label. Users saw a step called "Recent" with
      // an Analysis icon — a misleading first impression. The icon
      // is the same one the sidebar uses for Recent (Clock).
      return <Clock />;
    case 'analysis':
      return <Board />;
    case 'preparation':
      return <Target />;
    case 'openings':
      return <Library />;
    case 'opening-files':
      return <Dossier />;
    case 'training':
      return <Recall />;
    case 'endgame':
      return <Repertoire />;
    case 'repertoire':
      return <Notebook />;
    case 'review':
      return <Search />;
    case 'studies':
      return <Notebook />;
    case 'games':
      return <PlayPosition />;
    case 'players':
      return <Players />;
    default:
      return <Board />;
  }
}

function sectionTourDetail(id: string): string {
  switch (id) {
    case 'recent':
      return 'Continue where you left off. Recent keeps your last studies, repertoires and opened games in one place; pinned work stays at the top.';
    case 'analysis':
      return 'Open any position with the engine running beside it. The companion handles local Syzygy and Stockfish when paired.';
    case 'preparation':
      return 'A target page for one opponent or one line. Pull the games you want from Lichess, Chess.com or a PGN file in one place.';
    case 'openings':
      return 'The opening library reports on what every line you have studied does, where it goes, and how often it wins.';
    case 'opening-files':
      return 'A folder of openings per subject. Each file holds your repertoire moves, key games, and your annotations on them.';
    case 'training':
      return 'Spaced repetition over positions you have studied. The schedule learns from how you answered last time.';
    case 'endgame':
      return 'Saved endgames, tablebase lookups when Syzygy is installed, and the engine beside the position.';
    case 'repertoire':
      return 'Your repertoire as a tree of moves, with what is missing, what is underexplored, and what the engine thinks.';
    case 'review':
      return 'Look through your finished games and find the moments worth a study session — engine error, tactical miss, time trouble.';
    case 'studies':
      return 'Long-form notes with chapters, comments and engine annotations. The same chapter can hold a hundred variations.';
    case 'games':
      return 'Every imported game, searchable by player, opening, date. Filter to "my games" once you set up an account.';
    case 'players':
      return 'A roster of players you keep an eye on, with their games pulled in via Lichess or Chess.com usernames.';
    default:
      return '';
  }
}

export function FirstRunTour() {
  const open = useUi((state) => state.tourOpen);
  const setOpen = useUi((state) => state.setTourOpen);
  const [stepIndex, setStepIndex] = useState(0);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  /*
   * `close` is defined above the early return so the keyboard handler
   * (declared below) can call it without falling into the temporal-dead-
   * zone the rules-of-hooks lint catches. useCallback keeps its identity
   * stable across renders so the effect's dependency array does not
   * re-register the listener on every render.
   */
  const close = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
  }, [setOpen]);

  /*
   * Phase 57: keyboard navigation. The keyboard handler is registered
   * only while the dialog is open and ignores keystrokes typed into a
   * real input, so a field that later joins the dialog cannot advance
   * the tour with a spacebar. The hook is declared before the early return
   * below so the hook order is stable across the open → closed →
   * open transition — otherwise the React rules-of-hooks lint trips
   * the moment the user closes the tour.
   */
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStepIndex((current) => Math.max(0, current - 1));
      } else if (event.key === 'Escape') {
        /*
         * Escape closes — the same as the close button and the Skip /
         * Done buttons. The Dialog component also listens for Escape and
         * calls onClose; whichever listener wins, the second call is a
         * no-op because `setOpen(false)` is idempotent.
         */
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  if (!open || !step) return null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Tour · step ${stepIndex + 1} of ${STEPS.length} · ←/→ to step · Esc to close`}
    >
      <div className="flex flex-col gap-4 px-1 py-1">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-surface-2 text-accent">
            {step.icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary">{step.title}</h2>
          </div>
        </div>
        <p className="text-2xs leading-relaxed text-secondary">{step.detail}</p>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Skip
            </Button>
            {isLast ? (
              <Button variant="accent" size="sm" onClick={close}>
                Done
              </Button>
            ) : (
              <Button variant="accent" size="sm" onClick={() => setStepIndex(stepIndex + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
