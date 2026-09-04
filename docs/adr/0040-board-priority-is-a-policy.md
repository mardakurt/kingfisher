# 0040. Board priority is a policy, not a pixel

Status: Accepted

## Context

The board was too small, and the measurements said so: 307 px at 1280×720, 355
at 1366×768, 487 at 1440×900. The obvious fix is a setting — let the user say
how big the board should be.

That setting cannot work. A board is not sized by the number somebody types; it
is sized by what is left after the chrome around it. 600 px is a huge board on
a 1280×720 laptop, where it does not fit at all, and a small one on a 27-inch
display. A pixel preference would be wrong on almost every machine, and would
have to be re-set every time the window changed shape.

## Decision

The setting names a **policy** — Balanced, Large, Maximum — and the policy
sizes the _chrome_: the dock's width, the notation panel's height, whether the
notation folds into the dock at all, and the ceiling beyond which a bigger
board stops helping. The board then takes whatever is left.

Two further rules fall out of it:

- **The notation panel starts smaller on a short screen.** At 720 px tall the
  board is limited by height by a wide margin, and every pixel the panel keeps
  is a pixel the board does not get. `(min-height: 860px)` separates the case,
  chosen so 1440×900 is not "short" and 1366×768 is.
- **A workspace the user has rearranged always wins.** The policy decides the
  shape of a workspace nobody has touched — which is every workspace on a fresh
  profile, and most of them for ever.

## Consequences

One setting works at every width, and the same policy that gives a 1280×720
laptop a 453 px board gives a 2560×1440 display a 960 px one.

Saved layouts are untouched, because they are stored sparsely and only where
the user changed something. Changing the policy changes the default without
rewriting anyone's arrangement, and switching back restores the previous shape
because nothing was overwritten.

The ceiling remains, at 780/960/1200 px. It is a policy limit, not a rendering
one: past about a thousand pixels a board stops being easier to read and starts
being a thing you move your head to look at.

`e2e/board-size.spec.ts` holds absolute pixel floors rather than proportions. A
proportion would pass on a 4K display while the laptop case that motivated all
of this stayed broken.
