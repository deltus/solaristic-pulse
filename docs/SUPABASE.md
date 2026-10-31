# Supabase: accounts, linked devices, invites, live sync and relief passes

These are phases 1 and 2 of the cloud plan in the project guide. Teachers can:

- **Sign in on several devices** with an emailed code (no password): Settings → **Account & devices**.
- **See and remove linked devices**. A removed device signs itself out the next time it opens. **Sign out all other devices** ends every other session at once, for example after losing a phone.
- **Add a device by QR code**: Account & devices → *Show QR code*. Scan it on the other phone or PC; the app opens with the email filled in.
- **Invite a colleague** (Settings → **Invite a colleague**, also in the side menu): a QR code, a copyable link, **Email invite** (opens your email app with the message written) and **Share**. The link opens the app with "*Name* invited you", plus install steps (an Install button on Chrome/Edge, Add to Home Screen on iPhone, and an APK link if you set one). Signed-in teachers see whether each invite was used.

- **Live sync** (switches on automatically when you sign in): classes, students, check-ins, answers, Blitz, notes, ICP records and the timetable stay the same on every device that has sync on, usually within two seconds. See *Live sync* below.

Without sync, no student data goes to Supabase: only the teacher's email (in Supabase Auth), name, school, devices and invites. When accounts are not configured, the app works exactly as before, and *Invite a colleague* shares a plain link and QR code to the app.

## One-time setup (about 10 minutes)

