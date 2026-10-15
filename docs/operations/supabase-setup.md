# Turning on accounts: the Supabase and Google set-up

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

For production, set up custom SMTP under **Authentication → Emails →
SMTP settings** (Resend, Postmark, Amazon SES…). Supabase's built-in
sender is for testing and is limited to a handful of messages an hour;
sign-up and reset emails will stop arriving under real use without it.

## 4. Redirect URLs

**Authentication → URL Configuration**:

- **Site URL:** `https://kingfisherchess.app`
- **Redirect URLs:**
  - `https://kingfisherchess.app/auth/callback`
  - `https://kingfisherchess.app/auth/update-password`
  - `http://localhost:3210/auth/callback`
  - `http://localhost:3210/auth/update-password`
  - Vercel previews, if you want accounts there:
    `https://*-<your-vercel-team>.vercel.app/**`

The Mac application sends email links to `kingfisherchess.app`, not to
its loopback address, so it needs no entry of its own.

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
application offers email and password and says Google works on the web.
Supporting Google there needs the system-browser flow recorded as a
follow-up in `docs/product/2026-10-15-overhaul-report.md`.

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

It creates two throwaway confirmed users, checks through the real API
that neither can read, change, delete or plant the other's rows and that
the anonymous key gets nothing, then deletes both with the application's
own account-deletion function. Every line must say `OK`.

Then, in a browser: create an account on `/sign-up`, confirm the email,
make a study, open the site in a private window, sign in, and see it
arrive. Try Google on `/sign-in`. Try _Forgot your password?_.

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
