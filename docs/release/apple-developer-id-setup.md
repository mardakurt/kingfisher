# Apple Developer ID setup

This document was the **single owner action** that gated a trusted
release. It was completed on 2026-09-12: a `Developer ID Application`
certificate for team `3B5CYF9DQ4` (expires 2031-09-13) is in the login
keychain with its private key, and an App Store Connect API key with the
Developer role is stored outside the repository. What follows is kept as
the procedure, with the corrections the real run needed.

## TL;DR

A `Developer ID Application` certificate is required to ship
Kingfisher outside the Mac App Store. `Apple Development` and
`Apple Distribution` are **not** substitutes — they are
recognized by macOS only inside the App Store / TestFlight
pipelines.

## What you need

1. **An Apple Developer Program account.** $99/year. Available
   to anyone with a real-world identity Apple can verify; the
   organization / team setup matters for the notarization
   credentials below. If you are not enrolled, do that first.
2. **Xcode 15 or newer** (Xcode 16 recommended) installed on
   the build machine. The notarization tools we use ship
   with Xcode's command-line tools.
3. **A spare 30 minutes** for the first time.

## The certificate

`Developer ID Application` is a long-lived certificate
(macOS treats it as the publisher identity for an outside-the-
Mac-App-Store app). It is created once, exported to a `.p12`,
and reused for every release.

### Create the certificate request

1. Open **Keychain Access** on the build Mac.
2. From the menu: **Keychain Access → Certificate Assistant →
   Request a Certificate From a Certificate Authority…**.
3. Set **User Email Address** to the Apple ID tied to the
   developer account, **Common Name** to anything memorable
   (e.g. `Metin Arda KURT (Kingfisher)`), and **Request is**
   to **Saved to disk**. Continue.
4. A file called `CertificateSigningRequest.certSigningRequest`
   lands on your Desktop. Keep it.

### Submit the request to Apple

1. Go to <https://developer.apple.com/account/resources/certificates/list>.
2. Click the **+** button. Choose **Developer ID Application**
   from the certificate type list. Continue.
3. Upload the `.certSigningRequest` from the previous step.
4. Download the resulting `developerID_application.cer` and
   double-click it to import into the **login** keychain.
5. Open Keychain Access, find the new certificate, and confirm
   it shows `Developer ID Application: <Your Name> (<Team ID>)`.

The `(<Team ID>)` is the **Apple Team Identifier** you will
need for notarization. It is also visible in
<https://developer.apple.com/account/#/membership>.

### Export the certificate to a `.p12`

This step is required to feed the certificate to
`electron-builder` and to GitHub Actions.

1. In Keychain Access, right-click the certificate → **Export
   "Developer ID Application: …"**.
2. Choose **Personal Information Exchange (.p12)** as the
   file format and save it somewhere outside the repository.
3. Keychain will ask for a password. Pick a strong one and
   **write it down in your password manager** — losing it
   means re-issuing the certificate.

### Use the certificate in the build

There are two ways to feed the `.p12` to electron-builder:

#### Local release

The identity in the login keychain is enough; no `.p12` export is needed
on the machine that holds the key. Pin it by name — **without** the
`Developer ID Application:` prefix, which electron-builder rejects:

```bash
export CSC_NAME="Metin Arda KURT (3B5CYF9DQ4)"     # the name as codesign prints it, minus the prefix
npm run desktop:dist
```

Do **not** set `CSC_IDENTITY_AUTO_DISCOVERY=false` unless `CSC_LINK` names
a `.p12`: it turns the keychain lookup off, and with no `.p12` the build
is produced **unsigned** — an earlier version of this page recommended it
as a safety belt, and it is the opposite. `npm run desktop:sign:verify`
is the check that the result carries a Developer ID signature; it walks
every nested code object.

#### GitHub Actions release

1. Encode the `.p12` to base64:

   ```bash
   base64 -i DeveloperIDApplication.p12 | pbcopy
   ```

2. In the GitHub repository, go to **Settings → Secrets and
   variables → Actions → New repository secret** and create
   `CSC_LINK_P12_BASE64` with the base64 content.
