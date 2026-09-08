# Security policy

Kingfisher is an open-source chess research workstation published
under the MIT licence. This page is the maintainer-facing
security policy. The user-facing landing page does not link to
it; it is referenced from the GitHub Security tab.

## Supported versions

Only the most recent release receives security fixes. Older
release candidates are not patched. The current supported
release is the one tagged `Latest` on
<https://github.com/mardakurt/kingfisher/releases>.

| Version               | Supported     |
| --------------------- | ------------- |
| 1.0.0-rc.4            | yes (current) |
| 1.0.0-rc.3            | no            |
| 1.0.0-rc.2            | no            |
| 1.0.0-rc.1            | no            |
| anything < 1.0.0-rc.1 | no            |

## How to report a vulnerability

**Do not** open a public GitHub issue for a security problem.
Public issues are indexed by search engines and will be seen
by every attacker in the world before a fix is in the next
release.

Use one of the following channels, in this order:

1. **GitHub private security advisory** (preferred). Open
   <https://github.com/mardakurt/kingfisher/security/advisories/new>
   and write the report there. The maintainer is notified
   privately and can disclose a fix alongside the patch.
2. **Email** the maintainer at the address in their GitHub
   profile. Use the same key as for code review if you have one.

The report should include:

- the affected version (e.g. `1.0.0-rc.4`);
- a minimal reproduction;
- what you observed and what you expected;
- any workarounds you tried.

A diagnostic export from _Settings → Diagnostics_ is safe to
attach. The export never includes Lichess tokens, API keys, the
companion pairing token, home-directory paths, or full PGN
libraries.

## What to expect

The maintainer aims to:

- acknowledge the report within seven days;
- ship a fix in the next release candidate, or sooner if the
  issue is severe;
- publish a CVE if the report warrants one;
- credit the reporter in the release notes (unless the
  reporter prefers to remain anonymous).

## What _not_ to do

- **Do not** paste a vulnerability report into a public
  GitHub issue, a discussion, a tweet, a Reddit post, or a
  Lichess forum thread.
- **Do not** run a fuzzer against the public web or the public
  data mirror without coordination. The maintainer is happy
  to provide a test account and a local-only endpoint for
  research that benefits the project.
- **Do not** publish a working exploit before a fix is in
  users' hands.

## Out of scope

- Engine binary vulnerabilities. Kingfisher verifies the
  SHA-256 of every engine it downloads against the manifest
  shipped in the repository, but the engines themselves are
  third-party and are covered by their own security policies
  (Stockfish, Lc0, Berserk, Halogen, Koivisto, Obsidian,
  PlentyChess, Stormphrax, Viridithas).
- Reference data vulnerabilities. Kingfisher verifies the
  SHA-256 of every chunk it downloads against the manifest
  shipped in the data repository. The data sources are
  themselves Lichess and the broadcast archives.
- Phishing, social engineering, or supply-chain attacks on
  the user's _machine_. Kingfisher is local-first; the
  product is not a hosted service.
