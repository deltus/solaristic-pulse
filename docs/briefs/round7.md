# Round 7: Seating plan assistant

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round7/

Branched from main; on 31/10 rounds 5 and 6 (and the latest main) were merged in, so this preview has brain breaks, relief passes and seating together.

## What changed
- **Seating plan** under Manage class (new button), plus a "Seats" link at the top of Daily check-in.
- **Step 1, Room:** five templates (rows of pairs, groups of 4, groups of 6, U-shape, rows of singles), saved rooms, and an editor (tap squares to place desks, board, door, windows or the teacher's desk; "Group desks" joins desks into a table).
- **Step 2, Check:** a one-line summary, Mixed tables / Support table near teacher (only when support levels are on), Minimise changes, then Make a plan.
- **Step 3, Plan:**
  - The room with names. Tap a student to see their 1–2 reasons; tap two students to swap (with a warning if it breaks a rule); lock seats.
  - A score bar ("All rules met · 17 of 18 goals met"), tappable, with anyone sitting alone listed first in amber.
  - Shuffle, Save as active plan, Projector view and Export.
- **Planner:**
  - Never breaks seating needs, "never together" or locked seats when they can be met. If it can't, it says which rule and why.
  - Then it balances: keep-aparts, work-well pairs, attention concerns near the teacher, spreading the highest-need students, support levels, nobody sitting alone, and few moves.
  - It plans a class in well under a second (about 45 ms for 24 students in the browser).
- **Relationships tab:** tap two names → "Works well together" or "Keep apart" (optionally "never together").
  - **Suggestions after 2 check-in signals:** Yes / Not now / Never suggest.
  - **"Use anyway"** for single signals.
  - **"Left out" suggestion:** Wellbeing → friendship issues suggests seating the student with someone they work well with. It never separates students.
- **Check-ins:**
  - "With who?" appears when Peer interactions is ticked.
  - "Worked well with…" is on the All good undo bar.
  - The card shows "Seat: Table 3".
- **Seat watch:** students placed alone (when you say "Keep an eye on them") or flagged as left out come up sooner for 3 lessons and get "New seat at Table 3. How are they going there?".
  - **Not settled** puts "Review seat" on the class page and highlights the student in the plan, with an optional "Flag for lesson planning".
  - **Two Not settled in a row** shows a suggestion on Your classes.
  - **Two Settled** ends the watch.
- **Students tab:**
  - **Seating needs:** front, near the board, near the teacher, near the door, aisle, away from windows, quiet area, left-handed, or your own.
  - **ICP suggestions:** "This ICP suggests: front. Add?".
  - **Balance tags** with "Don't leave anyone alone".
  - **Support right now** when switched on, with a 10-week "Still accurate?" review and an evidence-based suggestion.
- **Settings → Seating:** the support-levels switch (off by default) and "What seating data is used for".
- **Cold call:** "Pick from: Whole class / Table 1…".
- **Graphs and reflection:**
  - The class success graph shows a dashed line when a seating plan started.
  - My teaching adds "Since the new seating plan on…" once there are 5 lessons on each side.
- **Demo:** a new fictional class, **8B Humanities** (24 students), with relationships, needs, an ICP suggestion, a room and an active plan.

## How to test
1. **Load the demo:** Settings → Data → load demo data, then open **8B Humanities**.
2. **Open the plan:** open a lesson, tap **Manage class**, then **Seating plan**. The active plan shows. Tap the amber score bar: Evie is listed as sitting alone: Evie was flagged as left out and has no works-well partner yet.
3. **Swap a keep-apart pair:** tap **Sam**, then tap **Rosa** (next to Ali). A message says "Ali and Sam are at the same table, keep apart" and the bar turns red. Swap them back.
4. **Make a new plan:** tap **New plan or change the room** → **Next** → **Make a plan** → **Save as active plan**. When it asks "Keep an eye on them?", tap **Yes**.
5. **Projector view:** tap **Projector view**. It shows big names only, with the board at the top. Tap **Close**.
6. **Relationships:** tap **Yes** on "Tom and Nate: peer conflict logged 2× together", then tap **Yes** on Evie's suggestion and pick someone.
7. **Students tab:** on Aisha, tap **Add** on "This ICP suggests: away from windows". Tap a student to set seating needs or tags.
8. **Seat watch:** go back to the class → **Daily check-in**. Evie comes up first with "Seat: Table…" and "How are they going there?". Tap **Not settled**, then go back: "Review seat" is on the class page.
9. **Two in a row:** tap **+1 day**, open a lesson, check in Evie again and tap **Not settled**. Your classes now shows "Evie isn't settling at Table…".
10. **With who?:** check in any student, tap **Issue** → **Behaviour** → **Peer interactions** → pick a name under "With who?" → **Save**. After a second time with the same pair, a suggestion appears on Relationships.
11. **Worked well with…:** tap **All good** on a student, then **Worked well with…** on the bar at the bottom.
12. **Support levels:** Settings → **Seating** → turn on **Use support levels**. Back in Seating → Students, Felix asks "Still accurate?". Step 2 now shows Mixed tables / Support table near teacher.
13. **Cold call:** tap **Cold call** and choose a table under "Pick from".
14. **Export:** saves a printable page with names only.

## Not done / unsure
- **Choices I made**, since I couldn't ask:
  - "Front" means the tables in the row nearest the board (a whole group of 4 counts), and "near the board" is only that first row of desks.
  - "Near the teacher" means within 2 squares of the nearest desk to the teacher's desk.
  - "Quiet area" means 3 or more squares from the door.
  - "Neighbours" includes diagonal.
  - In rows of single desks, "together" means next to each other.
  - "Nobody sits alone" only applies to students who have at least one works-well partner, or who were flagged as left out. Otherwise every student without a recorded partner would be flagged.
  - "Not now" hides a suggestion for 2 weeks.
  - If you answer **No** to "Keep an eye on them?", left-out students are still watched; students sitting alone are not.
- **Export** saves an HTML page you open and print (or save as PDF) from the phone. It isn't a PDF file itself.
- **The plan scrolls sideways** on a phone (each desk needs room for a name). Long first names are shortened with "…".
- **The demo plan** is made when you load demo data. If the planner changes, reload the demo to see a fresh one.
- **Database version 14.** Round 5 uses 12 and round 6 uses 13, so the branches don't clash. But whichever round merges *after* a higher version is live must be bumped above it. For example, if round 7 goes live first, round 5's and 6's new tables must move to v15 and v16 before they merge. Otherwise phones already on v14 won't get those tables.
- **No Supabase change is needed:** all tables sync through the existing `sync_rows`, and the new sensitive fields are encrypted on the device.
- **Not tested on a real phone.** Drag-to-swap isn't built; tap-tap swap is.

## Wiring for relief passes (done 31/10, see Adjustments)
A checklist for that merge. Relief teachers see the active plan with **names only**: no reasons, needs, levels, tags or relationships.
1. **`ReliefBundle`** (src/relief/server.ts / owner.ts): add `seating?: { room: RoomLayout; seats: Record<string, string> }` built from the class's active plan. Seat id → student id only: drop `locked`, the plan name and anything else.
2. **`seedReliefDatabase`** (src/relief/device.ts): if `b.seating` is present, put one `seatingPlans` row (active, no name) in the relief database. Add `db.seatingPlans` to that transaction. The card then shows "Seat: Table 3" and cold call can pick by table.
3. **Students sent to relief:** keep building them field by field as now. Never add `seatingNeeds`, `seatingNeedNote`, `support`, `balanceTags`, `seatWatch` or `seatingIcpDismissed`. Never send the class's `balanceTags` or any `relationships` rows.
4. **Relief app UI** (src/ui/ReliefApp.tsx and relief mode in Checkin):
   - The "Seats" link opens the projector-style view (`projectorGrid`, names only), not the Seating screens (Plan / Relationships / Students tabs).
   - Hide "With who?" and "Worked well with…" in relief mode, because relationship rows aren't part of the relief push.
   - The seat watch question won't show, since `seatWatch` isn't sent.
5. **Database version:** round 6 uses v13 and this round uses v14. Whichever is merged second must have a version above whatever is live (see above).
6. **Test:** a relief bundle built from the 8B demo contains student names and seat ids, and none of these words: needs, support levels, tag names, relationship notes, "keep apart", "works well".

## Adjustments (31/10/2026: rounds 5 and 6 merged in, relief wired)
**What changed**
- **Merged Round 5 (brain breaks) and Round 6 (relief passes)** into this branch. Twelve files had both rounds adding things in the same place, and I kept both everywhere. The database now upgrades 11 → 12 → 13 → 14 in order.
- **Relief teachers get the seating plan, names only.** The pass carries the room and who sits where, with no plan name, locks, seating needs, support levels, balance tags, relationships or reasons.
- **The relief phone stores that plan**, so its check-in card shows "Seat: Table 3" and cold call can pick by table.
- **"Seats" on a relief phone** opens the names-only projector view, not the planning screens. It only shows when there's a plan.
- **In relief mode, "With who?" and "Worked well with…" are hidden.** Those answers can't travel back to you. The "New seat, how are they going?" question can't appear either, because seat watches aren't sent.
- New tests check the relief data for the 8B demo has names and seats, but none of the private seating words. They also check the relief phone stores the plan and a class with no plan sends no seating. 196 tests pass.

**How to test (preview)**
1. Open the link → **Load demo data** → tap **Today** in the menu: **Relief entries to review** is there (Round 6).
2. Open **8B Humanities** → **Open lesson** → **Skip**: seven buttons including **Brain break** (Round 5). Manage class has **Seating plan** and a **Relief** tab.
3. Seating plan → **Projector view**: names only.
4. Relief → **Relief pass** → **Prepare pass** → **What they'll see**: the class list as before.

A relief phone's Seats screen can only be tried on the live app with two phones (see the two-phone test in docs/briefs/round6.md, then tap **Daily check-in** → **Seats**).

**Not done / unsure**
- **"What they'll see" doesn't show the seating plan yet**, only the class list. The relief phone itself does show it.
- If you change the seating plan while a pass is running, the relief phone gets the new plan when the pass data refreshes (every 15 minutes) and the relief teacher reopens the pass. It isn't instant.
- **Merge order:** 5 (v12), then 6 (v13), then 7 (v14). This branch already contains 5 and 6, so merging it first would put all three live at once. I'll warn you if you say "merge" out of order.

## Adjustments 2 (31/10/2026: agreed with Thomas, docs/prompts/round7-adjustments.md)

Preview: https://deltus.github.io/solaristic-pulse/preview/round7/ · Database stays on v14 (saved rooms already had their own table).

**What changed**
- **The room step opens on big template tiles**, each with a small drawing, in this order: Groups of 4, Rows of pairs, **Rows of 3 (new)**, Groups of 6, U-shape, Rows of singles. **Your rooms** are listed above them.
- **Tapping a tile makes the room straight away**, sized to the class, with one big **Use this room** button. A smaller **Tweak** button opens the grid editor.
- **Quick wall setup at the top of Tweak:** 1) tap the wall with the board, 2) tap where the door is, 3) tap the wall(s) with windows (Done or Skip). Only the board, teacher's desk, door and windows move; desks stay put. The grid editor below is unchanged.
- **New desks join the table beside them in the same row.** An empty square between desks is a walkway. Groups of 4 and 6 are two rows back to back (6 tables of 4 = 3 above, 3 below).
- **Saved rooms have names** ("B12", "Science lab 3") and belong to you, not a class, so any class can use them. You can rename, duplicate and delete them. If a class's active plan uses a room, it can't be deleted; the message says which class.
- **Switching a class to a different room re-fits its plan:** locked seats stay, and students at a table that's unchanged stay. Everyone else is re-planned, and you see e.g. "4 students moved because the room changed".
- **"Projector view" is now "Present".** On a computer it opens in a new window with a **Full screen** button: names only, board at the top, big text. On a phone it opens full screen with the line "To show it on the board, open Radar on the classroom computer and tap Present." It adds "Your plan is already there." when sync is on.
- **Present is a reusable page** (src/ui/Present.tsx: big title, optional body, optional countdown) for tickets and brain breaks later. Only seating uses it now.
- **Previews page:** the "updated" times now show in your own time zone (they were labelled UTC).
- 12 new tests (Rows of 3 for 24 and 27, wall setup, a room shared by two classes and the delete block, switching rooms, Present is names only). 208 tests pass.