1. **Create the project.** Go to [supabase.com](https://supabase.com) → New project. Choose **Sydney (ap-southeast-2)** as the region and save the database password somewhere safe.
2. **Create the tables.** Open **SQL Editor** → New query, paste the contents of `supabase/migrations/20261018000000_accounts_devices_invites.sql` and click **Run**.
3. **Allow the app's addresses.** Authentication → **URL Configuration**:
   - Site URL: `https://deltus.github.io/solaristic-pulse/`
   - Redirect URLs: add `https://deltus.github.io/solaristic-pulse/**` and `http://localhost:5173/**` (for development).
4. **Put the code in the sign-in email.** Authentication → **Email Templates** → *Magic Link*. Replace the body with:
   ```html
   <h2>Your Solaristic Radar sign-in code</h2>
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

## Live sync

- **Automatic on sign-in.** Signing in switches sync on by itself (`src/sync/plan.ts`). On the account's first device it creates the key, uploads everything and shows a *Save your recovery key* banner. On a device with no classes it downloads the account's records. It asks with a banner only when it can't decide safely: *Unlock your synced records* (the key isn't on this device yet) or *Choose how to sync this device* (both sides already have records). A device where sync was switched off by hand stays off until it's switched on again; signing out and back in switches it on again.
- **Keys.** The first device creates the account's encryption key and shows a **recovery key** (52 characters) to save, for example in a password manager. Other devices get the key by scanning the *Add a device* QR code (the key travels in the part of the link after `#`, which browsers never send to a server) or by typing the recovery key. On a brand-new device the setup screen offers **Copy my records to this device** and skips the rest of setup.
- **What is encrypted.** Students' names, preferred names, school IDs and flag reasons, answer notes and context, teacher notes, ICP adjustment titles and details, ICP check notes, timetable notes and the day's queue reasons are encrypted on the device (AES-256-GCM) before upload and appear as `enc` ciphertext in Supabase. Ratings, dates, areas, draw weights, Blitz marks and class names stay readable in `data`, so reports and modelling can work server-side later. Settings, the PIN and saved files never sync.
- **How it works.** Every change saves on the device first and is queued in an outbox (`src/sync/outbox.ts`). Changes are sent within about a second when online, or as soon as the connection returns. Supabase Realtime tells the other devices, and they fetch what changed (`src/sync/engine.ts`). If the same record changes on two devices, the later change wins, and the earlier version is kept in `sync_history`.
- **Turning it off** on a device keeps its records but stops sending and receiving. Signing out turns sync off and forgets the key on that device. *Delete all data on this device* turns sync off first, so your account and other devices keep their copy. *Restore from backup* with sync on replaces the records on every synced device.
- **Losing the key.** If every device and the recovery key are lost, the encrypted names and notes can't be read by anyone. Admin recovery (from the project guide) is not built yet.

## Tables (all protected by row-level security)

| Table | One row is | Who can see it |
|---|---|---|
| `profiles` | A teacher: display name, school, who invited them | Only that teacher |
| `devices` | A phone or PC the teacher signed in on: name, platform, first and last seen, removed date | Only that teacher |
| `invites` | An invite code: inviter's name, optional email, expiry (30 days), who used it and when | Only the teacher who created it |
| `sync_rows` | One synced record (table + id): readable `data`, encrypted `enc`, `deleted`, change time, device, `seq` | Only that teacher |
| `sync_history` | Earlier versions of synced records, kept when a record is overwritten or deleted | Only that teacher |
| `sync_keys` | A check value that confirms a recovery key is right (never the key itself) | Only that teacher |

Run `supabase/migrations/20261018100000_live_sync.sql` once as well (SQL Editor), after the first migration.

Functions: `push_rows` (saves a batch of changes; an older change never overwrites a newer one), `touch_device` (each device checks in when opened and learns if it was removed), `invite_details` (lets someone who isn't signed in yet see who invited them, and nothing else), `accept_invite` (records that the signed-in teacher used an invite).

Browse and edit everything in **Table Editor**. User accounts are under **Authentication → Users**, where you can also delete an account; its devices, invites and profile are removed with it.

## Relief passes (round 6)

A class teacher can give a relief (CRT) teacher one class for up to 5 school days (Manage class → **Relief pass**). The class data for the pass is uploaded **already locked** with a key made just for that pass. The key is only in the pass link, after the `#`, which browsers never send to a server, so Supabase never sees student names. The relief teacher signs in with their own email code. The server checks the dates, the email (if one was set) and the one-device rule, logs each use, and hands over the locked data. Their entries come back locked the same way. The class teacher's phone unlocks them, checks they belong to that class, saves them (normal sync re-locks them with the teacher's own key) and deletes them from the server.

### Turning it on (about 5 minutes, once)
You need to be signed in to supabase.com, and the two earlier migrations must already have been run (steps 2 and *Live sync* above).

1. On GitHub, open the repo → **supabase** folder → **migrations** → `20261027000000_relief_passes.sql`.
2. Tap the **Copy raw file** button (two overlapping squares, top right of the file).
3. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open the Solaristic Radar project.
4. In the left menu, click **SQL Editor** (the `>_` icon).
5. Click **+ New query** (top left), click in the big empty box, and paste (Ctrl+V).
6. Click the green **Run** button (bottom right), or press Ctrl+Enter.
7. You should see **"Success. No rows returned"**. (Running it a second time is safe.)
8. Check it worked: in the left menu, click **Table Editor**. You should see three new tables: `relief_passes`, `relief_uses` and `relief_entries`. Each has a small shield showing row-level security is on.
9. Check the functions: left menu → **Database** → **Functions**. You should see `claim_relief_pass`, `relief_pass_state` and `push_relief_entries`.

Nothing else changes: the redirect URLs and email templates above already cover pass links.

### Tables

| Table | One row is | Who can see it |
|---|---|---|
| `relief_passes` | A pass: class id, dates, relief email (optional), the locked class data, cancelled time, which account and device it's locked to | Only the class teacher who made it (the relief teacher reaches it only through the functions) |
| `relief_uses` | Each time a pass was opened: who, when, which device | Only the class teacher |
| `relief_entries` | A locked record a relief teacher entered, waiting for the class teacher's phone | Only the class teacher (who also deletes it) |

Functions (relief teacher, signed in): `claim_relief_pass` (open a pass on this device; refuses with *cancelled*, *not-yet*, *expired*, *wrong-email* or *other-device*), `relief_pass_state` (is it still usable?), `push_relief_entries` (send entries back: only from the locked device, only the record types a relief teacher can make, at most 500 at a time and 200 KB each, and only changes made before the pass ended or was cancelled; late ones are accepted for 2 days).

### Limits to know
- **A pass with no email** works for whoever signs in with the link first, then only on that device. Anyone holding the link could open it first and lock out the real relief teacher (they'd see the class list, as the relief teacher would). Setting the relief teacher's email avoids this.
- **The class data is refreshed** every 15 minutes while the pass is running, so the check-in order stays current.
- **Previews can't be used** to try passes, because they have no sign-in by design. Try them on the live app.

## Notes and limits

- **Removing a device.** The removed device signs itself out the next time it opens or comes back to the foreground. Until then its session stays valid for up to an hour. For a lost phone, use **Sign out all other devices**, which also stops it renewing.
- **Magic link versus code.** The link in the email only signs in the browser that requested it. On a different device, or in the Android app, use the code.
- **Invites do not grant access to anything.** They only show who invited the person and record that they joined. Sharing classes between teachers is a later phase, with end-to-end encryption; relief passes (above) are the one exception, limited to one class for up to 5 school days.
- **Free plan.** Free projects pause after a week without activity and have no backups. Move to Pro before any real use.
