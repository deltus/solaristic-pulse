Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 8: serious incidents, follow-ups, Close day and Brain dump (secondary teachers). Branch `round8` from the latest main. Read docs/HANDOVER.md first and only open the files this prompt points to. Before adding database versions or Supabase migrations, check the highest numbers on every open round* branch and use one above them all.

---

## Part A: Follow-ups and serious incidents

### A1. "Follow up urgently" replaces "Follow up next time"
- On the issue screen, an issue always gets a normal follow-up next lesson automatically, so remove the "Follow up next time" tick box.
- Add a **"Follow up urgently"** tick box (off by default). Ticking it:
  - creates a Follow-up task (A3) due at the end of today
  - shows the student at the top of tomorrow's queue
- Add a **"Serious incident"** button on the issue screen, and on the student page. It opens A2.

### A2. Lodging a serious incident
One screen, and fast. Most fields are pre-filled.

- **Already filled in:** student, class, lesson (with its learning intention), date and time. All can be edited.
- **What happened:** the issue areas and sub-options already ticked, plus a text box. Hint: "Stick to what you saw and heard: who, what, when, where. Avoid opinions."
- **Where:** classroom by default, editable.
- **Others involved:** student chips, with the same "With who?" picker as peer interactions. Optional.
- **Witnesses:** optional text.
- **Action taken:** quick chips (removed from class, sent to coordinator, first aid, separated students, called leadership) plus text.
- **Context, compiled automatically and shown read-only, with an "Include in report" tick box for each item:**
  - this student's issues, notes and follow-ups in this class over the last 4 weeks, as a short timeline
  - ICP marker (adjustment titles only if the teacher ticks them)
  - recent homework and assessment progress concerns, if relevant
  - the seat and table from the active seating plan, if round 7 has merged
- **Wellbeing notes** are **unticked by default**, with the warning: "Sensitive. Only include if relevant and your school's process allows."
- **Safety banner at the top of this screen, always visible:** "If a child is at risk of harm, or has disclosed abuse, follow your school's child safety and mandatory reporting procedures now. Don't wait to finish this form." Put the wording in config so schools can change it.

### A3. Follow-up tasks and reminders (new table `followUps`)
When an incident is saved, offer these tasks with one tap each. All are ticked by default; the teacher can untick any:

