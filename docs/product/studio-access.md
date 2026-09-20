# Reaching the Studio

One origin, `https://kingfisherchess.app`, serves two surfaces: the
public landing at `/` and the application — the Studio — at its own
routes. This page states how a visitor gets from one to the other, and
what each kind of visitor sees. The rule is implemented in
`src/features/shell/studio-entry.ts` (pure, unit-tested), rendered by
`src/app/landing/StudioEntry.tsx`, and exercised end to end in
`e2e/studio-entry.spec.ts`.

## The addresses

| Address                     | What it is                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/`                         | The landing: for discovery, first visits and search engines. Indexable.                                              |
| `/analysis`                 | The Studio's canonical entry (`publicUrl.studio`). The address to bookmark; the desktop shell opens here. Noindex.   |
| `/studio`                   | An alias people can say and type. A permanent (308) redirect to `/analysis`, query preserved (`next.config.ts`).     |
| `/openings`, `/training`, … | The Studio's other sections; every one is a working deep link, and reloading any of them serves the Studio directly. |
| `/?stay`                    | The landing, for a browser whose owner chose to skip it (below).                                                     |

Nothing about this is server-side state. There is no account, no
cookie and no session; the landing is the same static document for
every request, which is what keeps it fast and what a crawler indexes.

## Who sees what

**A first-time visitor** — a browser that has never opened the Studio —
gets the landing exactly as published: the product, the download, the
FAQ, and "Open Studio" in the header, the hero and the footer. Nothing
is skipped and nothing is remembered.

**A returning visitor** — a browser in which the Studio has mounted at
least once — gets the same landing with one line added under the hero's
buttons: _Continue in Studio →_, and a checkbox, _Open the Studio
straight away next time_. The Studio writes
`localStorage['kingfisher.studio.visited']` on every mount
(`AppShell.tsx`); the landing reads it after the page has painted. The
line occupies a reserved height whether or not it is shown, so the page
does not jump.

**A returning visitor who ticked the box** —
`localStorage['kingfisher.landing.auto-open-studio'] = '1'` — is sent to
`/analysis` by `location.replace` before the landing is painted, on
every visit to `/` that does not carry `?stay`. The decision is a
parser-blocking inline script at the top of the document
(`studioAutoOpenScript` in `studio-entry.ts`, rendered by
`LandingPage.tsx`): Phase 71 made it in a React effect, which runs after
the page has been parsed, painted and hydrated, so a person who had
asked to skip the landing saw it anyway for the length of a script
download on every visit. The script is the same rule written once more
in the only form that can run that early, and `studio-entry.test.ts`
executes the string against the cases `landingEntryFor` is held to.
`StudioEntry` keeps its own redirect as the fallback for a browser that
did not run the script. `replace`, not
`assign`: the landing does not stay in the history as a page the back
button lands on and immediately leaves again, so Back from the Studio
goes to wherever the person was before. The choice is undone at
`/?stay`, where the same checkbox is shown ticked; the landing tells
them this address when they tick it. The auto-open key on its own —
without the visit marker — never fires, so cleared site data or a
restored profile cannot send a stranger into an empty Studio.

**Turning it off, from any device.** The choice is also in the Studio
itself — _Settings → Workspace → Skip the landing page_ — reading and
writing the same key, so a person who ticked the box can undo it without
remembering `/?stay`, and a device whose landing never showed the box
can still set it. Both surfaces exist because the landing's own checkbox
appears only where _this browser_ has visited the Studio: a Studio
installed as a web app (its own storage, apart from the browser's), a
different browser on the same machine, or a private window each count
as a browser that has not — which is why "the option shows on some
devices and not others" was true, and why the setting lives inside the
Studio too. The Mac application never loads the landing and does not
show the setting.

**A search engine** has no `localStorage` and sees the first-time
landing. `/analysis` and the other Studio routes carry
`X-Robots-Tag: noindex` (`src/proxy.ts`); `/studio` is a redirect
and is not in the sitemap.

**The Mac application** never loads the landing. Its window opens on
`/analysis` on the loopback origin (`desktop/src/main.mjs`), the visit
marker is written there like anywhere else, and the public landing is
reachable from it only as an external link in the system browser.

## What cannot loop

- `/` → `/analysis` fires only client-side, only for a browser that
  opted in, and never on `/?stay`. `/analysis` never redirects to `/`.
- `/studio` → `/analysis` is a single server redirect to a page that
  redirects nowhere.
- On the legacy landing-only hosts (`src/proxy-host-rules.ts`), a
  Studio route is redirected to `/`, and `/` serves the landing; the
  client-side rule then finds no visit marker on that origin and does
  nothing.

## Checking it

```bash
npx vitest run src/features/shell/studio-entry.test.ts
npx playwright test e2e/studio-entry.spec.ts
curl -sI https://kingfisherchess.app/studio | grep -i "^HTTP\|^location"
```
