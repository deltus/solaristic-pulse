# Round 4: setup, ICP, exports, journal and Assessment check

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round4/
(Needs the one-off GitHub setting in docs/briefs/round0.md. Includes round0 and round3.)

## What changed
- **New class** now uses the same steps as first-time setup: name, subject, year level, then type names or import a file.
- Classes page button is now **Import all classes (CSV/XLSX)**; inside a class it's **Import students**, which only ever adds to that class. Tour text updated.
- Class edit form has a **Check-in target per lesson** box (from round 3b).
- **ICP**: add several adjustments at once (tick common ones + type your own with **Add another**), with a **Flag this student** tick box (off by default). The common list is in `src/config/icp.ts`.
- **ICP import** from CSV/XLSX (ICP page → Import): preview shows ready rows, unknown or ambiguous students and duplicates; **Download template** button.
- **Add ICP adjustment** button on each student's page.
- **Year level** column next to every Class column in Excel/CSV exports (kept when de-identified), and in file names, e.g. "8B Science (Yr 8) – class report 2026-10-27.xlsx".
- **Teacher journal**: Manage class → **Journal** tab, all classes on **My teaching**, and **Write a journal entry** on Close lesson (linked to that lesson, note pre-filled). Tags, custom tags and an AITSL standard. Its own **Journal (Word)** export. Synced between your devices with the text encrypted; never in reports or shared exports.
- **Assessment check**: Manage class → **Assessments** to set a task (due date, checkpoints). While active, an **Assessment check** button and a summary bar ("7 on track · 3 behind · 2 not checked") show on the class page. Swipe right On track, left Behind (optional reasons), up Skip. "Behind" counts in the ranking like homework not done. Shows on the student page and in reports. After the due date it moves to Past assessments; change the due date to extend.

## How to test
1. Open the link, tap **Load demo data**.
2. **Classes → New class**: fill in name, subject, year level → Continue → type two names → Add. Then make another class and use **Import a file** instead.
3. Open a class → **Import students** with a file that has a Class column: everyone still lands in this class.
4. **ICP Check-In → Adjustment**: pick a student, tick two common ones, type one more, tap **Add another**, tick **Flag this student**, Save. The student is flagged and has three adjustments.
5. **ICP → Import → Download template**, fill it in (or use it as is, after renaming students to demo names), import: check the preview shows problems before saving.
6. A student's page → **Add ICP adjustment**: the student is already filled in.
7. **Reports**: export a class. The Summary sheet has **Year level** next to Class; the file name includes "(Yr 7)".
8. 7B English → open lesson: the **Assessment check** button and the "Persuasive essay" bar show. Swipe a few students; swipe left on one and tick reasons.
9. Manage class → **Assessments** → open Persuasive essay → set the due date to yesterday → Save: the button disappears and it's under Past assessments. Set it to next week again to extend.
10. Manage class → **Journal** → New entry → Save. **Journal (Word)** → Export: opens in Word/Google Docs.
11. Close the lesson → **Write a journal entry**: the lesson is linked and your note is pre-filled.
12. **My teaching**: all journal entries across classes.

## Not done / unsure
- Done without your OK on the plan, as you asked. Choices I made:
  - Journal export is a **Word (.docx)** file built with the zip library already in the app (no new library). Kept simple: dates as headings, then text, tags and standard.
  - "Manage class" got three tabs (Class / Journal / Assessments) rather than buttons.
  - With checkpoints, the teacher picks the checkpoint at the top of Assessment check; it's saved with each result.
  - "Behind" doesn't create a Coping record; it adds to the ranking (same weight as homework not done) and shows "Behind on an assessment" as the reason.
  - The flag reason defaults to "New ICP adjustments" (editable).
  - File names now use spaces and an en dash (e.g. "7B English (Yr 7) – class report 2026-10-27"). The old names were like "solaristic-radar_class-report_…".
- Brain break isn't built yet (round 5), so the class page grid has 7 buttons for now.
- I tested the Word export file structure in a test, but haven't opened it in Word on a phone.
- The journal is in personal backups (like everything else) because a backup is for restoring your own data.
