# Handover (31/10/2026)

**Live (main):** rounds 0 to 9, all merged together on 31/10. Database **v16**. 248 tests pass, including `tests/upgrade-v16.test.ts` (a phone on the old v11 database keeps its data when it upgrades).
The round branches (`round5` … `round9`) are done; no round is open. Previews: https://deltus.github.io/solaristic-pulse/preview/

## What the last round changed (round 9, brief: docs/briefs/round9.md)
- **Check for understanding** tile with four modes, each with its own icon and colour:
  - **Whole class:** everyone starts as Yes; tap for Not yet, hold for Sort of.
  - **Cold call assistant**.
  - **Select a student:** saved as a cold call with `manual: true`.
  - **Entry/exit ticket:** up to 3 questions, saved questions per class (on the class record, encrypted), shown with the Present page and an optional countdown.
- **Absent for the rest of the day**, **← Previous** on swipe screens, and your name in the menu opens **Profile**.
- Code: `src/ui/screens/Cfu.tsx`, `src/ui/screens/ColdCall.tsx` (`manual`), `src/logic/cfu.ts`, `src/config/cfu.ts`, `tests/round9.test.ts`.

## Still to do (Azeem)
**Run the two Supabase scripts, in this order.** Until then, relief passes (round 6) and relief incidents (round 8) won't work on the live app. Everything else works.
1. `supabase/migrations/20261027000000_relief_passes.sql` (round 6)
2. `supabase/migrations/20261031000000_relief_incidents.sql` (round 8)

For each one:
1. On GitHub, open the repo → **supabase** → **migrations** → the file.
2. Tap **Copy raw file** (the two-squares icon, top right).
3. Go to **supabase.com/dashboard** and open the Solaristic Radar project.
4. Left menu → **SQL Editor** (the `>_` icon) → **+ New query**.
5. Click in the empty box and paste (Ctrl+V).
6. Click the green **Run** button (bottom right).
7. You should see **"Success. No rows returned"**. Running it twice is safe.

After the first script, check: **Table Editor** shows `relief_passes`, `relief_uses` and `relief_entries`.

## Unsure / to check on a phone (live app)
- swipe fly-off and cold-call roll motion; vibration (Android only)
- Word journal export opened in Word; Android notifications
- the seating plan's sideways scroll
- Present: new window + Full screen on a computer (iPhone can't go truly full screen)
- Whole class press-and-hold, ticket swipes, ticket Present page and countdown
- relief passes end-to-end with two phones (after the Supabase scripts): docs/briefs/round6.md "How to test with two phones"

## Next prompt
None written yet in docs/prompts/. The next round should branch from main and use **database v17** or higher (`src/db.ts`).
