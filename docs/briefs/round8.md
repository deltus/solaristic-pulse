# Round 8: Serious incidents, follow-ups, Close day and Brain dump

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round8/
(Branched from round7, so it includes rounds 5, 6 and 7 and the latest main. Part A came first; Close day and Brain dump are in the Adjustments section below.)

## What changed (Part A)
- **Issue screen:**
  - "Follow up next time" is gone, because every issue now gets a normal follow-up next lesson automatically.
  - New **"Follow up urgently"** tick box. It makes a task due at the end of today and puts the student at the top of the next day's queue, marked "Urgent follow-up". Undo removes the task too.
  - New **Serious incident** button. It saves the check-in and opens the incident screen with the areas and note carried over.
- **Serious incident screen:**
  - **Safety banner** at the top that stays while you scroll. Its wording is in `src/config/incidents.ts`.
  - Already filled in: student, class, lesson and learning intention, date, time and "Classroom". All editable.
  - Fields for what happened, others involved (name chips), witnesses, and action taken (chips plus a text box). There's also a **Serious incident** button on the student page.
- **Context (tick what goes in the report):** this student's issues, notes and follow-ups in this class over the last 4 weeks, plus the ICP marker, homework and assessment concerns, and their seat.
  - **Wellbeing items start unticked**, with the "Sensitive…" warning.
  - ICP adjustment titles are a separate line, also unticked.
- **Follow-ups after saving:** Lodge school incident report, Contact home, and Inform school staff (pick a role), all ticked. Each has due chips (In 1 hour, End of day, Tomorrow morning, In 2 days, Custom) and a **reminder notification** at that time. The notification says "Contact home", never the student's name, because it can show on a lock screen.
- **Report pack:** a clean, factual page with **Copy all**, **Share**, **Save to print or PDF**, and a **Lodged in the school's system** tick.
- **Email drafts:** to home and to staff, opened in your own email app (Radar never sends anything). The home draft:
  - swaps other students' names for "another student"
  - never includes wellbeing notes, ICP details or past incidents
  - doesn't save the parent's email address.
  - **Sent? Mark done** closes the task. The templates are in `src/config/emails.ts`.
- **Where follow-ups show:** a **Follow-ups** card on Home with "3 follow-ups still open today", plus the student page and the class page. Each task has Done, Not needed and Reopen.
- **Relief teachers** can lodge an incident. It reaches you in "Relief entries to review". They never see past incidents or the context.
- **Privacy:** incidents and tasks are encrypted when synced, never in any export, and deleted along with the student. PRODUCT_SPEC now says the school's system is the official record.
- Database **v15**, one above every open branch. New Supabase script `20261031000000_relief_incidents.sql`, one above the newest; it lets relief teachers' incidents through.

## How to test (Part A)
1. Open the link → **Load demo data** → open **8B Humanities** → **Open lesson** → **Skip**.
2. **Daily check-in** → swipe a student to **Issue**. Check "Follow up next time" is gone and **Follow up urgently** is there. Tick it, pick an area, Save.
3. Tap **+1 day** (top bar) → Daily check-in: that student is first, with "Urgent follow-up".
4. **Lodge an incident:** on a card, Issue → **Serious incident**. Check the red banner stays at the top. Type something that mentions another student by first name, tap **Removed from class**, and check the Wellbeing line in Context is unticked. Tap **Save incident**.
5. Set **Contact home** to **In 1 hour** → **Add follow-ups**. On the report pack, check **Copy all**, and that the **To home** draft has "another student" instead of the other name and no wellbeing or ICP details.
6. Go to **Today** (Home): the **Follow-ups** card shows "3 follow-ups still open today". Tap **+1 day**: they show as Overdue. Tap ✓ on one.
7. Open the student's page: **Incidents and follow-ups** lists the incident (Not lodged) and its tasks.

## Supabase steps (after "merge", once Round 6's script is in)
Run `supabase/migrations/20261031000000_relief_incidents.sql` the same way as Round 6's: GitHub → supabase → migrations → the file → **Copy raw file** → Supabase → **SQL Editor** → **+ New query** → paste → **Run** → "Success. No rows returned". Nothing else changes, and syncing the new records needs no script.