3. Create a second secret `CSC_KEY_PASSWORD` with the
   password from the previous section.

The release workflow (see `.github/workflows/release-mac.yml`)
turns the base64 back into a file at job start.

## The notarization credentials

The certificate lets the binary claim Apple as the signer.
Notarization is the separate step where Apple confirms the
binary is safe to launch. We use the **App Store Connect API
key** path because it is the most CI-friendly: there is no
password and no 2FA prompt.

### Create an App Store Connect API key

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>.
   The first visit shows **Request Access**: the Account Holder has to
   accept Apple's API terms (internal development, testing and reporting
   only). Approval was immediate.
2. Under **Team Keys**, click **Generate API Key**. Name it
   `Kingfisher Notarization`, set **Access** to **Developer** — the least
   privilege that can submit for notarisation — and generate.
3. **Download** the `AuthKey_XXXXXXXXXX.p8` at once — Apple lets it be
   downloaded exactly once, and the download must be a person's click in
   a normal browser. Note the **Key ID** and the **Issuer ID** shown on
   the page.
4. Move the `.p8` to `~/.kingfisher-release/` with mode `0600`. It is a
   private key: never into the repository, never into a log.

### Place the key in the build environment

The build key, the key ID, and the issuer ID all need to be
in the build environment at the time of notarization. They
are three separate variables.

#### Local release

```bash
export APPLE_API_KEY=/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=uuid-…-from-app-store-connect
npm run release:mac:notarize
```

#### GitHub Actions release

1. Encode the `.p8` to base64:

   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
   ```

2. Create a repository secret `APPLE_API_KEY_P8_BASE64` with
   the base64 content.
3. Create `APPLE_API_KEY_ID` with the key id.
4. Create `APPLE_API_ISSUER` with the issuer id.

## What the build does with the credentials

`electron-builder` reads `CSC_LINK` / `CSC_KEY_PASSWORD` to
sign the produced artifacts. `notarytool` reads `APPLE_API_KEY`
/ `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` to submit. The
`release:preflight:mac` script checks for the _presence_ of
these variables before the build runs and refuses to start
without them; it never prints their values.

The **credentials are not committed** to the repository. They
live in the owner's password manager, on the build keychain,
or in GitHub Secrets. The release pipeline reads them at
build time and discards them when the build completes.

## What the credentials do not let the build do

The credentials are scoped:

- The certificate signs a `.app`; it does not let the build
  upload to App Store Connect.
- The API key can submit for notarization; it cannot release
  an app, change a price, or modify App Store metadata.
- Neither credential grants access to the developer's other
  apps, certificates, or devices.

If a credential is ever leaked, the recovery procedure is
short: revoke the API key on App Store Connect (and generate
a new one) and revoke the Developer ID Application
certificate in the developer portal (and re-issue from the
portal). The release pipeline picks up the new values on the
next run.

## The shortest safe workflow

If you have a working build host and an enrolled developer
account, the whole setup is roughly:

1. **Create a CertificateSigningRequest** in Keychain Access.
2. **Submit the request** at
   <https://developer.apple.com/account/resources/certificates/list>
   and choose **Developer ID Application**.
3. **Download and import** the resulting `.cer` into the
   login keychain.
4. **Export the certificate as a `.p12`** with a strong
   password; store the password in your password manager.
5. **Generate an App Store Connect API key** and download
   the `.p8` file. Note the Key ID and Issuer ID.
6. **Place the values in your build environment**:
   `CSC_LINK` (path to the `.p12`), `CSC_KEY_PASSWORD`,
   `APPLE_API_KEY` (path to the `.p8`), `APPLE_API_KEY_ID`,
   `APPLE_API_ISSUER`.
7. **Run the preflight**:

   ```bash
   npm run desktop:release:preflight:mac
   ```

   All five checks should report green.

8. **Continue with the release** as described in
   `macos-trusted-release.md`.

That's the entire process. There is no shortcut, and there
is no step that benefits from being skipped.
