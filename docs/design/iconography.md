# Iconography

Kingfisher uses one original vector family in `src/components/icons.tsx`.
Avoiding a runtime icon dependency keeps the vocabulary small, reviewable and
bundle-neutral. The artwork is original Kingfisher code and requires no
third-party licence entry.

## Construction

- 24×24 viewBox
- 1.75px stroke
- round caps and joins
- `currentColor`
- no decorative gradients or raster artwork
- tested at 16, 20, 24 and 32px

Generic actions use conventional forms: magnifier, sliders, close, arrows,
copy, import/export and delete. Chess sections use purpose-drawn forms:
Analysis is a board, Openings a move branch, Repertoire a prepared document,
Preparation a target, Studies a notebook, Review a magnified position,
Training a recall loop, Endgame a lone king, and Opening Files a dossier.
Players uses two people and Databases an archive cylinder. No primary route
shares a component; `navigation.test.ts` enforces that invariant.

Icons never supply an accessible name by themselves. Their SVGs are hidden
from assistive technology; the surrounding button or link supplies visible
text or an `aria-label`. Collapsed navigation retains both an accessible label
and a descriptive tooltip.

`/dev/icons` renders every primary and major generic icon at all production
sizes in both themes during development. The route calls `notFound()` in a
production build and is not present in product navigation.
