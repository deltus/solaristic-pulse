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

## Adjustments
### 1. Previous button, and name → Profile (Azeem, 31/10)
- **← Previous: [name]** on every screen where you swipe through students one at a time: daily check-in, homework check, exit/entry ticket, assessment check and cold call.
  - It brings back the last student you answered and removes what was saved for them, so you can swipe again with the right answer. Tap it again to keep going back.
  - It also appears on the "all done" screen and the "target reached" card, so you can fix the last student after finishing.
  - Going back on a "Not here" or "Absent" also clears the absence.
  - It remembers the students from your current visit to that screen. If you leave and come back, it starts fresh. To fix someone earlier, open them through Select student.
  - The 5-second Undo in the message at the bottom still works as before.
- **Your name in the side menu** (under Solaristic Radar) now opens **Settings → Profile** and closes the menu.

**How to test**
1. Open a lesson and start the **Daily check-in**. Swipe one student All good and the next **Not here**.
2. Tap **← Previous** under the buttons. The "Not here" student is back. Tap it again and the first student is back. Check their "Already logged this lesson" line is gone.
3. Try the same in **Homework check** (including **Absent**), an **exit ticket** and **Cold call** (after "Answered well", tap Previous on the Pick a student screen).
4. Open the side menu and tap your name at the top. Profile should open.

**Not done / unsure**
- Previous only goes back through students you answered on this visit, not ones from before you left the screen.
- If an ICP question was answered right after a check-in, going back removes the check-in but not the ICP answer.

### 2. New Check for understanding modes (agreed with Thomas, 31/10)
**What changed**
- **The menu** now has four modes, in this order, each with its own icon and colour:
  1. **Whole class** (green): replaces both the thumbs check and the yes/no grid.
  2. **Cold call assistant** (blue): the roll, as before.
  3. **Select a student** (burgundy): new.
  4. **Entry or exit ticket** (amber): reworked.
- **Whole class:** ask "Is everyone happy with this?". **Everyone starts as Yes**, so you only tap the few who aren't.
  - Tap a name for **Not yet** (tap again for Yes).
  - Press and hold for **Sort of**.
  - **A** marks a student absent. Anyone absent earlier today starts greyed out with an Absent chip and isn't counted.
  - **Save** in one tap, saved per student. "Not yet" counts as a content signal, like a ticket "Not yet".
- **Select a student:** a search box and a grid of names. Tap a name and you get the same card and swipes as cold call. It's saved as a cold call marked "manual", so the fair pick in Cold call assistant knows that student has had a turn. Students absent today are greyed but can still be picked; recording a result marks them present.
- **Tickets:**
  - **Up to 3 questions.** The first is the suggested one; tap **Add a question** for more.
  - **Save for this class** under a question keeps it, and saved questions show as chips to tap next time. The × removes one. Each class has its own list.
  - **Countdown:** None, 1, 2, 3 or 5 minutes.
  - **Show it** now uses the round 7 **Present** page: big text and the countdown. On a phone it fills the screen, and **Close** brings you straight back to recording. On a computer it opens a new window to drag onto the board, while recording carries on in the first window. **Show it again** is under the swipe card.
- **Understanding score** now comes only from Whole class and ticket results (the thumbs counts are gone).
- **Suggested question** reads better for intentions starting "Label…" or "Name…".
- **No new database version.** Saved questions are stored on the class (encrypted when synced), so round 9 stays on **v16** and needs no Supabase script.

**How to test**
1. Load demo data, open a class and open a lesson with a learning intention.
2. Tap **Check for understanding**. Check the 4 modes, the order and the colours.
3. **Whole class:** everyone shows Yes. Tap one name (Not yet) and press and hold another (Sort of). Tap **Save** and check the message counts.
4. **Cold call assistant:** pick a student, swipe right.
5. **Select a student:** search for a name, tap it, swipe right. Then open **Cold call assistant** and pick a few times: that student shouldn't come up before the others have had a turn.
6. **Exit ticket:** add a second question, tap **Save for this class** under it, choose **2 min**, then tap **Show it**. Check the big page and the countdown, then tap **Close**. You should be straight on the swipe cards; swipe a few.
7. Open the ticket again: your saved question shows as a chip. Tap it to use it, and tap × to remove it.
8. **Close the lesson**, then check the timeline (student page) and the class graph (Manage class).

**Not done / unsure**
- Old thumbs checks made on the preview before today no longer count toward the score. (Nothing is live, so this only affects test data.)
- On a computer, if you open **Show it** and then leave the ticket without recording anyone, the ticket is dropped, and the board window will say "This ticket was removed".
- If you leave the board page on a phone without tapping Close (e.g. the back button), the ticket stays saved with no answers. It then counts as "exit ticket done" for Close lesson.
- Press-and-hold and the Present page still need checking on a real phone.
