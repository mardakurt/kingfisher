# The legacy GitHub Pages entry

Not the landing page. The landing is `/` of the Next.js application at
<https://kingfisherchess.app/> (`src/app/landing/`), and this directory is
the small page that the old address, <https://mardakurt.github.io/kingfisher-data/>,
still serves: `index.html` forwards to kingfisherchess.app (a meta refresh and
a script fallback) and says so in one line, so links to the old address do not
break. The Kingfisher mark in `assets/img/` is the current one.

`style.css`, `anim.js` and the screenshots in `assets/img/` belonged to the
full landing this page used to be. They are still published beside it but
nothing links to them.

## Deploy

The page lives in the `mardakurt/kingfisher-data` repository, which is also the
reference-data mirror the application downloads packs from. It is published
with

```bash
npm run publish:site -- --diff
```

first (a dry run that shows what would change), then `-- --apply`.
`scripts/publish-site.mjs` touches only `index.html`, `assets/`,
`manifest.webmanifest`, `robots.txt`, `README.md` and `.nojekyll`, and refuses
to remove anything under a `reference-*` directory. It last ran on 2026-09-27
(kingfisher-data `726b89f`), replacing a copy of the previous full landing that
was still being served with the old mark.
