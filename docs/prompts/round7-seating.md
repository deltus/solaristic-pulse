Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 7: Seating plan assistant. Branch `round7` from the latest main after rounds 5 and 6 are merged (or from round6 if I say so). Read docs/HANDOVER.md first; only open the files this prompt points to.

**Goal.** Help a teacher build a seating plan from three things Radar knows: who works well or badly together, each student's learning needs, and what the check-ins show. The teacher always has the final say. The app suggests and explains; it never moves students on its own.

---

## Part A: New data (collect it lightly; teachers won't fill in long forms)

### A1. Relationships between students (new table `relationships`)
Fields:
- `classId`, `studentA`, `studentB`
- `type`: `keepApart` or `worksWell`
- `strength`: 1–2 (2 = "never together", for keep-apart)
- `source`: `manual`, `checkin` or `suggested`
- `confirmed` (boolean), `note` (optional), `createdAt`, `updatedAt`

**Ways to add one** (each should take under 10 seconds):
1. **Seating → Relationships:** tap two names, then pick "Works well together" or "Keep apart".
2. **Check-in issue screen:** when **Behaviour → Peer interactions** is ticked, show an optional "With who?" row of student chips from the same class. Tapping one or more saves the issue as normal and also records a `checkin`-source keep-apart *signal* (unconfirmed).
3. **Optional "Worked well with…"** on the "All good" undo toast: a small link that opens the same chip picker and saves an unconfirmed works-well signal.

**Suggestions, not decisions:**
- When two students have **2 or more** unconfirmed keep-apart signals in the last 6 weeks, show a suggestion on Seating → Relationships: "Ali and Sam: peer conflict logged 3× together. Keep apart?" The buttons are **Yes**, **Not now** and **Never suggest**.
- Do the same for works-well signals.
- Only **confirmed** relationships are used by the planner, plus unconfirmed ones the teacher has ticked "use anyway".

**Wellbeing → friendship issues** never creates a keep-apart. Being left out is a reason to make sure a student isn't alone, so it suggests the opposite: "Mia flagged as left out. Seat her with someone she works well with?" (Yes = mark a works-well student; Not now.)

### A2. Seating needs per student (new field `seatingNeeds` on Student)
- Options (in config): **front**, **near the board** (vision), **near the teacher**, **near the door / easy exit** (movement breaks), **aisle or end seat**, **away from windows/distractions**, **quiet area**, **left-handed (left end of a pair)**, plus a custom text option.
- Set them on the student page ("Seating needs") or in Seating → Students.
- **Link to ICP:** when an ICP adjustment from the common list implies a seat (e.g. "Seated near the front", "Movement breaks", "Reduced distractions"), suggest the matching seating need with one tap: "This ICP suggests: front. Add?" Put the mapping in config.

### A3. "Support right now" per class (optional, off by default)
- **Off by default.** Settings → Seating has a switch, "Use support levels in seating plans", explained in one line: "Teacher-only, reviewed each term, used to balance tables." When it's off, nothing is collected or shown.
- **Values:** `needs more support`, `on track`, `ready for extension`. Never call it "ability" in the app.
- **Per class** (a student can differ between subjects), with `setAt` and `reviewBy` (the end of the current term, or 10 weeks).
- **Review prompt:** after `reviewBy`, the value counts as unset until the teacher reviews it ("Still accurate?" with Yes / Change / Clear on Seating → Students).
- **Evidence-based suggestion** (the teacher decides): if a student has 3 or more Coping → content or assessment progress concerns, or under 40% cold calls answered well, in the last 4 weeks, suggest "needs more support". Show the evidence in one line.
- **Use:** the default "Mixed tables" puts at least one "on track" or "extension" student at every table where possible. "Support table near teacher" is an opt-in toggle, not the default.
- **Sensitive:** encrypted when synced. Never on the projector view, printouts, relief passes or de-identified exports. Delete the value when the student is archived.

### A3b. Balance tags (teacher-defined groups)
- **Teacher-made tags** on Seating → Students, e.g. "Group A" / "Group B", "EAL", "New this term". The app never names or asks for gender, but a teacher can use neutral tags (e.g. A/B) for it if they want.
- **Each tag has a "Don't leave anyone alone from this tag" switch.**
- **Sensitive:** stored encrypted like notes, never shown on the projector view or printouts, never exported, and not sent to relief teachers.

### A4. Room layouts (new table `rooms`) and plans (new table `seatingPlans`)
- **Room:** a grid with each cell marked desk, empty, teacher desk, door, window or board. Desks are grouped into tables (pairs, fours, rows).
  - Templates: **Rows of pairs**, **Groups of 4**, **Groups of 6**, **U-shape**, **Rows of singles**.
  - Plus a simple editor: tap cells to add or remove desks, then tap "Group" to join desks into a table.
  - The front of the room is wherever the board is.
- **Plan:** `classId`, `roomId`, `name`, `createdAt`, `activeFrom` (date), and `seats` (seat id → student id, plus a locked flag). There's one active plan per class; old plans are kept.

---

## Part B: The planner (src/logic/seating.ts, pure functions, well tested)

**Inputs:**
- students present in the roster
- the room
- confirmed relationships
- seating needs
- learning levels
- recent check-in data (last 4 weeks)
- any seats the teacher has locked