## Not done / unsure (Part A)
- **Reminders in the browser** only fire while Radar is open, as with lesson reminders. The Android app schedules them properly.
- Email drafts use `mailto:`. Long drafts may be cut short by some email apps, so **Copy** is there as a backup.
- "End of day" is 5 pm (`END_OF_DAY` in config). If it's already later, it becomes an hour from now.
- The home email's name check uses the class list. It also catches surnames and preferred names, but not nicknames the roster doesn't know.

## Adjustments (31/10/2026: Part B Close day and Part C Brain dump)
**What changed**
- **Close day** (button on Home): 7 short steps, each skippable:
  1. Open lessons, with one tap to Close lesson.
  2. Today's issues, incidents and urgent follow-ups, grouped by class, with "Anything to add?".
  3. Reports not yet lodged: **Copy report** and **Mark lodged**.
  4. Today's follow-ups: Done, Not needed or **Tomorrow**.
  5. Emails still to send.
  6. Brain dump.
  7. **How was today?** (Good, OK or Tough), an optional note, and one insight from My teaching if there is one. It ends with "Day closed. Nice work."
- **When it's offered:** Home shows **Ready to close the day?** from 3 pm, or once the day's last timetabled lesson is closed. The next morning shows **Day not closed** with **Close yesterday**.
- **Brain dump** (Home, the class page and Close day): a big text box that works with keyboard dictation. **Sort** finds students by first, preferred or last name, on the phone only, with no AI or internet.
  - If a name fits two students, it asks "Which William?" and shows each one's class.
  - Started from a class page, it prefers that class.
  - Only capitalised words count, so "will" or "grace" in a sentence never match.
- **Each chunk gets one-tap chips:** Note, Follow-up (with a due time), Contact home (a task with an email draft), Wellbeing flag (a Wellbeing record with the note), Positive (a note tagged "positive") or Skip.
- **Leftovers:** chunks with no student, skipped ones and ones without a choice go into **one journal entry** tagged "Brain dump".
- **The original text is deleted after 30 days.** That's `BRAIN_DUMP_KEEP_DAYS` in `src/config/incidents.ts`, checked each time the app opens. It's encrypted when synced and never exported.
- 7 more tests, 214 in total, all passing.

**How to test (Parts B and C)**
1. Home → **Brain dump**. Type (or dictate) three sentences, each naming a demo student by first name, plus one with no name, such as "Photocopy worksheets." Tap **Sort**.
2. Choose **Positive** for one, **Wellbeing flag** for one and **Contact home** for one. Save: "Brain dump sorted: 3 records, 1 to the journal".
3. Try "William forgot his book": it asks **Which William?** (Will Scott, 10A, or Bill Harris, 7B).
4. Home → **Close day**. Step through it: your open lesson, today's events (the Wellbeing flag shows), the incident from Part A under Reports (**Mark lodged**), follow-ups (**Tomorrow** moves one), and the Contact home draft under Emails. Then choose **Good** → **Close day**.
5. Tap **+1 day**: no "Day not closed" notice, because you closed it. Open a lesson that day without closing the day, then tap **+1 day** again: Home shows **Day not closed** with **Close yesterday**.

**Not done / unsure**
- The final count ("N things sorted") covers follow-ups closed today, reports lodged and Brain dump records. It doesn't count lessons you closed from step 1.
- A Brain dump Wellbeing flag is saved as its own check-in, so it shows in the timeline and Close day. It doesn't replace a real check-in from that lesson.
- Name matching is simple, with no spelling tolerance: "Aarav" matches, "Arav" doesn't. Nicknames the roster doesn't have aren't found.

## Adjustments 2 (31/10/2026)

- **Follow-ups moved below the classes on the Today screen.** Your classes come first; the Follow-ups card is at the bottom. The Close day prompt, Brain dump and Close day buttons stay at the top.

**How to test:** open the preview → Today. If you have any open follow-ups, scroll past the class cards: the Follow-ups card is there. (Demo data has none; log an incident with a follow-up to see one.)
