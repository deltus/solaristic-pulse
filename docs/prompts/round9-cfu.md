Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 9: Check for understanding. Branch `round9` from the latest main. Read docs/HANDOVER.md first and only open the files this prompt points to. Before adding database versions or Supabase migrations, check the highest numbers on every open round* branch and use one above them all.

## Check for understanding (replaces the Cold call tile)

### 1. The tile
- Rename the class page's **Cold call** tile to **Check for understanding**. It opens a small menu with four options. The last-used one is remembered and listed first.
- Show the lesson's learning intention at the top of each mode, if one was entered.

### 2. Modes (order agreed with Thomas, 31/10/2026)
1. **Whole class (the default):** the teacher asks "Is everyone happy with this?" and the class shows thumbs.
   - **Everyone starts as Yes.** The teacher only taps the few who said no (**Not yet**), or long-presses for **Sort of**.
   - Absent students are greyed out and skipped.
   - **Save** in one tap. No swiping through names.
   - Saved per student against the lesson.
2. **Cold call assistant:** exactly as now (the roll, swipes and history).
3. **Select a student:** a manual pick from a quick searchable grid of names, recorded with the same swipes as cold call. Saved as a cold call with `manual: true`, so the fairness ranking still counts it.
4. **Entry or exit ticket:**
   - **Set up:** pick **Entry** (start of lesson, about the previous lesson's intention) or **Exit** (end of lesson). Type up to 3 questions, or use the suggested one: "In one sentence, what did we learn about [learning intention]?" Teachers can save and reuse questions per class.
   - **Show it:** use the Present page from round 7 (big text, optional countdown). Students answer on paper; there's no student app.
   - **Record it:** swipe through the class. Right = **Got it**, left = **Not yet** (optional chips: misconception, incomplete, absent), up = **Partly**.
   - **Close lesson link:** the Close lesson screen offers "Run an exit ticket?" if none was done.

Give each mode its own icon and colour, so each button feels made for that exact job.

### 3. What the results feed
- **Per student:** "Not yet" on yes/no or tickets, and "struggled" on cold calls, count as **content** signals for:
  - the Coping with work → content suggestion
  - the "support right now" suggestion (round 7)
- **Per lesson:** a CFU score (% got it). It shows in the lesson timeline and the class graphs. My teaching gains an insight, e.g. "Lessons where you got through the plan averaged 82% on exit tickets, vs 61% when you didn't."
- **Whole class "Not yet"** counts as a content signal for that student, like a ticket "Not yet".

---

## Absent for the rest of the day (from Thomas, 31/10/2026)
A student marked absent stays absent in that class for the rest of the day, so the teacher never has to mark them twice.

**What marks a student absent:**
- "Absent" in Blitz
- "Absent" in a Check for understanding mode (yes/no grid, exit or entry ticket, cold call skip-as-absent)
- "Not here" in the daily check-in
- "Absent" in Homework check

Store it as a daily attendance note (`absentToday`: classId, studentId, date, source), not as a rating.

**Where it applies,** for the rest of that date in that class:
- **Blitz, the yes/no grid and tickets** pre-fill those students as **Absent** (greyed, with an "Absent" chip). **"All others: Yes" skips them.** That's the moment it should feel like the app just knows.
- **The daily check-in queue and the cold call roll** leave them out.
- **Homework check** shows them as Absent.

**What clears it:**
- the teacher taps the Absent chip in Blitz or a Check for understanding mode ("Here now")
- the teacher opens that student (Select student, or the student page) and enters anything (a check-in, note or result); show a small "Marked present" toast
- a new day

Nothing else clears it: other modes don't silently overwrite it.

**Late arrivals:** tapping an Absent chip offers **"Here now"** or **"Arrived late"**. "Arrived late" also saves a minor note on the student.

**Tests:**
- Absent in Blitz carries to a later yes/no grid and cold call that same day, and "All others: Yes" skips them.
- Entering a check-in for the student clears it.
- It resets the next day.
- Absent in one class doesn't affect a different class.

## Tests
- Whole class: everyone starts as Yes; tapping marks Not yet; long-press marks Sort of; absent students are skipped; it saves per student.
- Select a student: saves as a manual cold call and counts in the fairness ranking.
- Tickets: results save per student and feed the content signal; entry tickets use the previous lesson's intention.
- Close lesson offers "Run an exit ticket?" when none was done.
- The lesson's understanding score shows in the timeline and the class graph.

## Brief
Follow CLAUDE.md. In "How to test", include: load demo data, open a lesson, then run each mode once (whole class, cold call, select a student, an exit ticket shown with Present), close the lesson, and check the timeline and graph.
