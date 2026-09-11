# First-100 — Wave 1 package

Wave 1 is the smallest cohort the maintainer recruits at once: a
handful of chess players the maintainer already knows, who will
use Kingfisher for real work and tell the maintainer what broke
or felt wrong. The maintainer is the verifier.

## Who to invite

About ten chess players the maintainer has a direct line to.

Strong candidates:

- a club player who plays on Lichess or ICCF;
- a coach who prepares students;
- a streamer who already records PGNs;
- a tournament director who annotates games;
- a second user whose machine, browser and OS are deliberately
  different from the maintainer's own.

Do not invite someone whose first reaction would be "looks like
every other chess site". The cohort is meant to surface real
friction, not to confirm a familiar feel.

## Recommended surface

Web and PWA first. The desktop build is the same product under
the same version, but the web build is what most Wave 1 users
will run, and a feedback signal that mixes "macOS app" and
"browser" is harder to read than one that does not.

If a Wave 1 user is on Windows or Linux:

- the web build works;
- the macOS desktop build is not yet released, and there is no
  Windows or Linux desktop build;
- say so in the invite rather than letting the user find out.

## What to send

The canonical landing URL. The user guide at
[`docs/product/first-100-user-guide.md`](../product/first-100-user-guide.md)
is optional — Wave 1 is a "use it normally" cohort, and the
guide is there for users who want to know more than the invite
tells them.

A copy-paste invite the maintainer can paste into a chat is at
[`first-100-invite-template.md`](./first-100-invite-template.md).

## What to ask

One sentence:

> Use Kingfisher for real chess work. If anything feels broken,
> confusing, slow, or incorrect, report it.

Then a one-line pointer to the report action:

> The fastest path is Cmd+K → "Report a problem" inside the
> application, or "Help and feedback" inside Settings.

That is all. Do not instruct users through features. Users
should reveal natural friction; coaching them turns the cohort
into a test script and stops surfacing the friction the cohort
exists to surface.

## What to record

Per user, when the maintainer starts Wave 1:

- a row in [`first-100-field-findings.md`](../product/first-100-field-findings.md)
  with the user's initials and the wave;
- the surface they are testing (web, PWA installed, macOS
  desktop);
- the first time the maintainer hears from them.

The maintainer does not ask for "retention", "session length",
"would you pay", or any other metric that would turn a
human-sized cohort into a dashboard. The metrics of Wave 1 are
the number of real reports, their severity, and whether the
maintainer can fix them before Wave 2.

## Promotion rule

Wave 1 → Wave 2 only when:

- no Critical is open in `first-100-field-findings.md`;
- no High is open in `first-100-field-findings.md`;
- the cohort has had at least a week of real use, or fewer
  reports than Wave 1 was meant to surface (whichever comes
  first).

The promotion rule is a product judgement, not a calendar. A
Wave 1 that produces two Critical reports needs more time than
one that produces two Low reports, and the maintainer decides
both.