**Hard rules** (never broken; if they can't all be met, say which ones and why):
- **Seating needs:** "front" means the row(s) nearest the board; "near the door" means within 2 cells of the door; and so on.
- **Keep apart, strength 2:** not at the same table and not in neighbouring seats.
- **Locked seats** stay where they are.

**Soft goals** (weighted; weights in src/config/seating.ts):
- **Keep apart, strength 1:** not at the same table.
- **Works well:** same table or neighbours.
- **Attention concerns:** students with recent Attention issues (off task, not listening) sit nearer the teacher or front.
- **Spread the load:** students with the highest recent concern (the ranking's need score) are spread across tables, not clustered.
- **Support levels** (only when switched on): "Mixed tables" (the default) spreads levels so each table has a confident student; "Support table near teacher" (opt-in) groups "needs more support" students at the table nearest the teacher. Expired or unset levels are ignored.
- **Nobody sits alone (strong preference):** every student has at least one works-well student at their table, and nobody is the only member of a balance tag (with "don't leave alone" on) at their table. The planner can break this only when there's no other way, and must show a warning naming the student and why.
- **Fewer moves:** when replacing an existing plan, prefer fewer moves (a "Minimise changes" toggle, on by default).

**Method:**
- A greedy fill (hardest-to-place students first), then improve by random swaps (simulated annealing or hill-climbing).
- Use a seeded random for tests.
- It must finish in under 1 second for 32 students on a mid-range phone.
- **"Shuffle"** gives a different valid plan.

**Explanations:** for each student, keep 1–2 short reasons, e.g. "Front: ICP seating need", "Away from Sam (keep apart)", "With Priya (work well together)", "Near teacher: off task 4× recently". These are teacher-only.

---

## Part C: Screens

1. **Class page → Manage class → Seating plan.** Use the existing button layout. Don't add a 9th big button; put it under Manage class and as a link on the Daily check-in screen header ("Seats").
2. **Step 1: Room.** Pick a template or saved room, and adjust the grid.
3. **Step 2: Check.**
   - **Summary:** "28 students · 4 seating needs · 6 keep-apart · 3 work-well · 2 suggestions to review".
   - **Toggles:** Mixed ability / Similar ability, and Minimise changes.
   - **Button:** "Make a plan".
4. **Step 3: Plan.**
   - **The room drawn with names.** Tap a student to see their reasons. Drag or tap-tap to swap two students; the app warns if a swap breaks a rule ("Ali and Sam are now neighbours, keep apart").
   - **Lock icon** on any seat.
   - **Buttons:** **Shuffle**, **Save as active plan**, **Projector view**, **Export**.
   - **Score bar:** "All rules met · 9 of 11 goals met", tappable to list what isn't met. "Nobody sits alone" warnings are listed first, in amber.
   - **Accepting a plan with an "alone" warning:** the app asks "Keep an eye on Mia? She'll come up in check-ins." The default is Yes.
5. **Projector view.** Big names only: no reasons, no levels, no colours that hint at needs. The board is at the top so students can find their seat.
6. **Export.** PDF or printable page of the plan with names only, plus the date and class.
7. **Daily check-in:** the student card shows "Seat: Table 3" if there's an active plan.
   - **Watch list from seating:** students placed with an "alone" warning, or flagged as left out, get a ranking boost for their next 3 lessons. Their card shows one extra question: "New seat at Table 3. How are they going there?" with **Settled** / **Not settled**.
   - **Not settled** creates a "Review seat" item on the class page and in the seating plan (with the student highlighted), and adds an optional note: "Flag for lesson planning". Two "Not settled" answers in a row raise it as a suggestion on Home: "Mia isn't settling at Table 3. Review the seating plan?"
   - **Settled** twice in a row ends the watch. Cold call gets an optional chip filter: "Pick from: whole class / a table".

---

## Part D: Using it to reflect (small, private)
On the class page's existing graphs, mark the date each new seating plan became active (a thin vertical line). On My teaching, add an insight (only once 5 or more lessons exist on each side): "Since the new seating plan on 3 Nov, 8B's focus went from 74% to 83%, and Behaviour concerns dropped from 9 to 4." Phrase it as an observation, not proof.

---

## Privacy rules
- **Sensitive data:** relationships, seating needs and levels. Encrypt them like notes when synced, leave them out of de-identified exports, and never show them on the projector view or in printouts.
- **Relief teachers** (round 6) see the active plan with names only, never the reasons.
- **No built-in gender or other protected-attribute fields.** Balancing is done only through teacher-made tags (A3b), stored encrypted.
- **Purpose line:** add a short "What seating data is used for" section to docs/PRODUCT_SPEC.md and the Settings → Seating screen (balance tables and seat needs; teacher-only; reviewed each term; never shared with students), so schools can check it against their policy.

---

## Demo data
Add fictional relationships, seating needs, levels, one room and one active plan to the demo classes, so the preview shows it working straight away.

## Tests
- Hard rules: a "front" need is always met when there are enough front seats; keep-apart strength 2 is never at the same table or neighbouring; locked seats don't move.
- An impossible setup (6 "front" students, 4 front seats) returns a clear message naming the rule.
- Works-well pairs end up together more often than chance (seeded run).
- Support levels: ignored when the switch is off or the level has expired; mixed tables give each table a confident student where possible; the opt-in support table sits nearest the teacher.
- Nobody sits alone: avoided when possible; when it's unavoidable, the warning names the student; accepting it adds them to the check-in watch with the "How are they going?" question; "Not settled" creates a Review seat item.
- Balance tags: nobody is the only member of a "don't leave alone" tag at a table when it can be avoided; tags never appear in projector, print or export output.
- Minimise changes: re-planning with one new student moves only a few others.
- Suggestions appear after 2 signals and not after 1; "Never suggest" sticks.
- Friendship issues never create a keep-apart; they suggest a works-well instead.
- Projector view and export contain names only (check the generated output for reasons and levels).
- 32 students plan in under 1 second (rough timing test).

## Brief
Follow CLAUDE.md. In "How to test", include: load demo data, open 8B, then Seating plan; make a plan; swap two keep-apart students to see the warning; open the projector view.
