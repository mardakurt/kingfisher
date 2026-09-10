# Release manifest

The contract between the public Kingfisher release and the desktop
update service. The service trusts **only** the manifest; the
GitHub release page is for humans and is not a primary source.

## Where it lives

`https://github.com/mardakurt/kingfisher/releases/latest/download/kingfisher-release-manifest.json`

The desktop update service reads this URL on every *Check for
Updates…* click. GitHub serves the file at the URL of the
**latest non-draft, non-prerelease, application release** —
exactly the rule the brief lists as a non-negotiable security
boundary. A draft, a `prerelease: true` tag, a `reference-*`
data pack and a `data-*` dataset all bypass this URL; the
desktop shell will never offer any of them as an update.

## Schema

```jsonc
{
  "kingfisher": {
    "version": "1.1.0",
    "tag": "v1.1.0"
  },
  "htmlUrl": "https://github.com/mardakurt/kingfisher/releases/tag/v1.1.0",
  "desktop": [
    {
      "name": "Kingfisher-1.1.0-arm64.dmg",
      "url": "https://github.com/mardakurt/kingfisher/releases/download/v1.1.0/Kingfisher-1.1.0-arm64.dmg",
      "sha256": "…",
      "bytes": 157286400
    }
  ]
}
```

### Field rules

Every field is validated by `desktop/src/update-protocol.mjs` —
a malformed manifest is rejected with a polite "Unable to check
for updates right now" verdict rather than a crash.

| Field         | Rule                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------- |
| `kingfisher.version` | Strict `MAJOR.MINOR.PATCH`. Pre-release tags, build metadata and v-prefixes are rejected. |
| `kingfisher.tag`     | Must be `v${version}`. A mismatch is a sign the manifest was hand-edited.            |
| `htmlUrl`            | Must be `https://github.com/<owner>/<repo>/releases/tag/<tag>`.                       |
| `desktop`            | Non-empty array.                                                                              |
| `desktop[].name`     | `Kingfisher-<version>-<arch>.dmg`, where `<arch>` is `arm64` or `x64`. The version in the filename MUST equal `kingfisher.version`. |
| `desktop[].url`      | `https://` to one of: `github.com`, `api.github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`. No userinfo, no non-default ports, no HTTP. |
| `desktop[].sha256`   | Strict 64-character hex digest.                                                                |
| `desktop[].bytes`    | Positive integer, ≤ **700 MB** (the configured update size ceiling, see *Limits* below).    |

Anything outside these rules is a hard failure; the service does
not partial-match and it does not warn.

## Why a manifest, not the GitHub release page

Three reasons, in order of how much they matter for security:

1. **The release page is for humans.** The HTML is not a
   contract; the asset order changes, the formatting drifts, and
   a manifest-only update flow is the only way the desktop shell
   can be sure it is reading the *current* intent rather than
   a snapshot.
2. **The manifest is the only thing the application trusts.**
   The desktop shell reads the manifest, validates every field,
   and uses the asset list to decide what to download. The
   GitHub release page exists for the link in the *View Release
   Notes* button, and never as a source of data.
3. **The redirect-allow-list lives in the manifest reader.**
   A manifest URL on `github.com` legitimately redirects to
   `release-assets.githubusercontent.com`; the desktop shell
   allows that and only that. A hostile manifest URL is rejected
   at the URL layer before the body is read.

## Limits

A few limits are enforced by the protocol rather than the
manifest, because they are the same for every release:

- **Size ceiling: 700 MB per asset.** The current 1.0.0
  arm64 DMG is ~155 MB. The ceiling is roughly four times that,
  which is loose enough that legitimate growth (longer
  reference data, a larger bundled engine) does not need to
  be negotiated, and tight enough that a hostile manifest
  cannot ask the user to download 500 GB.
- **Maximum redirects: 3 on the manifest, 5 on the asset.**
  GitHub legitimately redirects between `github.com` and
  the asset host; more than five hops is a sign of a chain,
  not a release.
- **Hosts: 4.** `github.com`, `api.github.com`,
  `release-assets.githubusercontent.com`,
  `objects.githubusercontent.com`. No others. The list is
  the four the desktop shell has ever needed and the four
  the protocol tests pin; a fifth would be a code change,
  not a configuration.

## What the desktop update service does with the manifest

```
1. GET the manifest URL.
2. validate the response body against the schema above
   (rejects malformed JSON, wrong fields, hostile URLs,
   over-size assets, wrong digest format, etc.);
3. pick the asset whose `arch` matches the running build
   (arm64 today; an x64 build of 1.1.0 does not exist and
   the service will say so rather than offering the wrong
   one);
4. read the current application version (`app.getVersion()`);
5. compare against the manifest's version (a real semver
   comparator — "1.10.0" is newer than "1.2.0");
6. emit one of three verdicts:
      up-to-date
      newer-available
      unable-to-check
   The first time the user clicks *Download Update* after a
   *newer-available* verdict, the service streams the asset
   to `~/Library/Caches/Kingfisher/updates/`, computes its
   SHA-256 as it goes, and emits:
      downloading (progress)
      verifying
      ready
   Only the `ready` verdict enables *Open Installer*.
```

## Failure modes that the design *deliberately* turns into
polite "Unable to check" verdicts

- The manifest URL returns a non-2xx HTTP code.
- The manifest body is not JSON.
- The manifest body does not match the schema above.
- The manifest's `kingfisher.tag` does not match
  `kingfisher.version`.
- The asset list does not contain an entry for the running arch.
- The asset's URL host is not on the four-host allow-list.
- The asset's URL has a non-default port, a userinfo
  component, or is not HTTPS.
- The asset's name does not match the version in the manifest.
- The asset's declared size is zero, negative, non-numeric, or
  over the 700 MB ceiling.
- The SHA-256 is not a 64-character hex string.

The user sees one line: *Unable to check for updates right now.*
The technical detail is logged at a stage name and the
re-rendered verdict is `unable-to-check`; nothing else.

## What the design *does* do well

- **A single canonical service.** The macOS application menu,
  the *File* menu, the *Settings → Application* panel, the
  *Check for Updates…* command in the command palette and the
  manual help section all dispatch into the same
  `DesktopUpdateService` instance. There is no second network
  path, no second parser, no second verdict source.
- **No automatic polling.** A check is one HTTPS request, made
  on click. There is no background timer, no on-launch check,
  no on-focus check. The user's "Check for Updates" click is
  the only network event the updater ever produces.
- **A single-flight state.** Two rapid clicks on the menu item
  result in one network request, not two. The check and the
  download both refuse to overlap with themselves.
- **Atomic verification.** The asset lands at
  `…/Kingfisher-<version>-arm64.dmg.partial`; the SHA-256 is
  computed as the bytes arrive. On a digest mismatch the
  partial is unlinked, the verdict is `failed`, and the user
  sees *The downloaded update could not be verified.* A
  successful verification renames the file to its final
  name, after which the dialog offers *Open Installer*.
- **Bounded cache.** The update cache directory keeps one
  verified artifact and unlinks the rest on quit. The user's
  studies, repertoire and training live in
  `~/Library/Application Support/Kingfisher/`, which the
  updater never touches.
