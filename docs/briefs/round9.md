# Round 9: Check for understanding, and absent for the rest of the day

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round9/
(Branched from round8, so it includes rounds 5, 6, 7 and 8 and the latest main. Round 9 needs those rounds, so it can only go live after them.)

## What changed
- **New tile:** the class page's **Cold call** tile is now **Check for understanding**. Tapping it opens a small menu with four modes. The one you used last is at the top, marked "Last used".
- **Learning intention** shows at the top of every mode when the lesson has one.
- **Cold call:** works as before. Two changes: students marked absent today are left out of the roll, and a new **Not here** link marks the student absent for the rest of the day.
- **Thumbs check:** three big counters, 👍 got it, 👊 sort of and 👎 not yet. Tap to add one, press and hold to take one off. A % bar shows the split. It saves counts only, with no names.
- **Whole class yes/no:** a list of every student.
  - Tap a name once for **Yes**, twice for **Not yet**, and a third time to clear it.
  - **A** marks a student absent.
  - **All others: Yes** fills in everyone you haven't marked, skipping anyone absent. Then tap **Save**.
- **Exit or entry ticket:**
  - **Set up:** pick **Exit** or **Entry**. The question box is pre-filled, e.g. "In one sentence, what did we learn about how plants make food?". Exit uses today's intention; entry uses last lesson's. You can edit it.
  - **Show it:** the question in big text for the projector.
  - **Record answers:** swipe through the class. Right = **Got it**, left = **Not yet** (optional chips: Misconception, Incomplete, Absent), up = **Partly**. Undo works for 5 seconds.
- **Close lesson** asks **"Run an exit ticket?"** if none was done. The ticket then takes you back to Close lesson.
- **Where results go:**
  - **Per student:** "Not yet" on yes/no or tickets and "struggled" cold calls count as content signals. With 2 or more in 2 weeks, the issue screen's Coping → **Content** option shows a blue "Suggested: …" line. They also count toward the seating "needs more support" suggestion.
  - **Student page:** the lesson-by-lesson timeline shows results, e.g. "Exit ticket: not yet (misconception)".
  - **Per lesson:** an understanding score (% got it). It comes from yes/no and ticket results, or from the thumbs check if those are the only result.
    - **Class page** (Manage class): a new graph, "Check for understanding · % got it per lesson".
    - **My teaching:** each recent lesson shows its score. There's a new pattern: "Lessons where you got through the plan averaged X% on exit tickets, vs Y% when you didn't."
  - **Thumbs checks** never affect individual students.
- **Absent for the rest of the day:**
  - **What marks it:** "Absent" in Blitz, any check-for-understanding mode or Homework check (which has a new **Absent** link), or "Not here" in the daily check-in.
  - **Where it carries:** for the rest of that day in that class, those students:
    - start as **Absent** (greyed, with an Absent chip) in Blitz, the yes/no grid and tickets
    - are left out of the daily check-in queue and the cold call roll
    - show as Absent in Homework check.
  - **What clears it:**
    - Tap the Absent chip, then **Here now** or **Arrived late** ("Arrived late" also saves a minor note).
    - Enter anything for that student: a check-in from Select student, a note on the student page, or a result. You'll see **"Marked present"**.
    - The next day.
- **Database v16**, one above every open branch. It adds three tables, all synced: check results, per-student results and absences. The ticket question is encrypted. No Supabase script is needed.
- **Demo data** now has fictional exit tickets on most past lessons, so the graph and the My teaching pattern have something to show.

## How to test
1. Open the preview link on your phone and tap **Load demo data**.
2. Tap a class (e.g. 9C Science), then **Open lesson**, type a learning intention (e.g. "Explain how plants make food") and tap Continue.
3. Tap **Blitz**, pick **Uniform**, tap **A** next to one student, then **Mark everyone Yes** and **Save blitz**. Remember who you marked absent.
4. Back on the class page, tap **Check for understanding**. Check that you see 4 options, then pick **Whole class yes/no**.
   - The intention is at the top, and your absent student is greyed with an **Absent** chip.
   - Tap one name once (Yes), another twice (Not yet), then **All others: Yes**. The absent student stays absent. Tap **Save**.
5. Open **Check for understanding** again. **Whole class yes/no** should now be first ("Last used"). Pick **Thumbs check**.
   - Tap 👍 a few times, 👊 twice and 👎 once. Press and hold 👍 to take one off. Check that the % bar moves, then tap **Save**.
6. Open **Cold call** from the menu and tap **Pick a student** several times. Your absent student should never come up. Try **Not here** on one card.
7. Open **Daily check-in**. Neither absent student should be in the queue.
8. Go back to the class page and tap **Close lesson**. You should see **"Run an exit ticket?"**. Tap **Run one**.
   - Check the suggested question, tap **Show it** (big projector view), then **Record answers**.
   - Swipe a few right (Got it) and one left (Not yet, tick Misconception, Save), and swipe one up (Partly).
   - Under "Absent today", tap your absent student's chip, then **Here now**. They join the queue.
   - Finish everyone, then tap **Back to Close lesson**. The exit ticket offer is gone. Close the lesson.
9. Tap **Manage class** (or the class in Classes). Find the **Check for understanding** graph; today's lesson is the last point.
10. Open **My teaching** from the menu. Recent lessons show "understanding X%", and under Patterns there's the "got through the plan … exit tickets" line.
11. Open the student who got "Not yet" from Students. **Lesson by lesson** shows "Exit ticket: not yet (misconception)" and "Check: not yet".
12. **Marked present:** open a new lesson in another class and mark a student **Not here** in the check-in. Then use **Select student**: they show an **Absent** chip. Open them and swipe All good. You should see "… · Marked present".
13. **+1 day:** tap **+1 day** at the top, open a new lesson in the same class, and run Cold call or the yes/no grid. Nobody is absent any more.

## Not done / unsure
- **Relief teachers** still see the plain Cold call tile (their class page is separate), and their absences aren't sent back. Worth a later round if wanted.
- **Close lesson → Run an exit ticket:** anything you'd already set on the Close screen (the dial, answers) isn't kept when you leave to run the ticket. That's why the offer is at the top, before you start filling it in.
- **Entry tickets** count toward the score of the lesson they're run in, not the previous lesson they're about. Tell me if you'd rather they count for the previous lesson.
- **Lesson score:** if a lesson has both a yes/no grid and a ticket, they're pooled into one %. Thumbs only count when there are no per-student results.
- **"Here now"** also removes that day's "Not here" check-in for the student, so they come back into the daily check-in queue.
- **The suggested question** drops instruction words at the start of the intention ("Explain…", "We are learning to…"). The list is in `src/config/cfu.ts`, so check a few of your real intentions read well.
- **Not in exports yet:** check-for-understanding results aren't in the CSV or report exports.
- **Still to check on a phone:** the long-press on thumbs, swiping on tickets, and the projector view on a real projector.