**How to test (phone)**
1. Open the preview → **Load demo data** → **8B Humanities** → Manage class → **Seating plan** → **New plan or change the room**.
2. You should see **Your rooms** (H3) and six template tiles with drawings. Tap **Rows of 3** → **Use this room**. A message says how many students moved. Tap **Save as active plan**.
3. **New plan or change the room** → **Groups of 4** → **Tweak**. Tap the right-hand wall (board moves there), tap the bottom wall (door), tap the top wall (windows) → **Done**. The desks shouldn't move.
4. Tap **Save as a room**, name it "B12". Go back to the room step: **B12** is under Your rooms. Open it and try **Rename** and **Duplicate**.
5. Use B12 for 8B and save the plan. Then open another class's Seating plan, pick B12 there too, and save. Back on B12, tap **Delete**: it's blocked and names the classes using it.
6. Tap **Present** on the phone: it goes full screen with names only and the line about the classroom computer. On a computer, Present opens a new window; try **Full screen**.
7. Open https://deltus.github.io/solaristic-pulse/preview/ and check the "updated" times match your clock.

**Not done / unsure**
- **iPhones can't go truly full screen in Safari** (Apple doesn't allow it for web pages). Present still fills the screen without the app's menus, and the Full screen button is hidden there. Adding Radar to the home screen gets closest.
- **On a computer, Present opens a new window.** If the app has a passcode lock, the window may ask for it first. If the browser blocks pop-ups, it opens in the same tab instead.
- **"Your plan is already there"** only shows when sync is on, so you won't see it on the preview (no sync there).
- **Re-fit rule (my reading):** a table "still exists" when exactly the same desks are still there. Moving only the board, door or windows keeps everyone. A different template usually re-plans everyone except locked seats.
- **Desks touching in a row join automatically when you add them.** Two rows back to back still need **Group desks → Join as one table** (the templates already do this). Removing a desk from the middle of a table doesn't split it into two.
- The Tweak grid still scrolls sideways on a phone (as before).
