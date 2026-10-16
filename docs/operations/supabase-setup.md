# Turning on accounts: the Supabase and Google set-up

> **State on 2026-10-16:** every step is done for project
> `mwrljfsnreplhmvzdhzl` (Seoul) — migrations, email with custom SMTP and
> the five templates, redirect URLs, Vercel variables and Google sign-in.
> Step 7 was run by the owner on 2026-10-16: `14/14 checks passed against
mwrljfsnreplhmvzdhzl.supabase.co`. Still open: Google's branding
> re-verification (after its 24-hour wait), so the consent screen names
> Kingfisher rather than the Supabase host.

Kingfisher's optional accounts are implemented in the repository and
**off** until a Supabase project is connected. This is the runbook for
the steps only the project owner can take — they need your Supabase and
Google accounts — and the order to take them in. Nothing here goes into
the repository except the last step's one-line change to
`src/release/public-services.json`.

What you will put where:

| Value                                     | Secret? | Goes into                                   |
| ----------------------------------------- | ------- | ------------------------------------------- |
| Project URL (`https://<ref>.supabase.co`) | no      | Vercel env, `.env.local`                    |
| Publishable key (`sb_publishable_…`)      | no      | Vercel env, `.env.local`                    |
| Secret key (`sb_secret_…`)                | **yes** | only your shell, for `npm run cloud:verify` |
| Database password                         | **yes** | your password manager                       |
| Google OAuth client ID                    | no      | Supabase dashboard                          |
| Google OAuth client secret                | **yes** | Supabase dashboard only                     |

Never paste a secret into a source file, a `NEXT_PUBLIC_` variable, an
issue or a chat. The application refuses to start the account service
if a secret key is put in a public variable.

## 1. Create the project

1. <https://supabase.com/dashboard> → **New project**.
2. Name `kingfisher`. Choose the region closest to most users — for a
   Europe-based maintainer, Frankfurt (`eu-central-1`) is a sound
   default. Write the region down; the privacy page must name it.
3. Generate a database password and keep it in your password manager.

## 2. Apply the migration

Either in the dashboard — **SQL Editor** → **New query** → paste the
whole of `supabase/migrations/20261015120000_user_records.sql` → **Run**
— or with the CLI from the repository root:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref>
```

```bash
npx supabase db push
```

Then **Database → Publications → supabase_realtime** should list
`user_records` (the migration adds it). Realtime only wakes other
devices sooner; sync works without it.

## 3. Email sign-in

**Authentication → Sign In / Providers → Email**: enabled, **Confirm
email** on. **Authentication → Policies** (or Password settings):
minimum length 8.

### Custom SMTP and Kingfisher's own emails

Supabase's built-in sender is for testing: it sends as "Supabase Auth
<noreply@mail.app.supabase.io>", adds "powered by Supabase", allows only a
handful of messages an hour, and **locks the templates** until custom SMTP
is set. So before real users:

1. Create an account with an email provider — Resend is the simplest
   (free tier: 3,000 emails a month) — and add the domain
   `kingfisherchess.app`. It gives DNS records (SPF, DKIM, and a
   return-path); add them where the domain's DNS is managed (Vercel →
   Domains for this project) and wait for the provider to say verified.
2. Create an SMTP credential (in Resend: an API key, used as the SMTP
   password). It is a secret: it goes into the Supabase dashboard only.
3. **Authentication → Emails → SMTP Settings**: enable custom SMTP. Sender
   email `accounts@kingfisherchess.app`, sender name `Kingfisher`; host,
   port and user from the provider (Resend: `smtp.resend.com`, `465`,
   `resend`); password = the credential from step 2.
4. **Authentication → Emails → Templates**: for each template, paste the
   file's HTML as the body and set the subject:

   | Template         | File                                       | Subject                               |
   | ---------------- | ------------------------------------------ | ------------------------------------- |
   | Confirm sign up  | `supabase/templates/confirm-signup.html`   | Confirm your email for Kingfisher     |
   | Reset password   | `supabase/templates/reset-password.html`   | Reset your Kingfisher password        |
   | Change email     | `supabase/templates/change-email.html`     | Confirm your new email for Kingfisher |
   | Magic link       | `supabase/templates/magic-link.html`       | Your Kingfisher sign-in link          |
   | Reauthentication | `supabase/templates/reauthentication.html` | Your Kingfisher verification code     |

   The templates are table-based with inline styles so mail clients
   render them, use the Studio's light palette, and load the mark from
   `https://kingfisherchess.app/apple-icon.png`.

5. Sign up with a second address and check the email arrives from
   Kingfisher, not Supabase.

## 4. Redirect URLs

**Authentication → URL Configuration**:

