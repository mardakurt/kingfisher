# First-100 feedback triage

The lightweight maintainer workflow for the first 100 real
users. The goal is to surface real defects fast without building
a custom backend.

## Channels

- **Bug Report** — the GitHub issue template `bug_report.md`. The
  in-product link opens it.
- **Chess / data issue** — the GitHub issue template
  `data_issue.md`. The in-product link opens it.
- **Idea or improvement** — the GitHub issue template
  `feature_request.md` or a GitHub Discussion.
- **General feedback** — a GitHub Discussion. The in-product
  link opens the right category.

The first 100 users do not need an account to read the issue
trackers, but they DO need a GitHub account to file a report.
The in-product help card states this honestly.

## Triage

The maintainer is the only person triaging. The flow is:

1. **NEW REPORT** — every report from a first-100 user is read
   within one business day. The maintainer either acknowledges
   it on the issue itself, or escalates it.
2. **REPRODUCE** — every report is reproduced locally before
   severity is set. A "the board is broken" report without a
   reproduction is held for 24 hours, then closed if no further
   detail arrives.
3. **SEVERITY** — see the table below.
4. **DUPLICATE?** — if the same defect already has an open issue,
   the new report is linked and closed with a pointer to the
   original.
5. **REGRESSION TEST** — every bug accepted at High or Critical
   severity is pinned by a test before the fix is committed.
6. **FIX** — the fix lands in `master` with a coherent commit
   message and a body that names the defect, the cost, and the
   test.
7. **DEPLOY** — the fix is deployed with the next push to
   production. The maintainer announces the close on the issue.
8. **CONFIRM** — the original reporter is asked to confirm the
   fix on their copy.

## Severity

| Severity    | Definition                                                                                 | Target response |
| ----------- | ------------------------------------------------------------------------------------------ | --------------- |
| Critical    | Data loss, repeated crash, dead primary control, security exposure, broken core workflow.  | Same day        |
| High        | Wrong result the user would notice (wrong move list, stale engine verdict, wrong opening). | Same day        |
| Medium      | Defect a user would notice but a workaround exists.                                        | Within a week   |
| Low         | Cosmetic defect a user might mention.                                                      | Backlog         |
| Improvement | Software works correctly; could be faster, clearer, more polished, or more powerful.       | Backlog         |

A "Support with limitation" environment target cannot produce a
report at Low or Medium: a known limitation is a known
limitation, not a defect. A user who hits a limitation is
redirected to the first-100 user guide.

## What the maintainer does NOT do

- Build a custom feedback backend.
- Add analytics to the product.
- Send private messages to a first-100 user without a public
  comment thread. Public tracking is the entire point of using
  GitHub Issues.
- Hold fixes for a release. Every fix that closes a Critical or
  High report deploys with the next push.
- Change the version number for a Phase 38 report. The version
  policy is in the Phase 38 handover; only an owner-decision
  trusted release can move the version.

## Escalation

If a Critical report cannot be reproduced on the maintainer's
machine, the maintainer asks the reporter for a diagnostic
bundle. The in-product **Copy support information** button is the
canonical source. The bundle does not contain chess content.

If a Critical report reproduces on the maintainer's machine but
the fix is non-trivial, the maintainer:

1. Commits a failing test for the defect.
2. Comments on the issue with the test name and the planned fix.
3. Drives the fix to land in `master` before the next cohort
   wave.

## Wave promotion rule

A wave is only promoted when the previous wave has zero new
unresolved Critical or High reports. The maintainer can hold a
wave for any reason. The maintainer is the only person who
promotes a wave.

## File this document

This file lives in `docs/operations/first-100-feedback.md` and
is the canonical reference for the workflow. The in-product help
card does not link to it; the maintainer links to it from
issue-tracker responses when explaining the process to a
reporter.
