# Supabase: accounts, linked devices and invites

This is phase 1 of the cloud plan in the project guide. Teachers can:

- **Sign in on several devices** with an emailed code (no password): Settings → **Account & devices**.
- **See and remove linked devices**. A removed device signs itself out the next time it opens. **Sign out all other devices** ends every other session at once, for example after losing a phone.
- **Add a device by QR code**: Account & devices → *Show QR code*. Scan it on the other phone or PC; the app opens with the email filled in.
- **Invite a colleague** (Settings → **Invite a colleague**, also in the side menu): a QR code, a copyable link, **Email invite** (opens your email app with the message written) and **Share**. The link opens the app with "*Name* invited you", plus install steps (an Install button on Chrome/Edge, Add to Home Screen on iPhone, and an APK link if you set one). Signed-in teachers see whether each invite was used.

**No student data goes to Supabase.** The tables hold only the teacher's email (in Supabase Auth), name, school, devices and invites. Records made on each device stay on that device until live sync (the next phase) is built. When accounts are not configured, the app works exactly as before, and *Invite a colleague* shares a plain link and QR code to the app.

## One-time setup (about 10 minutes)

1. **Create the project.** Go to [supabase.com](https://supabase.com) → New project. Choose **Sydney (ap-southeast-2)** as the region and save the database password somewhere safe.
2. **Create the tables.** Open **SQL Editor** → New query, paste the contents of `supabase/migrations/20261018000000_accounts_devices_invites.sql` and click **Run**.
3. **Allow the app's addresses.** Authentication → **URL Configuration**:
   - Site URL: `https://deltus.github.io/solaristic-pulse/`
   - Redirect URLs: add `https://deltus.github.io/solaristic-pulse/**` and `http://localhost:5173/**` (for development).
4. **Put the code in the sign-in email.** Authentication → **Email Templates** → *Magic Link*. Replace the body with:
   ```html
   <h2>Your Solaristic Pulse sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Enter this code in the app. Or, on this device, <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   <p>If you didn't ask for this, ignore this email.</p>
   ```
   Do the same for the *Confirm signup* template, so new teachers also get a code. The code is what makes sign-in work in the Android app and on a different device from the one that reads the email.
5. **Email sending.** The built-in email service is for testing only and sends just a few emails per hour. Before a pilot, go to Authentication → **SMTP Settings** and connect a sender, such as Resend, Postmark or your school's Microsoft 365 account.
6. **Connect the app.** Project Settings → **API** shows the *Project URL* and the *anon public* key. The anon key is meant to be public; row-level security protects the data.
   - **This PC:** copy `.env.example` to `.env.local`, fill in both values, then `npm run dev`.
   - **Live site:** in GitHub, open the repo → Settings → Secrets and variables → Actions → **Variables**, then add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Optionally also add `ANDROID_APK_URL`, for example a GitHub Release asset. Push to `main` (or re-run the workflow) to republish.
   - **Android APK:** build with `.env.local` in place (`npm run android:apk:win`); the values are baked into the build.

## Tables (all protected by row-level security)

| Table | One row is | Who can see it |
|---|---|---|
| `profiles` | A teacher: display name, school, who invited them | Only that teacher |
| `devices` | A phone or PC the teacher signed in on: name, platform, first and last seen, removed date | Only that teacher |
| `invites` | An invite code: inviter's name, optional email, expiry (30 days), who used it and when | Only the teacher who created it |

Functions: `touch_device` (each device checks in when opened and learns if it was removed), `invite_details` (lets someone who isn't signed in yet see who invited them, and nothing else), `accept_invite` (records that the signed-in teacher used an invite).

Browse and edit everything in **Table Editor**. User accounts are under **Authentication → Users**, where you can also delete an account; its devices, invites and profile are removed with it.

## Notes and limits

- **Removing a device.** The removed device signs itself out the next time it opens or comes back to the foreground. Until then its session stays valid for up to an hour. For a lost phone, use **Sign out all other devices**, which also stops it renewing.
- **Magic link versus code.** The link in the email only signs in the browser that requested it. On a different device, or in the Android app, use the code.
- **Invites do not grant access to anything.** They only show who invited the person and record that they joined. Sharing classes between teachers is a later phase, with end-to-end encryption.
- **Free plan.** Free projects pause after a week without activity and have no backups. Move to Pro before any real use.
