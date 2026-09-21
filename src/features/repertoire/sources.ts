/** The reference populations a repertoire can be read against, bundled pack first. */
export const SOURCES = [
  // The bundled pack first: it is on every machine, so a repertoire can be
  // checked against a real population before any optional pack is installed.
  { id: 'kingfisher-starter', label: 'Starter' },
  { id: 'kingfisher-elite-otb', label: 'Elite OTB' },
  { id: 'kingfisher-recent-theory', label: 'Recent Theory (2y)' },
  { id: 'kingfisher-recent-theory-narrow', label: 'Recent Theory (6m)' },
  { id: 'kingfisher-high-rated-online', label: 'High-Rated Online' },
] as const;

export type SourceId = (typeof SOURCES)[number]['id'];
