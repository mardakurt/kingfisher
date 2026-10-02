/** Header-only selection, before PGN parsing. Missing ratings cannot meet a rating floor. */
export function importFilter(tags, options = {}) {
  if (options.excludeBots && (tags.WhiteTitle === 'BOT' || tags.BlackTitle === 'BOT')) return false;
  const floor = options.minRating ?? 0;
  if (!Number.isInteger(floor) || floor < 0 || floor > 4000)
    throw new Error('Rating floor must be 0–4000.');
  if (floor > 0 && (!(Number(tags.WhiteElo) >= floor) || !(Number(tags.BlackElo) >= floor)))
    return false;
  return !tags.Variant || tags.Variant === 'Standard';
}
