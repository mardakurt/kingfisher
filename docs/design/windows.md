# Windows: what is ready, what is missing, and what may not be claimed

_Audit and plan, 2026-09-22 (Phase 76). The ninth item of the parity queue in
`docs/product/market-research.md` §6: "Windows. The shell is Electron; the
companion builds there; what is missing is the harness and the signing."_

**Nothing in this document is a claim that Kingfisher runs on Windows.** No
Windows build has been produced and none has been launched. This session ran
on a Mac; a Windows binary needs a Windows machine to drive and a code-signing
certificate to be trusted, and AGENTS.md is explicit that "builds" is not
"runs". What this document does is state what a Windows port would actually
have to do, what is already portable, and what is macOS-specific by
construction — so the work is a known size rather than an optimistic one.

## What is already portable

**The application.** `src/` is a Next.js application in a browser engine.
Nothing in it names a platform; the desktop identity is one preload file plus
`src/desktop/bridge.ts`, which returns `null` when there is no shell.

**The companion.** It already carries Windows paths through its own code:
`engines.mjs` spawns without `detached` on `win32` and ends a process tree
with `taskkill /T /F` rather than a negated process-group signal;
`engine-sandbox.mjs` keeps a separate allow-list of Windows environment
variables and quotes paths accordingly; `managed-engines.mjs` selects
`.exe` assets. Three of the catalogue's engines (Berserk, Obsidian,
Koivisto) publish Windows builds and no macOS ones, so a Windows port gains
engines rather than losing them.

**The shutdown contract, as of this phase.** The shell asked the companion to
stop with `SIGTERM` and nothing else. Windows has no SIGTERM: Node's
`kill('SIGTERM')` terminates the process outright, so the companion's own
handler — the one that calls `engines.stopAll()` — would never have run, and
every engine the session started would have been left behind. Since engines
are spawned detached precisely so that they outlive a parent nobody told to
stop, that is the exact failure AGENTS.md calls load-bearing.

The shell now **asks over the IPC channel it already had** (`{type:
'shutdown'}`) and only then signals; the companion answers the message with
the same `shutdown()` the signal reaches. `desktop/src/services.test.mjs`
includes a service that answers the message and ignores the signal — Windows
in a test — and the request was removed once and watched to fail.

## What is macOS-specific, and what each would need

| Piece                                             | Why it is macOS                                                                          | What Windows needs instead                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `sparkle-updater.mjs`, `native/sparkle/bridge.mm` | Sparkle is a macOS framework; the bridge `dlopen`s it and links nothing at build time.   | A second updater behind `update-service.mjs`'s existing interface. `electron-updater` (used until 1.1.7) is the obvious one.       |
| `window-chrome.mjs`                               | The traffic lights are the operating system's own controls, drawn over the web contents. | Nothing: Windows draws its own caption bar. `windowChromeFor()` already returns `null` off darwin, and the renderer reserves zero. |
| `entitlements.mac.plist`, `desktop:sign:verify`   | Apple's hardened runtime.                                                                | Authenticode: a certificate, a timestamp server, and a verifier that refuses an unsigned or wrongly-signed binary.                 |
| DMG build, `verify-dmg.mjs`, the volume icon      | A disk image is a macOS delivery.                                                        | An NSIS or MSI installer, and a verifier that mounts/extracts it and asserts the same facts the DMG verifier does.                 |
| `platform-floor.mjs`                              | Electron's `LSMinimumSystemVersion`.                                                     | Electron's own Windows floor, read from the same place rather than written down.                                                   |
| `desktop:certify` and its gates                   | Driven by a real window server on the maintainer's Mac.                                  | The same harnesses on a Windows machine; `scripts/desktop-lib/launch.mjs` is the one launcher they all use, and is portable.       |

## What the port is, in order

1. **A Windows target in `electron-builder.yml`** and the `afterPack` hook
   reading `required-resources.mjs` — which is already the one list of what a
   bundle must contain, and is platform-independent.
2. **A second updater** behind the existing service interface, with the same
   save barrier: the renderer confirms every write is committed before the
   installer is allowed to relaunch. The barrier is not macOS-specific and
   must not be skipped.
3. **The harnesses, on a Windows machine**: smoke, restart, engines, suspend,
   the seeded walk. Every one of them drives the real application through
   `launch.mjs`; what is missing is a machine, not a design.
4. **Signing**: a certificate, and `desktop:sign:verify`'s equivalent — a gate
   that refuses to publish an unsigned build, as the Mac one does.
5. **The public surface**: `src/release/macos-download.json` is the single
   source of truth for the Mac DMG and a Windows descriptor would be its
   sibling, read by the landing and by `docs:check`, never a second hard-coded
   filename.

## What must not happen

Adding a Windows target that nobody has run, and letting the landing page
offer it. README currently states, in as many words, that Windows, Linux and
Intel Macs are **not built and not supported**; that sentence is true today
and stays true until a Windows build has been launched, driven by the
harnesses, and signed. A download link is a promise about somebody else's
machine.
