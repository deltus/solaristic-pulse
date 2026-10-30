# Build status

_Last updated: 27/10/2026 — rounds 0, 3, 3b and 4 merged into main (live). Rounds 5 and 6 still on their branches._

## Stages
| Stage | Status |
|---|---|
| 1. Layout, navigation, classes, students, local storage, PIN, onboarding, demo data | ✅ Done |
| 2. Daily rotation, observations, priority weights, contextual follow-ups | ✅ Done |
| 3. Trends, coverage safeguards, custom questions | ✅ Done |
| 4. ICP tracking, reports, XLSX/CSV export, de-identification | ✅ Done |
| 5. Timetable import, reminders, offline PWA, backup/restore/delete | ✅ Done |
| 7. Calm cards redesign: one question per screen, swipe-out sidebar (permanent on desktop), teacher name on sign-in, skippable guided tour (replay in Settings) | ✅ Done |
| 8. Draw weight upgrades: weight stored on every check-in and plan entry, significant difficulty counts double, starting priority (form + roster `Priority` column), weight badges on rosters, weight columns in exports | ✅ Done |
| 9. First-time setup: sign in (name, email), 5-card guide, first class, paste/import students, lesson days and times, optional PIN, then the in-app tour | ✅ Done |
| 10. Check-in navigation: Back (previous question, then previous student), Skip moved top-right, Absent bottom-right | ✅ Done |
| 11. Styled XLSX exports (ExcelJS): navy header row, outlined cells, banded rows, frozen header, filters; ICP data on its own tabs | ✅ Done |
| 12. Notes: always-visible note button; difficulty answers pause for "What happened?"; follow-ups quote the note and ask "Did this happen again?" (No, all good closes it) | ✅ Done |
| 13. Saved files: confirmation sheet (Open / Share), Android notification that opens the file, Recent files (Reports and Settings → Data); sample roster/timetable fixed (bundled CSVs) | ✅ Done — Android file opening untested on a device |
| 14. Reminders: setup step, Today card (when a timetable exists), permission/blocked/exact-alarm handling; tapping a lesson reminder opens that class | ✅ Done — notifications untested on a device |
| 15. Light motion (question slides, answer tick, sheets, toasts), off with the OS reduce-motion setting | ✅ Done |
| 16. Questions: Prepared for class, Effort, Behaviour, Coping with work; two answers + "Didn't see"; per-area note prompts/tags; last-5-answers table | ✅ Done |
| 17. ICP Check-In grouped by student; survey for 3+ adjustments | ✅ Done |
| 18. Home page "Your classes"; trend lines; class overview (stats, suggestions, class trends) | ✅ Done |
| 19. Blitz (whole-class Yes/No on a topic, feeds matching area, own export tab) | ✅ Done |
| 20. Outlook .ics timetable import; SQL exports (.sqlite database file and .sql script, optional de-identification) | ✅ Done |
| 21. Class focus check-out: one dial (0–100%, starts at 50%, last reading never shown), live working/distracted minutes, hold Save for a note; from "End lesson" on the check-in screen or a dismissible card on Your classes after a timetabled lesson; synced (note encrypted); Check-outs tab in class reports and `checkouts` in SQL exports | ✅ Done |
| 22. ICP evidence for learning support meetings: each adjustment is its own evidence type; "Do you want to add evidence?" the first time it's recorded, then monthly since the last evidence for it (after Yes or Partly, in daily check-ins and ICP Check-In; on by default, can be turned off per adjustment). Photo, file, note or voice memo; gallery on the student's ICP page, evidence pack ZIP; photos shrunk to 1600 px JPEG. **Stays on the device**: not synced, not in JSON backups; listed (not attached) in student reports | ✅ Done — camera and microphone untested on a device |
| 23. Swipe check-in (stage A): class page with Daily check-in / Homework check / Blitz / Select student; whole-class ranked queue (right = All good, left = Issue with areas and details, up = Skip, Not here, Undo, arrow keys); areas and sub-options, swipe direction and ranking weights in `src/config/checkin.ts`; observed/implied/migrated values; Homework records; positive streak "Exceeding"; ranking by recent concerns + lessons since last seen replaces draw weight; DB v7 migration (Effort → Attention, Prepared for class → historical Preparedness, old Effort difficulties get a migrated "low effort" detail) | ✅ Done — a "lesson" is one class on one day until stage B adds Lesson records |
| 24. Lessons (stage B): Lesson records (Open lesson + learning intention, Close lesson with attention dial, homework set, teacher check, "Remind me in 30 minutes"); "Close your lesson?" after 60 minutes and for lessons left open (banner; Android notification); everything saves the lesson id and "lessons since last seen" counts Lesson records; Homework check only after a lesson closed with homework set, with lesson-named history; Cold call (fair pick, shuffle, history, stats, "wasn't listening" → Attention); lesson-by-lesson timeline; "My teaching" reflection (5+ closed lessons; never exported); DB v8 turns older check-in days into historical lessons | ✅ Done — lesson notifications untested on a device |
| 25. Round 3 (testing with Thomas, branch `round3`): class page 6 equal buttons incl. ICP (filtered list + due badge) and always-visible Homework check ("Check anyway?"); check-in card with flag/ICP marker and per-area "Meets x of last 10" with trend; swipe from anywhere on the card and quick flicks count; new sub-options (coping list replaced, old coping labels kept for history); issue screen swipe right = done / left = cancel with pinned bar and "Add note / evidence"; "Include evidence?" on check-ins (device only); cold call tap-to-skip and animation setting; uneven focus dial (0/50/75/90/100, no preset needle, Skip); class success-rate and cold-call graphs; student cold calls over last 5 lessons; Classes search; consistent button sizes; DB v9 (coping tags, evidence on check-ins) | ✅ Done — not yet merged to main |
| 26. Round 3b (branch `round3`): final check-in lists with question hints; minor items (gum, uniform) saved but not issues; Wellbeing flag (only when ticked, in ranking, out of de-identified exports); DB v10 moves older sub-options; inline notes and per-option notes (hold), no "Anything else?" screen; daily target per lesson with stopping points; swipe fly-off with colour wash; cold call roll (src/ui/Roll.tsx) | ✅ Done — not yet merged to main |
| 27. Round 4 (branch `round4`): New class reuses the setup steps (type names or import); "Import all classes" / "Import students" (class only); ICP: several at once, common list (src/config/icp.ts), flag tick box, CSV/XLSX import with preview and template, Add ICP from the student page; year level column and file names in exports; teacher journal (class Journal tab, My teaching, Close lesson link, Word export, synced encrypted, never in reports); Assessment check (Manage class → Assessments, swipe On track / Behind, ranking, class bar, student history, reports); DB v11 | ✅ Done — not yet merged to main |
| 28. Round 7 (branch `round7`, local only): seating plan assistant. Relationships (works well / keep apart, "With who?" on Peer interactions, "Worked well with…" after All good, suggestions after 2 signals), seating needs with ICP suggestions, optional support levels (off by default, 10-week review), balance tags, room templates and editor, planner (`src/logic/seating.ts`: hard rules, weighted goals, nobody sits alone), swap warnings, locks, projector view and printable page (names only), seat watch in check-ins with Review seat, cold call by table, plan line on class graphs, My teaching insight; DB v14; 8B Humanities demo class | ✅ Built — not pushed or merged yet |
| 6. Android wrapper (Capacitor project, icons, native files/share/notifications) | ✅ APK builds: `npm run android:apk:win` → release/SolaristicRadar.apk |

