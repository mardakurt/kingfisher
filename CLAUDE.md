@AGENTS.md

# Working on Kingfisher as Claude

`AGENTS.md` is the project guide — architecture, the non-negotiable rules, and
the release commands. Read it. This file covers only how to _work_ here, which
the phase history has repeatedly shown matters as much as knowing the code.

## Start by finding out where you actually are

Kingfisher is built in numbered phases, each handed over in
[`docs/reports/`](docs/reports) (`phase-NN-handover.md`).
Handovers are written by an agent that may have run out of context mid-phase, so
they describe intent as much as fact. The index of current vs. historical
documentation is at [`docs/README.md`](docs/README.md); do not treat a phase
report as a current doc without checking that file.

- **Read the most recent handover, then verify it against the repository.** The
  commit a handover names is often not `master`, and a documentation-only commit
  may sit after the application code.
- `git status`, `git log --oneline -25`, `git rev-parse HEAD origin/master`
  before editing anything. Uncommitted work in the tree is normal — it is the
  previous agent's unfinished work, not debris. Inspect it before you touch it.
- **Do not trust a final report that claims completion.** Several have claimed
  green suites that had never been run, or capabilities that were never
  exercised. Re-run the gates yourself.

## Continue the phase; do not start a new one

If a phase is unfinished, finish _that_ phase. Do not renumber it, do not
redefine its scope, and do not reduce it because one context window was not
enough. Preserve completed work rather than restarting from scratch.

If you run out of room, leave: the current commit, what was audited, what was
found, what was fixed, what was run, and precisely what remains — and a clean
working tree if you can manage one.

## Evidence, not assertion

The standard for this project is not "I found no failing tests." It is "I looked,
and here is what I ran."

- Never write that something is verified unless you ran it. Never write that CI
  is green while it is still running.
- Prefer a command and its output over a claim. Numbers in reports should be
  traceable to a command someone else can run.
- When you cannot verify something in your environment — no credentials, no
  hardware, no dataset — say so explicitly and name the limitation. That is a
  complete answer. A guess dressed as a result is not.
- Do not claim mathematical certainty that no bug exists.

## Commits

Make coherent commits describing work that was actually done. Explain _why_ in
the body — the defect, and what it cost — rather than restating the diff. No
commits for features that were not implemented. No force push.
