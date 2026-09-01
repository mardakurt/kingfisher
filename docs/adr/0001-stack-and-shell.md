# 0001 — Next.js App Router for a client-heavy workspace

**Status:** Accepted

## Context

The application is a desktop workspace: almost everything happens on the client,
against local state, with a Web Worker doing the expensive work. That profile
argues for a plain SPA (Vite). But the roadmap needs things a bare SPA does not
give for free:

- A server boundary for the database providers that cannot run in a browser —
  a SQLite file, a Postgres index, a remote analysis server.
- Route-level code splitting across seven product areas that will not all be
  loaded at once.
- Somewhere to set response headers (cross-origin isolation for the
  multi-threaded engine build).

## Decision

Next.js 16 with the App Router, strict TypeScript, Tailwind v4.

Every route is a thin shell: it renders a feature component and nothing else.
Server components are not used for chess data in Phase 1, because there is no
server-side chess data yet — introducing them now would be structure without
purpose.

## Consequences

- The API-route boundary exists the moment a provider needs it, with no
  migration.
- Cross-origin isolation is one env var away (`next.config.ts`).
- Cost: a heavier dev server and framework churn to track. Accepted, because the
  alternative is adding a server later to an application that assumed it never
  had one.
- Because routes are thin, moving to a different framework would mean rewriting
  `src/app/` only.
