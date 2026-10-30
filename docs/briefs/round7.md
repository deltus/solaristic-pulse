# Round 7: Seating plan assistant

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round7/

Branched from main (rounds 0, 3, 3b and 4), not from round 5 or 6, so it doesn't wait for brain breaks or relief passes.

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

## Wiring needed when round 6 (relief passes) merges
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
