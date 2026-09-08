# Kingfisher marketing site

The public landing page. A single HTML file, one CSS file, one
animation script and a few images. No framework, no build step, no
runtime dependencies.

## Develop

Open `index.html` directly in a browser. Everything is in the
`marketing/` directory; nothing else in the repository is needed.

## Deploy

The site is intended to be served as a flat collection of static
files. Any of these is a valid host:

- GitHub Pages from a dedicated `kingfisher-data` repository.
- A Vercel project — `vercel deploy marketing --prod`.
- Netlify drag-and-drop of the `marketing/` directory.

The published URL is whatever the host gives it. The repo currently
serves it from <https://mardakurt.github.io/kingfisher-data/>.

## What it links to

- The web app (deploy via Vercel from the repository root).
- The macOS preview DMG (GitHub Releases for the kingfisher repo).
- The GitHub repository.
- The reference-pack manifests (same host, under
  `reference-elite-v2/manifest.json` etc.).
