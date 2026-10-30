# Round 6: Relief passes

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round6/
(Includes everything live on main plus Round 5. Previews have no sign-in, so passes can be prepared and previewed there, but not sent. The real two-phone test happens on the live app after merging; see the end of this brief.)

## How it works (option A, which you chose)
- The class teacher prepares a pass. Their phone locks the class data for the pass with a **key made just for that pass** and uploads it locked. The key only travels in the pass link after the `#`, which browsers never send to a server, so **Supabase never sees student names**.
- The relief teacher opens the link and signs in with their own email code. The server checks the dates and the email (if you set one), **locks the pass to their phone**, logs the use, and hands over the locked data.
- Their phone keeps the class in **its own separate database**, never mixed with their own Radar data. Everything they enter goes back locked with the pass key.
- Your phone unlocks it and **checks every entry belongs to that class and its students**. Then it saves it, tagged "Relief: name", and normal sync re-locks it with your own key.
- When the pass ends or you cancel it, the relief phone sends anything unsent, then **deletes the class**.

## What changed
- **Relief pass** (Manage class → Relief tab): dates (up to 5 school days), name, email, **Share ICP adjustments** (off by default) and Today's plan. Then **Send** (QR code, copy link, email), **What they'll see**, **Cancel pass**, and the use log (who, when, which phone).
- **The relief teacher's phone:** a simplified class page with a Relief banner and end date. It has Open/close lesson, Daily check-in (in your ranking order, without reasons), Homework check, Cold call and Brain break, and nothing else.
- **Home → Relief entries to review:** Accept all, Review (remove single entries), and automatic acceptance after 7 days. Timeline rows say "(Relief: name)".
- **New this session:**
  - Two-phone tests with a pretend server that follows the same rules as the real one: 11 tests, 169 in total, all passing.
  - Fixed a timing gap where an entry made in the last second before the pass ended could be lost.
  - Tightened the checks so a relief phone can't attach a note to a check-in that isn't from its own pass.
  - Added size limits on what a relief phone can send.
  - Wrote click-by-click Supabase steps (below and in docs/SUPABASE.md).
- Database v13. The Supabase script is `20261027000000_relief_passes.sql`, still the newest on any branch.

## How to test (preview, one phone)
1. Open the link → **Load demo data** → tap **Today** in the menu. **Relief entries to review (3)**, from Sam Relief. Tap **Review**, remove one, then **Accept all**.
2. Open **7B English** → **Manage class** → **Relief** tab. The past pass for Sam Relief is there. Tap **What they'll see**: Bill Harris shows "ICP · Ask the school for details", with no adjustment details.
3. Tap **Relief pass** → leave **Share ICP** unticked → **Prepare pass**. It appears under Active. Prepare another with **Share ICP** ticked → What they'll see: Bill's adjustments now show.
4. Try a last day two weeks away: "A pass can cover up to 5 school days."
5. Tap **Cancel pass**: it moves to Past as Cancelled.
6. Open a student who had a relief check-in yesterday: the timeline says "(Relief: Sam Relief)".

## Supabase steps (once, after you say "merge" and Round 5 is live)
1. On GitHub, open the repo → **supabase** → **migrations** → `20261027000000_relief_passes.sql`.
2. Tap **Copy raw file** (the two-squares icon, top right of the file).
3. Go to **supabase.com/dashboard** and open the Solaristic Radar project.
4. Left menu → **SQL Editor** (the `>_` icon) → **+ New query**.
5. Click in the empty box and paste (Ctrl+V).
6. Click the green **Run** button (bottom right).
7. You should see **"Success. No rows returned"**. Running it twice is safe.
8. Check: left menu → **Table Editor**. There are three new tables: `relief_passes`, `relief_uses`, `relief_entries`.
9. Check: left menu → **Database** → **Functions**. There are `claim_relief_pass`, `relief_pass_state` and `push_relief_entries`.

## How to test with two phones (live app, after merge + Supabase)
1. **You:** sign in (Settings → Account & devices). Open a class → Manage class → Relief → **Relief pass**. Enter Thomas's name and email, leave Share ICP off, **Prepare pass** → **Send** → show the QR code.
2. **Thomas:** scan it (or open the copied link) and sign in with the emailed code. He lands on the Relief class page with the banner and end date. Check there's no Students tab, Reports, My teaching, or any other class.
3. **Thomas:** Open lesson, do a few check-ins (one with a note), a homework check and a cold call.
4. **You:** within about 2 minutes, Home shows **Relief entries to review** with Thomas's name. Open a student: "(Relief: Thomas)" in the timeline. Relief tab → the use log shows his phone.
5. **One phone only:** Thomas opens the same link on a second phone or browser → "This pass is already in use. Ask the class teacher for a new one".
6. **Wrong email:** someone else signs in with the link → refused.
7. **Cancel:** tap **Cancel pass**. Within a minute, Thomas's phone sends what's left and the class disappears.
8. **Expiry (+1 day):** make a pass for today only and let Thomas use it. The next day, his phone clears the class once it's online.

## Not done / unsure
- **Encryption:**
  - The names are locked with a pass key, not with the relief teacher's own key (option A, as agreed). Anyone who has the full link and signs in first could open the pass.
  - **Always set the relief teacher's email.** Then the link is useless to anyone else.
  - Without an email, a stranger who got the link first would see the class list and lock out the real relief teacher. They'd never see notes or history.
- **The relief teacher's phone keeps the pass key** for the length of the pass. After it ends, the class is deleted, but the server keeps the locked copy until you delete the pass. Deleting old passes on the server isn't built; it's a small follow-up if you want it.
- The two-phone flow is tested with a pretend server, not the real Supabase. The real one needs the steps above, then the two-phone test.
- A relief teacher who already uses Radar would have their own sync paused on that phone during the pass. After it ends, their own data is untouched (it's in a different database), but I haven't tried this on a real phone.
- Seating (Round 7) isn't wired to relief yet. That happens in Round 7 (its brief has the checklist).
- "Reception/admin mode" and a school on/off switch are left for later, as asked. The create-pass function can be called for any class.
