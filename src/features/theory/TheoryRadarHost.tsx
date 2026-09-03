'use client';

/**
 * The dock's entry into the radar.
 *
 * It picks the source from the user's own database preference rather than
 * choosing one, because comparing windows across two different collections
 * would be comparing collections and calling it a trend.
 */

import { TheoryRadarPanel } from './TheoryRadarPanel';
import { usePreferences } from '@/stores/preferences-store';

export function TheoryRadarHost() {
  const sourceId = usePreferences((state) => state.explorerSourceId);
  return <TheoryRadarPanel sourceId={sourceId} />;
}
