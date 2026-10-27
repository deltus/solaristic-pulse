# Round 6: Relief pass (partly built; stopped at the encryption step)

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round6/
(Needs the one-off GitHub setting in docs/briefs/round0.md. Includes rounds 0, 3, 4 and 5.)

## How invites and encryption work today (plain English)
- **Accounts:** a teacher signs in with an emailed code. Their devices are listed and can be removed.
- **Invites:** a link or QR code that only says "*Name* invited you" and records that the person joined. **An invite gives no access to anything.**
- **Encryption:** each teacher has **one secret key**, made on their first device. Names, notes and ICP text are locked with it before they leave the phone. The key only moves between **that teacher's own devices**, inside the "Add a device" QR code (after the #, which never reaches a server) or as the recovery key.
- **The server:** every synced record belongs to one account, and the database only lets an account read and write **its own** records.
- docs/SUPABASE.md says sharing classes between teachers is "a later phase". **So there is no sharing design yet to follow.** A relief teacher is a different account, so with today's server they can't receive the class or send entries back, and there's no relief teacher's key to re-encrypt for.
- Also, previews have no sign-in or sync by design (round 0), so the two-device part couldn't be tried in a preview anyway.

## What I built (the safe parts)
- **Relief pass** button under Manage class, and a **Relief** tab listing active, upcoming and past passes, with **Cancel pass**, the dates, the ICP setting and a use log (empty until the server part exists).
- **Pass form:** first day (today by default) and optional last day (up to 5 school days), relief teacher's name and email (optional), **Share ICP adjustments** (off by default), and Today's plan (pre-filled from the current lesson's learning intention). The rules live in one function (makeReliefPass / createReliefPass) that a future reception/admin role can call for any class.
- **What the relief teacher would get** (buildReliefBundle in src/logic/relief.ts): names, flag marker (never the reason), ICP marker, ICP titles and short instructions **only if shared**, today's plan, last lesson's homework and the check-in order (no reasons). No history, averages, notes, Wellbeing, evidence, journal, reports or other classes. It's sealed with a new key made just for that pass (AES-256-GCM, the same code as sync).
- **"What they'll see"** on each pass: the simplified relief class page (Relief banner with the end date, plan, homework, the five buttons, the class list with markers), drawn only from that sealed data. Buttons are inactive in the preview.
- **Pass rules** (tested): works only within its dates, until the end of the last day local time; only for the set email; locked to the first device ("This pass is already in use…"); a cancelled pass stops at once; an ended pass clears its downloaded data only after unsent entries have synced.
- **Relief entries:** records can carry a "Relief: name" tag (encrypted when synced). Home shows **Relief entries to review** with **Accept all**, **Review** (remove single entries), and automatic acceptance after 7 days. The timeline shows "(Relief: name)". The demo data includes a fictional relief day (Sam Relief) so you can see this.

## What changed
- Manage class → **Relief** tab and **Relief pass** button; pass form; "What they'll see" preview; cancel; use log.
- Home → **Relief entries to review** card; timeline "Relief: name".
- Database v13 (relief passes; synced with the relief teacher's name, email, plan and use log encrypted).

## How to test (one phone is enough for what's built)
1. Open the link, tap **Load demo data**. Home shows **Relief entries to review** (3, from Sam Relief). Tap **Review**, remove one, then **Accept all**.
2. Open 7B English → **Manage class** → **Relief pass**. Add a name, leave **Share ICP** off, tap **Prepare pass**. The preview shows Bill Harris with "ICP · Ask the school for details".
3. Prepare another pass with **Share ICP** ticked: Bill's adjustments now show.
4. Try a last day two weeks away: "A pass can cover up to 5 school days."
5. Tap **Cancel pass**: it moves to Past as Cancelled.
6. Open a student who had a relief check-in yesterday: the lesson timeline says "(Relief: Sam Relief)".

The two-device test (relief teacher signs in and uses the pass) isn't possible until one of the options below is chosen and built.

## Not done / unsure: the options (please choose one)
**A. Pass stored on the server, key in the link (recommended).**
- One Supabase update: new relief_passes and relief_uses tables and two server functions. The class teacher's phone uploads the **sealed** class data for the pass. The pass link carries the pass key after the #, so the server never sees names.
- The relief teacher signs in with the emailed code; the server checks dates, email and device, logs the use, and hands over the sealed data. Their entries go back sealed with the same pass key; the class teacher's phone unlocks them and re-locks them with the teacher's own key.
- Gives everything in the prompt: one device, cancel straight away, use log, entries syncing back.
- Needs: you run one SQL file in Supabase (I'd give click-by-click steps), plus a careful security review, because it's the first time one account can reach another's data.

**B. No server change: everything in the link.**
- The sealed class goes inside the link itself; the relief teacher's entries come back as a "return link" or file that the class teacher opens.
- Works without touching Supabase, but can't lock to one device, can't be cancelled once sent, has no use log, and the return step is manual.

**C. Proper teacher-to-teacher sharing (the "later phase").**
- Each teacher gets a public/private key pair, and the pass key is locked for the relief teacher's key.
- Most secure and reusable for future class sharing, but the biggest job, and the relief teacher needs an account set up before the day.

Other notes:
- Done without your OK on the plan, as you asked. I stopped before any server or network code.
- Not built yet: the relief teacher's side (signing in with the pass, the working simplified page, their device's copy of the class, and clearing it after expiry). The page design is in the preview.
- ICP adjustments that are active at any point during the pass dates count as shared/marked.
- "Last used" and the use log will fill in once the server records uses.
