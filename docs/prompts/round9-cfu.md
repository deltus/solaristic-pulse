Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 9: Check for understanding. Branch `round9` from the latest main. Read docs/HANDOVER.md first and only open the files this prompt points to. Before adding database versions or Supabase migrations, check the highest numbers on every open round* branch and use one above them all.

## Check for understanding (replaces the Cold call tile)

### 1. The tile
- Rename the class page's **Cold call** tile to **Check for understanding**. It opens a small menu with four options. The last-used one is remembered and listed first.
- Show the lesson's learning intention at the top of each mode, if one was entered.

### 2. Modes
1. **Cold call:** exactly as now (the roll, swipes and history).
2. **Thumbs check:** a whole-class count with no names. Three big counters: 👍 got it, 👊 sort of, 👎 not yet.
   - Tap to add, long-press to subtract. It shows a % bar.
   - Takes about 15 seconds; saved against the lesson.
3. **Whole class yes/no:** a Blitz-style grid of every student's name. Tap once for **Yes**, twice for **Not yet**, and leave untouched for not checked. Ends with "All others: Yes" or Save. It's per student and saved against the lesson.
4. **Exit or entry ticket:**
   - **Set up:** pick **Exit** (end of lesson) or **Entry** (start of lesson, about the previous lesson's intention). Type a question, or use the suggested one: "In one sentence, what did we learn about [learning intention]?"
   - **Show it:** the question appears in a big projector view. Students answer on paper or sticky notes.
   - **Record it:** swipe through the class. Right = **Got it**, left = **Not yet** (optional chips: misconception, incomplete, absent), up = **Partly**.
   - **Close lesson link:** the Close lesson screen offers "Run an exit ticket?" if none was done.

### 3. What the results feed
- **Per student:** "Not yet" on yes/no or tickets, and "struggled" on cold calls, count as **content** signals for:
  - the Coping with work → content suggestion
  - the "support right now" suggestion (round 7)
- **Per lesson:** a CFU score (% got it). It shows in the lesson timeline and the class graphs. My teaching gains an insight, e.g. "Lessons where you got through the plan averaged 82% on exit tickets, vs 61% when you didn't."
- **Thumbs checks** are whole-class only and don't affect individual students.

---

## Tests
- Thumbs check: saves counts only, with no student records.
- Yes/no grid: tap cycles through Yes, Not yet and unchecked; "All others: Yes" works.
- Tickets: results save per student and feed the content signal; entry tickets use the previous lesson's intention.
- Close lesson offers "Run an exit ticket?" when none was done.
- The lesson's understanding score shows in the timeline and the class graph.

## Brief
Follow CLAUDE.md. In "How to test", include: load demo data, open a lesson, then run each mode once (cold call, thumbs, yes/no, an exit ticket), close the lesson, and check the timeline and graph.
