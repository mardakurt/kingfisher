/**
 * A searchable index of every preference.
 *
 * Kingfisher has grown to nine sections of settings across ten phases, and the
 * honest consequence is that nobody can remember which one holds "threads" or
 * "piece set". §17's answer is a search box, and a search box needs something
 * to search: this table is it.
 *
 * Keywords are the words a user would actually type, including the ones the
 * label does not contain — somebody looking for the Lichess token searches
 * "token", not "Connect Lichess". Missing keywords are the whole failure mode,
 * so they are stored beside the entry rather than derived from the label.
 */

export type SettingsSection =
  | 'appearance'
  | 'board'
  | 'pieces'
  | 'workspace'
  | 'engine'
  | 'companion'
  | 'database'
  | 'accounts'
  | 'assistant'
  | 'keyboard'
  | 'profile'
  | 'diagnostics';

export interface SettingsEntry {
  readonly id: string;
  readonly label: string;
  readonly section: SettingsSection;
  /** Short human-readable description. §18: "Hash (MB)" explains nothing. */
  readonly description: string;
  readonly keywords: readonly string[];
}

export const SETTINGS_INDEX: readonly SettingsEntry[] = [
  {
    id: 'theme',
    label: 'Application theme',
    section: 'appearance',
    description: 'Dark or light chrome for the whole workspace.',
    keywords: ['dark', 'light', 'colour', 'color', 'night'],
  },
  {
    id: 'animation',
    label: 'Move animation',
    section: 'appearance',
    description:
      'How long a piece takes to slide to its square. Off also satisfies a system reduced-motion setting.',
    keywords: ['animation', 'speed', 'motion', 'slide'],
  },
  {
    id: 'arrow-palette',
    label: 'Arrow colours',
    section: 'appearance',
    description: 'Which four colours the annotation brushes draw with.',
    keywords: ['arrow', 'colourblind', 'colorblind', 'highlight', 'palette'],
  },
  {
    id: 'compact',
    label: 'Compact density',
    section: 'appearance',
    description:
      'Less padding around panels, so more of the window is board and evidence. Text size and hit targets are unchanged.',
    keywords: ['compact', 'density', 'padding', 'small', 'tight'],
  },
  {
    id: 'board-theme',
    label: 'Board theme',
    section: 'board',
    description: 'The colours of the squares.',
    keywords: ['board', 'squares', 'theme', 'wood', 'walnut', 'green', 'blue'],
  },
  {
    id: 'coordinates',
    label: 'Coordinates',
    section: 'board',
    description: 'Where the file and rank labels are drawn, if at all.',
    keywords: ['coordinates', 'files', 'ranks', 'labels', 'a1'],
  },
  {
    id: 'evaluation-bar',
    label: 'Evaluation bar',
    section: 'board',
    description: 'The vertical bar beside the board showing the current evaluation.',
    keywords: ['evaluation', 'bar', 'score', 'advantage'],
  },
  {
    id: 'evaluation-graph',
    label: 'Evaluation graph',
    section: 'board',
    description: 'The bar chart of stored evaluations under the board.',
    keywords: ['evaluation', 'graph', 'chart', 'history'],
  },
  {
    id: 'piece-set',
    label: 'Piece set',
    section: 'pieces',
    description: 'Which artwork the pieces are drawn with.',
    keywords: ['piece', 'pieces', 'set', 'staunton', 'merida', 'cburnett', 'artwork'],
  },
  {
    id: 'layout-preset',
    label: 'Workspace layout',
    section: 'workspace',
    description: 'Where each panel sits, saved per workspace and per device size.',
    keywords: ['layout', 'panel', 'dock', 'preset', 'workspace', 'arrange', 'reset'],
  },
  {
    id: 'pinned-tools',
    label: 'Pinned tools',
    section: 'workspace',
    description: 'Which tools stay visible in the tab strip instead of living under More.',
    keywords: ['pin', 'pinned', 'favourite', 'favorite', 'tabs', 'tools', 'more'],
  },
  {
    id: 'engine-threads',
    label: 'Threads',
    section: 'engine',
    description:
      'How many CPU cores the engine searches with. More is faster, but leaves less for the rest of the machine.',
    keywords: ['threads', 'cores', 'cpu', 'speed', 'performance'],
  },
  {
    id: 'engine-hash',
    label: 'Hash',
    section: 'engine',
    description:
      'Memory the engine keeps its search table in. A larger table means fewer positions re-searched, up to the point your machine starts swapping.',
    keywords: ['hash', 'memory', 'ram', 'mb', 'table', 'transposition'],
  },
  {
    id: 'engine-multipv',
    label: 'Lines',
    section: 'engine',
    description:
      'How many candidate moves the engine reports. Each extra line costs search depth on the others.',
    keywords: ['multipv', 'lines', 'candidates', 'variations'],
  },
  {
    id: 'engine-choice',
    label: 'Primary engine',
    section: 'engine',
    description: 'Which engine the panel drives, and which it compares against.',
    keywords: ['engine', 'stockfish', 'lc0', 'leela', 'neural', 'weights', 'backend'],
  },
  {
    id: 'companion',
    label: 'Local companion',
    section: 'companion',
    description:
      'A small local service that gives Kingfisher access to native engines, SQLite databases and local Syzygy tablebases.',
    keywords: ['companion', 'local', 'sqlite', 'native', 'syzygy', 'tablebase', 'pair', 'token'],
  },
  {
    id: 'lichess-token',
    label: 'Lichess token',
    section: 'database',
    description:
      'A personal API token. Lichess requires one for opening explorer requests; Kingfisher cannot ship a shared credential.',
    keywords: ['lichess', 'token', 'api', 'explorer', 'account', 'connect'],
  },
  {
    id: 'explorer-source',
    label: 'Explorer source',
    section: 'database',
    description: 'Which database the explorer reads at the current position.',
    keywords: ['explorer', 'database', 'source', 'masters', 'provider'],
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    section: 'keyboard',
    description: 'Rebind any command, and see which bindings conflict.',
    keywords: ['keyboard', 'shortcut', 'shortcuts', 'binding', 'keys', 'hotkey', 'rebind'],
  },
  {
    id: 'aliases',
    label: 'Player aliases',
    section: 'profile',
    description: 'The exact names you appear under in your own PGNs, so Kingfisher can find you.',
    keywords: ['alias', 'name', 'profile', 'me', 'my games', 'player'],
  },
  {
    id: 'linked-accounts',
    label: 'Linked accounts',
    section: 'accounts',
    description:
      'Lichess and Chess.com usernames whose games are pulled into the local collection. No Kingfisher account, and nothing is uploaded.',
    keywords: ['lichess', 'chess.com', 'chesscom', 'account', 'link', 'online', 'username'],
  },
  {
    id: 'account-sync',
    label: 'Sync games',
    section: 'accounts',
    description:
      'Fetch new games from a linked account. Incremental: only material newer than the last sync is requested.',
    keywords: ['sync', 'refresh', 'download', 'import', 'games', 'online', 'update'],
  },
  {
    id: 'backup',
    label: 'Backup and restore',
    section: 'diagnostics',
    description: 'Export everything, or import a previous export.',
    keywords: ['backup', 'export', 'import', 'restore', 'storage', 'data'],
  },
  {
    id: 'settings-transfer',
    label: 'Export settings',
    section: 'diagnostics',
    description:
      'Preferences and layouts only, without any chess data and without any secret. See the export itself for what is excluded.',
    keywords: ['export', 'import', 'settings', 'preferences', 'transfer', 'layout'],
  },
  {
    id: 'integrity',
    label: 'Integrity check',
    section: 'diagnostics',
    description: 'Scan stored records for damage, and repair what can be repaired.',
    keywords: ['integrity', 'repair', 'corrupt', 'scan', 'damage'],
  },
];

/**
 * Settings matching a query, best first.
 *
 * Ranking is deliberately crude — a label match beats a keyword match beats a
 * description match — because the corpus is twenty-odd entries and anything
 * cleverer would be untestable ceremony. What matters is that typing
 * "threads", "piece set", "token", "compact" or "tablebase" puts the right
 * setting first, which is what the tests assert.
 */
export function searchSettings(query: string): readonly SettingsEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const scored = SETTINGS_INDEX.map((entry) => {
    const label = entry.label.toLowerCase();
    let score = 0;
    if (label === needle) score = 100;
    else if (label.startsWith(needle)) score = 80;
    else if (label.includes(needle)) score = 60;
    else if (entry.keywords.some((word) => word === needle)) score = 50;
    else if (entry.keywords.some((word) => word.startsWith(needle))) score = 40;
    else if (entry.description.toLowerCase().includes(needle)) score = 20;
    return { entry, score };
  }).filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  return scored.map((item) => item.entry);
}
