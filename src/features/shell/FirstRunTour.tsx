'use client';

/**
 * The first-run tour.
 *
 * Phase 56 change: new users used to be dropped into a 13-section
 * sidebar with no orientation. The tour walks through each section in
 * one screenful, with what it is for and one concrete thing the user
 * will do there. It is opt-out, not opt-in:
 *
 *   - On the first app launch it opens once.
 *   - A "Don't show on launch" toggle on the final screen writes a
 *     preference, and the tour never opens automatically again.
 *   - It is always reachable from the Help menu (in the Settings
 *     dialog under Help and feedback) for users who dismissed it and
 *     later want it back.
 *
 * The tour does not show on every visit, including web users whose
 * cookies clear between sessions. A user who likes the tour can keep
 * the auto-show on; a user who does not should not see it again.
 */

import { useState } from 'react';

import { Board, Dossier, Library, Notebook, Pin, PlayPosition, Repertoire, Search, Target, Players } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

import { NAV_SECTIONS } from './navigation';

interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
  readonly icon: React.ReactNode;
}

const STEPS: readonly TourStep[] = NAV_SECTIONS.map((section) => ({
  id: section.id,
  title: section.label,
  description: section.label,
  detail: sectionTourDetail(section.id),
  icon: iconForSection(section.id),
}));

function iconForSection(id: string): React.ReactNode {
  switch (id) {
    case 'analysis':
      return <Board />;
    case 'preparation':
      return <Target />;
    case 'openings':
      return <Library />;
    case 'opening-files':
      return <Dossier />;
    case 'training':
      return <Pin />;
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
  const prefs = usePreferences();
  const showOnLaunch = prefs.tourShowOnLaunch ?? true;
  const [stepIndex, setStepIndex] = useState(0);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  if (!open || !step) return null;

  const close = (markSeen: boolean) => {
    if (markSeen) prefs.set('tourShowOnLaunch', false);
    setOpen(false);
    setStepIndex(0);
  };

  return (
    <Dialog
      open={open}
      onClose={() => close(!isLast)}
      title={`Tour · step ${stepIndex + 1} of ${STEPS.length}`}
    >
      <div className="flex flex-col gap-4 px-1 py-1">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-surface-2 text-accent">
            {step.icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-primary">{step.title}</h2>
            <p className="text-2xs text-tertiary">{step.description}</p>
          </div>
        </div>
        <p className="text-2xs leading-relaxed text-secondary">{step.detail}</p>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-2xs text-tertiary">
            <input
              type="checkbox"
              checked={!showOnLaunch}
              onChange={(event) => prefs.set('tourShowOnLaunch', !event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span>Don't show on launch</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => close(true)}>
              Skip
            </Button>
            {isLast ? (
              <Button variant="accent" size="sm" onClick={() => close(true)}>
                Done
              </Button>
            ) : (
              <Button
                variant="accent"
                size="sm"
                onClick={() => {
                  if (stepIndex === STEPS.length - 2) {
                    prefs.set('tourShowOnLaunch', false);
                  }
                  setStepIndex(stepIndex + 1);
                }}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Imperative entry point used by the Help menu and the launch hook.
 */
export function startTour(): void {
  useUi.setState({ tourOpen: true });
}