- **Site URL:** `https://kingfisherchess.app`
- **Redirect URLs:**
  - `https://kingfisherchess.app/auth/callback`
  - `https://kingfisherchess.app/auth/update-password`
  - `http://localhost:3210/auth/callback`
  - `http://localhost:3210/auth/update-password`
  - The Mac application's Google sign-in:
    `http://127.0.0.1:*/auth/desktop/*`
  - Vercel previews, if you want accounts there:
    `https://*-<your-vercel-team>.vercel.app/**`

The Mac application sends email links to `kingfisherchess.app`, not to
its loopback address, so they need no entry of their own. Its Google
sign-in is different: it opens in the person's own browser and returns
to a listener the application starts for that one sign-in, on an
ephemeral loopback port with a random nonce in the path —
`http://127.0.0.1:<port>/auth/desktop/<nonce>`
(`desktop/src/browser-sign-in.mjs`). The entry above admits exactly
that shape: in Supabase's patterns `*` stops at `.` and `/`, so the
first matches only the port and the second only the nonce, and
nothing but `127.0.0.1` matches the host. Keep the query string out
of it; Supabase appends `?code=…` itself.

## 5. Google sign-in

In the Google Cloud console (<https://console.cloud.google.com>), in a
project for Kingfisher:

1. **APIs & Services → OAuth consent screen**: External; app name
   `Kingfisher`; your support email; authorised domain
   `kingfisherchess.app`; scopes `openid`, `email`, `profile` only.
   Publish it (Testing mode only admits the test users you list).
2. **Credentials → Create credentials → OAuth client ID → Web
   application**:
   - Authorised JavaScript origins: `https://kingfisherchess.app`,
     `http://localhost:3210`
   - Authorised redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
     (Supabase shows this exact value on its Google provider page).
3. Copy the client ID and secret into Supabase **Authentication → Sign
   In / Providers → Google**, and enable it.

Google refuses OAuth inside embedded application windows, so the Mac
application opens Google in the person's default browser and receives
the result on loopback (step 4's `127.0.0.1` entry). Nothing changes in
the Google console for it: Google still redirects only to Supabase's
callback; Supabase is what redirects on to the application.

## 6. Connect the application

**Project Settings → API Keys**: copy the **publishable** key.

- Vercel → the Kingfisher project → **Settings → Environment
  Variables**, for Production (and Preview if wanted):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…`
    Then redeploy: public variables are built into the bundle.
- Locally: copy `.env.example` to `.env.local` with the same two values
  and restart `npm run dev`.

## 7. Verify the live project

From a shell where the secret key exists only for this command:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... SUPABASE_SECRET_KEY=sb_secret_... npm run cloud:verify
```

Or, in a checkout whose `.env.local` already names the project (the URL
and the publishable key are read from it), only the secret on the line:

```bash
set -a && source .env.local && set +a && SUPABASE_SECRET_KEY=sb_secret_... npm run cloud:verify
```

It creates two throwaway confirmed users, checks through the real API
that neither can read, change, delete or plant the other's rows and that
the anonymous key gets nothing, then deletes both with the application's
own account-deletion function. Every line must say `OK`.

Then, in a browser: create an account on `/sign-up`, confirm the email,
make a study, open the site in a private window, sign in, and see it
arrive. Try Google on `/sign-in`. Try _Forgot your password?_.

And in the Mac application, built with the same two variables
(`npm run desktop:dist` reads `.env.local` like `next build` does):
_Continue with Google_ should open your default browser, the browser
should end on "You are signed in to Kingfisher", and the application
should come to the front signed in.

## 8. Say so in public

Only after step 7 passes:

1. `src/release/public-services.json`: `"enabledOnPublicSite": true`
   and `"region"` set to the region from step 1.
2. Update the privacy page (`docs/legal/privacy.md`,
   `src/app/privacy/PrivacyPage.tsx`) and `SECURITY.md` from "not yet
   offered" to what is now true, naming the region.
3. `npm run docs:check` — it refuses the descriptor and the pages
   disagreeing, in either direction.

## Operating it

- **Backups:** Supabase takes daily backups on paid plans; on the free
  plan, export periodically (`npx supabase db dump`). Users' own devices
  also keep a full local copy, and _Settings → Backup_ still works.
- **Free-plan pausing:** a free project pauses after a week without
  traffic; a paused project makes sync report "Offline" and nothing is
  lost locally. Use a paid plan once real users depend on it.
- **Size:** each synced record is one row; a heavy user's studies and
  repertoire are a few megabytes. The 500 MB free database holds
  hundreds of such users.
- **Deleting a user** from the dashboard cascades to all their rows,
  exactly as _Account → Delete account_ does.
