Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 4 changes to Solaristic Radar (the Pulse repo): setup, ICP and journal fixes from Thomas's first round of notes. Work on a new branch called `round4`, starting from main after round 3 has been merged. Don't push to main until I say so.

Before changing anything, read the files named below and tell me in plain English what you'll change. I have limited coding experience, so explain as you go. Use fictional data only. Keep all existing tests passing, add tests for new logic, and add a line to docs/BUILD_STATUS.md.

## 1. Adding another class works like the first (src/ui/Setup.tsx, src/ui/screens/Classes.tsx)
The first-time setup lets you type student names or import a CSV/XLSX. Adding a second (or later) class should offer exactly the same options. Reuse the setup step rather than building a second version: class name, subject, year level, then "Type names" or "Import a file".

## 2. Import button names (src/ui/screens/Classes.tsx)
- On the Classes page, rename "Import roster (CSV/XLSX)" to **"Import all classes (CSV/XLSX)"**, because it imports every class at once.
- Inside a class, rename "Import roster" to **"Import students"**. It should only add students to that class.
- Update the Tour text to match.

## 3. ICP adjustments: faster to add (src/ui/screens/Icp.tsx, src/logic/icp.ts, src/logic/importers.ts)
- **Add several at once:** the "add adjustment" form lets you add several lines for one student before saving (an "Add another" button), plus a list of common adjustments to tick, e.g. extra time, seated near the front, chunked instructions, movement breaks, reader or scribe, reduced workload, visual supports, check-ins for understanding. Put the common list in a config file so it's easy to edit.
- **Flag when creating:** a "Flag this student" tick box on the add form, unticked by default.
- **CSV/XLSX import of ICP adjustments:**
  - Columns: student ID or name, class (optional), adjustment, notes (optional).
  - Show a preview with matches and problems (unknown student, duplicate adjustment) before saving, like the roster import.
  - Provide a downloadable template file.

## 4. Add ICP from the student page (src/ui/screens/Students.tsx)
Add an **"Add ICP adjustment"** button on each student's profile. It opens the same add form (from section 3) with the student already filled in.

## 5. Year level in exports (src/exporting.ts, src/sqlExport.ts)
- **Columns:** add a Year level column wherever a student or class appears in the Excel and CSV exports.
- **File names:** include the year level, e.g. "8B Science (Yr 8) – class report.xlsx".
- **SQL export:** make sure year level is in the classes table.
- **De-identified exports:** keep year level; it's not identifying on its own.

## 6. Teacher journal (class review)
A private journal for each class, for the teacher's own development and mentoring. It's separate from student records.

- **Where:** a "Journal" tab on the class page (under Manage class), plus all entries across classes on the existing "My teaching" page.
- **Entry:**
  - A date (defaults to today) and an optional link to a lesson (defaults to the current or most recent lesson).
  - Free text.
  - Tags: behaviour management, lesson design, engagement, differentiation, assessment, relationships, mentor feedback, plus custom tags.
  - An optional AITSL standard tag (1–7, with a short label for each).
- **Quick add from Close lesson:** a "Write a journal entry" link that opens a new entry linked to that lesson and pre-fills the close-lesson note.
- **Private:**
  - Never included in class or student reports, de-identified exports or sharing.
  - Has its own export: "Journal (Word or PDF)" by date range and class, for mentor meetings and portfolio evidence. Use whichever export library is already in the project. If none fits, an Excel or plain .txt file is fine; tell me which you chose.
- **Sync:** sync the journal across the teacher's own devices like notes (encrypted), but never into anything shared.

## 7. Assessment check (like Homework check)
For long tasks such as research assignments and fieldwork reports.

- **Setting up a task:** under Manage class → Assessments, add a task with a name (e.g. "Fieldwork report"), optional due date, and optional checkpoints (e.g. "Research done", "Draft", "Final").
- **The button:** while a class has an active assessment, an **Assessment check** button appears on the class page. It's the same size as the other buttons; Brain break stays full-width below the grid.
- **Checking:** the same swipe flow as Homework check, going through the whole class in roster order.
  - **Swipe right = On track.** Swipe left = Behind, with optional reasons: not started, missing research, needs help with content, absent, other. Swipe up = Skip.
  - The card shows the task name, days until due, and the student's last result for this task.
- **What it feeds:**
  - **Coping with work → assessment progress:** "Behind" counts as an assessment progress concern in the ranking (same weight as a homework not done).
  - **Class page:** a small summary bar, e.g. "Fieldwork report: 18 on track · 5 behind · 2 not checked".
  - **Student page:** the student's history for each task.
  - **Reports:** included in the class and student exports, with year level.
- **Finishing:** after the due date, the task moves to "Past assessments" and the button disappears, unless the teacher extends it.

## Tests
- Assessment check: on track and behind save correctly; "behind" counts in the ranking; the class summary counts are correct; the button only shows while a task is active.
- A second class can be set up by typing names and by import.
- Import students inside a class only adds to that class.
- Several ICP adjustments are saved in one go; the flag tick box flags the student.
- ICP CSV import: matches, unknown students and duplicates are shown in the preview.
- Exports contain year level, and file names include it.
- Journal entries are saved, linked to a lesson, left out of reports and de-identified exports, and included in the journal export.

## When you're done
Push the branch, check the preview and write the brief as CLAUDE.md says. Then wait for "merge".