1. **Lodge school incident report** (e.g. in Compass or the school's own system)
2. **Contact home**
3. **Inform school staff** (year level coordinator, wellbeing or leadership; the teacher picks a role)

**Each task has:**
- a due time: chips for **In 1 hour**, **End of day**, **Tomorrow morning**, **In 2 days**, or custom
- a reminder notification at that time (reuse the existing reminders and notifications code)
- status: to do, done or not needed, with "when done" and an optional note

**Where tasks show:**
- on Home as **"Follow-ups"**, with an end-of-day summary card ("3 follow-ups still open today"). This matters most for primary teachers.
- on the student page
- on the class page

### A4. Report pack and email drafts
- **"Report pack"** shows everything ticked in A2 as a clean, factual document with headings, date, time, class and teacher. Options:
  - **Copy all**, to paste into Compass or another school system
  - **Share / Save as PDF**, using the existing export or share code
- **Email drafts.** The teacher sends these from their own email; the app never sends anything itself. Each opens a `mailto:` link, or copies the text if mailto isn't available.
  - **To home:** polite, factual and short. Covers what happened, what the school did, and an offer to talk. **No** other students' names, **no** wellbeing notes, **no** ICP details, and **no** past-incident timeline unless the teacher adds it. The teacher fills in the parent's email; don't store it.
  - **To school staff:** the facts plus the ticked context timeline.
  - Put the templates in src/config/emails.ts with clear placeholders, so they're easy to edit. The wording should be calm and professional, in Australian English.
- **Marking done:** tasks can be marked done straight from the draft ("Sent? Mark done").

### A5. Privacy
- **Encryption:** incidents, follow-up tasks and report packs are sensitive. Encrypt them when synced and leave them out of de-identified exports.
- **Relief teachers** can lodge an incident (it goes to the class teacher's review), but they can't see past incidents.
- **Deleting:** deleting a student also deletes their incidents. Add a line to docs/PRODUCT_SPEC.md: the school's own system is the official record, and Radar keeps only a teacher's working copy.

---

## Part B: Close day (end-of-day wrap-up across all of today's classes)

A **"Close day"** button on Home, which also appears as a prompt after the last lesson of the day is closed (or from 3 pm). It's a short guided flow; each step can be skipped.

1. **Open lessons:** any lesson not closed yet today, each with one tap to its Close lesson screen.
2. **Today's events:** issues, incidents and urgent follow-ups across all classes, grouped by class, with "Anything to add?" (opens the issue screen for any student).
3. **Reports:** serious incidents not yet marked "lodged", each with **Copy report** (A4) and **Mark lodged**.
4. **Follow-ups:** today's open tasks: **Done**, **Not needed** or **Move to tomorrow**.
5. **Comms:** email drafts still to send (home and staff), one tap each, with "Sent? Mark done".
6. **Brain dump** (Part C).
7. **Reflection:** "How was today?" (Good / OK / Tough) plus an optional note, then one gentle insight from My teaching if there's one. Finish with "Day closed. Nice work." and a count of what was done.

Save a `dayClose` record (date, reflection, counts). Show "Day not closed" on Home the next morning, with a one-tap "Close yesterday".

## Part C: Brain dump

A big free-text box, available from Home (a "Brain dump" button), from Close day, and from each class page. It works with phone keyboard dictation; no in-app speech recognition is needed.

**Finding names (on the device only; no AI or internet):**
- After the teacher taps **Sort**, Radar finds student names by matching first, preferred and last names against the teacher's rosters.
- If two students share a name, ask which one, showing their class.
- It splits the text into sentences or short chunks, each linked to the student(s) it mentions.

**Turning chunks into records:** each chunk gets one-tap chips:
- **Note** (adds a student note)
- **Follow-up** (adds a follow-up task with a due-time chip)
- **Contact home** (adds a follow-up task plus an email draft)
- **Wellbeing flag** (adds a Wellbeing record and its note)
- **Positive** (adds a note tagged "positive")
- **Skip**

**Leftovers and storage:**
- Chunks with no student, or skipped ones, are saved as a dated teacher journal entry (linked to the class if started from a class page).
- The original text is kept with the day's record, then deleted after 30 days. Keep the 30 days in config.
- Brain dump text is sensitive: encrypt it when synced, and never include it in de-identified exports.

## Tests
- **Follow-up checkbox:** "Follow up urgently" creates an end-of-day task and puts the student top of tomorrow's queue; plain issues still get a normal follow-up.
- **Incident context:** it compiles the last 4 weeks for this student and class only; Wellbeing notes are unticked by default; ICP details only appear if ticked.
- **Home email draft:** contains no other students' names, wellbeing notes or ICP details (check the generated text).
- **Reminders:** fire at the chosen times; tasks show on Home, the student page and the class page; the end-of-day summary counts open tasks.
- **Close day:** lists open lessons, today's events, unlodged reports, open follow-ups and unsent drafts across all classes; "Move to tomorrow" reschedules the task; "Day not closed" shows the next morning.
- **Brain dump:** finds roster names (first, preferred and last), asks when a name is ambiguous, creates the right record for each chip, saves leftovers to the journal, and deletes the original text after 30 days.
- **De-identified exports:** never include incidents or follow-ups.

## Brief
Follow CLAUDE.md. In "How to test", include:
1. Load demo data and lodge a serious incident for a demo student.
2. Set the contact-home reminder to "In 1 hour", then use +1 day to see it in the follow-ups.
3. Open the email drafts and check the home draft has no sensitive details.
4. Do a brain dump mentioning three demo students, sort it, then run Close day from start to finish.
