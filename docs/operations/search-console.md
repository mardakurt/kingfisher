# Search Console

How to register the Kingfisher landing in Google Search
Console, the technical preparation the application has already
done, and the **owner steps** that require the owner's
Google account.

This file is part of the canonical documentation. The
companion script in `scripts/docs-check.mjs` asserts that the
sitemap, robots and canonical URL are present at the
production origin.

## What is already in place

- **Brand in the H1.** The landing's `<h1>` is "Kingfisher Chess.
  Research, in one place." — not just "Chess research" — so a
  search for "kingfisher chess" finds this product rather than
  the bird, the Martin Scorsese film, or the kayak that share
  the bare name.
- **Brand in the title.** `<title>` defaults to "Kingfisher Chess
  — chess research workspace". The `template` ("%s · Kingfisher
  Chess") keeps the brand on inner pages.
- **Expanded keywords.** `keywords` lists the actual phrases a
  chess player might search: `chess`, `chess analysis`, `chess
engine`, `Stockfish`, `chess opening explorer`, `chess
database`, `chess repertoire`, `chess training`, `lichess`,
  `chess.com`, `local-first chess`, `open source chess`, `free
chess`, `macos chess`, `pgn`, `tablebase`, `syzygy`. The
  JSON-LD payload repeats them.
- **FAQPage schema.** The six-question FAQ on the landing ships
  as `FAQPage` JSON-LD alongside the `WebApplication` schema.
  Google can render it as a FAQ rich result, which earns a
  search-result card that occupies more vertical space and ranks
  "kingfisher chess" style questions above the fold.
- **Canonical landing** is set on the landing root via
  `metadataBase` in `src/app/layout.tsx`. The canonical URL
  resolves to the production Vercel host.
- **Sitemap** is served at `/sitemap.xml` from
  `src/app/sitemap.ts` and includes only the indexable public
  pages (landing, install guide, privacy, security, data
  licences, terms). `lastModified` is per-page so the sitemap
  reflects real freshness — weekly for the landing and install
  guide, monthly for the legal pages.
- **Robots** is served at `/robots.txt` from
  `src/app/robots.ts` and explicitly allows the landing and
  its assets while disallowing `/api/`.
- **Open Graph** and **Twitter** metadata are in
  `src/app/layout.tsx`; the social image is at
  `/landing/img/og.png`.
- **Structured data** (JSON-LD `WebApplication` and `FAQPage`)
  is embedded in the landing page and only carries fields that
  are true and visible.
- **The legacy GitHub Pages origin** at
  `mardakurt.github.io/kingfisher-data/` redirects to the
  Vercel landing.

## Decision: index the landing; not the Studio

The landing is the **only** surface that should be indexed
like a marketing site. The Studio is an application:
`_/analysis`, `_/studies`, `_/repertoire`, `_/training`,
`_/settings` are surfaces, not search landing pages. A
search result that points to `/analysis` shows a fragment
of a workspace with no context, which is worse than no
result at all.

The Studio is therefore served with
`X-Robots-Tag: noindex, nofollow` on the application
routes. The landing is served with no such header.

## Owner action: register the property

This step needs the owner's Google account. It cannot be
done from the application.

1. Go to
   [search.google.com/search-console](https://search.google.com/search-console)
   and sign in.
2. **Add property** → **URL prefix**.
3. Enter the canonical landing origin:
   `https://kingfisherchess.app/`

   The Vercel alias `kingfisher-chess.vercel.app/` resolves to
   the same deployment. Register the apex (`kingfisherchess.app`)
   so the canonical URL the application ships and the property
   Google indexes are the same; the alias is interchangeable if
   the apex is unavailable, but Google's index keys on the
   property you register.

4. Choose a verification method:
   - **HTML file upload** — drop the file at
     `/public/` and the production deploy serves it.
   - **HTML tag** — paste the `<meta>` into
     `src/app/layout.tsx` and redeploy.
   - **DNS TXT record** — add a record to the apex
     domain if/when the project gets a custom domain.
   - **Google Analytics** — **not available** —
     Kingfisher does not use Analytics, and Search
     Console does not require it.
5. After verification, open **Sitemaps** in the left
   sidebar and submit:
   - `https://kingfisherchess.app/sitemap.xml`
6. Open **URL Inspection** and test the canonical URLs:
   - `/`
   - `/install`
   - `/privacy`
   - `/security`
   - `/data-licences`
   - `/terms`

   For each, click **Request Indexing** to make the first
   crawl happen on the maintainer's schedule, not Google's.

7. After the first crawl lands, search Google for
   `kingfisher chess` and `kingfisher chess app`. The landing
   should appear in the result set within a week. If it does
   not, open a Search Console help thread and inspect
   `Coverage → Excluded` for the URL.

## What the application will not do

- **No Google Analytics, no Plausible, no Hotjar, no
  Segment.** Search Console works without any of these.
- **No Bing Webmaster Tools verification token** is
  shipped; if the owner wants Bing, register separately.
- **No third-party SEO script** is loaded. The landing
  ships no `gtag.js`, no `clarity.ms`, no
  `seo-clients`.

## When Search Console reports a problem

Most of the problems Search Console reports are **not**
problems with the application:

- **"Discovered - currently not indexed"** — usually
  Google deciding a page is a near-duplicate. The
  sitemap is intentionally short, so this should be
  rare.
- **"Alternate page with proper canonical tag"** — the
  application sets `rel=canonical` on every indexable
  page; if Search Console is flagging this, check that
  the URL inspected matches the canonical exactly.
- **"Crawled - currently not indexed"** — usually a
  quality decision. The landing is not a thin page; if
  Search Console disagrees, open a Search Console help
  thread and the maintainer will look at the page.

## Tracking

The owner can subscribe to **Settings → Email
notifications** in Search Console for crawl errors, manual
actions, and security issues. The maintainer does not
have access to the owner's account; do not share a
verification token in chat or in the issue tracker.
