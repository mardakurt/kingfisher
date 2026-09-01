# 0016 — The assistant is given evidence, not asked what it knows

**Status:** Accepted

## Context

Kingfisher was conceived as a "Grandmaster Companion", and the obvious
implementation — put a chess question to a language model — is the one thing
the rest of the product is built to avoid. Every other surface separates engine
evidence from database evidence from repertoire decisions and refuses to
average them. A model asked "why is Nf3 strong here?" answers from a plausible
average of positions that look like this one, which is exactly the invented
authority the application otherwise declines to produce.

## Decision

The model never answers from memory. Before any request, the application builds
an **evidence packet** from what it actually knows: engine lines with their
depth and engine name, database counts from one named source, the user's
repertoire entry, personal results, tablebase verdicts, deterministic
structural features, and the user's own notes.

The packet is rendered as a labelled document, and the labels are the
attribution. The system prompt then requires the model to cite the section each
claim came from, and forbids specific things rather than gesturing at honesty —
"never state a percentage that is not in the DATABASE section" is followable in
a way that "do not hallucinate" is not.

The packet says out loud which sources are **empty**, so "there is no database
evidence here" is an available answer rather than a gap to fill.

The rendered packet is shown in the panel underneath every answer. That
disclosure is the feature: it is what makes a claim checkable, and it is what
distinguishes this from a chess-flavoured text generator.

Provider access is an OpenAI-compatible `/chat/completions` call, because that
shape is spoken by hosted APIs and by every local runner worth using. A user
who wants Kingfisher to stay entirely on their machine points it at localhost
and nothing else changes. No key ships with the application, none is defaulted,
and an unconfigured assistant is simply disabled.

## Alternatives considered

- **Ask the model directly.** Fluent, confident, and wrong about the specific
  position often enough to be worse than nothing in a research tool.
- **Function calling / tools.** Lets the model pull evidence itself. More
  round-trips, more failure modes, and it moves the decision about what counts
  as evidence from the application into the model.
- **Ship a provider.** Would mean an embedded credential, a shared rate limit,
  and a product that stops working when a key is rotated.
- **No assistant at all.** Defensible, and it leaves a real question —
  "what should I be thinking about here?" — answered only by numbers.

## Consequences

- Answers are checkable against a visible packet, and the packet is the same
  data the rest of the interface is showing.
- The assistant is only as good as the evidence gathered: with no engine run
  and no database source, it will say so rather than improvise.
- Kingfisher remains fully usable, and fully local, with no assistant
  configured. That is the default state.