## Test matrix (spec §13)
Automated: `npm test` → **50 tests passing** (tests/logic, tests/services, tests/exporting). Browser: production build served locally and driven in the built-in browser at 375 px and desktop width.

| # | Scenario | How verified |
|---|---|---|
| 1 | Two classes, switch between them | services test (no record mixing) + browser (created 11E Biology, switched chips; queues stayed separate) |
| 2 | Import a fictional roster | parser + import service tests (flexible headers, class creation, duplicates). UI file picker **not** driven in the browser (needs a manual file pick). Sample: `samples/demo-roster.csv` |
| 3 | Generate five daily check-ins | logic + services tests; browser |
| 4 | Observations in all three categories | services test; browser (taps saved, auto-advance) |
| 5 | Absent ≠ negative | logic + services tests; browser (absent recorded, slot back-filled) |
| 6 | Repeated difficulties → contextual follow-ups | logic tests; browser (previous note + prompt shown) |
| 7 | Improvement reduces follow-ups, no permanent exclusion | logic tests (gradual resolution; 30-day simulation) |
| 8 | Flag increases selection | logic test (40-day simulation: flagged checked ≥1.3× average, not every day) |
| 9 | Everyone eventually checked | logic test (26 students × 40 days, max gap ≤ 14 days) |
| 10 | Custom question in rotation | logic test (scope/frequency); browser (created, appeared only in its class) |
| 11 | ICP + student report | logic + export tests (sheets, before/after, associative wording) |
| 12 | Timetable import + reminders | parser + reminder-plan tests; browser (timetable-ordered chips, "Next lesson" banner). Notifications not observed on a device yet |
| 13 | Class & individual export | export tests read XLSX back; browser generated XLSX in-app |
| 14 | De-identification | export test scans every sheet for every student/teacher/school/class name; browser preview |
| 15 | Close & reopen persistence | services test (DB reopened); browser reload |
| 16 | Offline after install | browser: service worker active, **server stopped**, app reloaded, unlocked, saved a check-in and generated an XLSX. Not yet tried on a physical phone |
| 17 | Narrow & desktop screens | browser at 375 px (bottom nav, no horizontal scroll) and desktop (sidebar) |
| 18 | Backup, restore, deletion | services test (round-trip of all tables, delete-all, invalid file rejected) |

## Hosting
- Code: https://github.com/deltus/solaristic-pulse (public; contains no student data)
- Live web app: https://deltus.github.io/solaristic-pulse/ — published by .github/workflows/pages.yml after the tests pass
- Web version limits: notifications only while open; files go to browser Downloads; its data is separate from the APK.

## Remaining / deferred
- **Build and install the APK** (next step; see README "Android").
- Physical-device checks: notifications, file saving to Documents, share sheet, back button.
- iOS app (needs a Mac + Apple Developer account). iPhone works as a PWA without scheduled notifications.
- Not built: printable/PDF student report (XLSX only), password-encrypted backups, in-app speech recognition (keyboard dictation is used instead), end-to-end browser test suite (Playwright).

## Known issues / notes
- Android phones using gesture navigation reserve the very edge of the screen for Back; start the sidebar swipe slightly in from the edge, or tap the menu button.
- Mockups of the five UI directions: docs/mockups/ui-options.html.
- Web notifications only fire while the app is open; documented in-app.
- When a new web version is deployed, the PWA asks before updating (`confirm` dialog).
- ICP evidence lives only in this device's database. Clearing site data, uninstalling the app or "Delete all data" removes it; use the Evidence pack button to keep a copy.
- Students belong to one class. A student taught in two classes needs two entries.
- The built-in browser profile used for testing contains demo data plus a test class "11E Biology"; harmless, and it can be cleared in Settings → Data.

## Resume here
1. Install Android Studio → `npm run android:apk` → install `android/app/build/outputs/apk/debug/app-debug.apk` on a phone.
2. Device test pass (notifications, files, PIN after backgrounding).
3. Consider a release-signed APK (keystore) for wider distribution.
