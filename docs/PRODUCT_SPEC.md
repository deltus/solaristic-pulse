# Solaristic Radar — Product Specification (agreed behaviour)

Offline-first classroom memory for individual teachers. The teacher is asked about about five students per class per day, records quick observations, and the app follows up, spots patterns and makes sure nobody is forgotten.

## Agreed decisions (Oct 2026)
- **Daily target:** 5 check-ins **per class taught that day** (configurable globally and per class).
- **Timetable-driven:** when a lesson is on, Today switches to that class and shows a lesson banner with its ICP adjustments; reminders are built from the timetable.
- **ICP** = *Individual Curriculum Plan*.
- **Locale:** Australian English, DD/MM/YYYY dates, Monday-first weeks.
- **Platform:** Android first (APK via Capacitor); the same build runs as an installable PWA. iOS deferred (needs a Mac); iPhone can use the PWA without scheduled notifications.
- **PIN lock** (deterrent, not encryption). **Dictation** via the phone keyboard's microphone (no in-app speech service).
- **Branding:** cream/navy/blue palette from Solaristic Insights; logo blue `#07226F` dominant; burgundy `#7A1F3D` as a small premium accent (labels, rules, flag/ICP markers, PIN screen). Difficulty states use amber tones, never red/burgundy.

## Core workflow
1. **Today** — class chips (today's timetable first), lesson banner, progress panel, the next student with reasons for selection, quick-response buttons for each due question, ICP adjustments due for that student, Absent / Skip / Next, Check More Students, Choose a student, today's queue, Needs follow-up, Overdue for attention.
2. Every tap saves immediately (one observation per question per check-in; tapping another option corrects it). When all questions are answered the app auto-advances after ~2 s (cancellable; can be turned off).
3. **Absent / Skipped** are recorded on the check-in, never as observations, and never count as difficulty. A daily slot freed by absence/skip is back-filled.

## Response scale
`As expected (0)`, `Some difficulty (1)`, `Significant difficulty (2)`, `Not observed / unsure (not rated)`. Custom questions map each option to one of these levels.

## Contextual follow-ups
- Per question (so independently for Focus, Homework, Behaviour and each custom question).
- Open when the **latest rated** observation for that question was a difficulty. Shows the previous observation (response, context, note, first-noted date) and asks *Improved / resolved · About the same · Worsened · Not enough information*.
- Recorded level: improved → previous − 1 (gradual), same → previous, worsened → 2, not enough info → not rated (follow-up stays open). History is never overwritten.

## Selection algorithm (transparent, bounded, deterministic)
`weight = clamp(1.0 + factors, 0.5, 3.0)`; `score = weight × (days since last check-in + 1)`.
Factors: teacher flag +0.75; teacher adjustment −0.5…+1; open follow-ups +0.25 each (max 2); recurring difficulty (≥2 in same category in 28 days) +0.2 per extra, max +0.6 per category; reported improvement −0.15 each (max −0.3); several check-ins in last 7 days −0.2 per extra (max −0.6).
**Coverage safeguard:** anyone at or beyond the coverage limit (default 14 days) is placed first. Never-checked students count as at the limit. Ties broken by a per-day hash. A single difficulty never counts as a pattern. Reset clears the flag and manual adjustment.

## Trends
Per category over 6 weeks; ≥4 rated observations needed. Earlier half vs recent half average; shift ≥0.4 → improving / more difficulty, else stable. UI labels **Interpretation** vs **Observed** facts (counts, recurring contexts). No diagnoses or labels.

## ICP Check-In
Adjustments per student (title, details, frequency: every lesson / daily / weekly / fortnightly, start/end, active). Outcomes: Implemented / Partly / Not implemented / Not applicable, with notes. Due/overdue logic per frequency; overdue reminders in-app. Before/after comparison of observations (6 weeks before vs since start) using associative language only.

## Reports
Class or individual; XLSX (all sheets) or CSV (observations); date range, classes, categories, include notes, include ICP; de-identify (stable `Student 001…` pseudonyms, IDs removed, names/teacher/school scrubbed from notes, optional class pseudonyms) with an explicit warning. Download, share sheet, or email draft (mailto; the app never sends email).

## Privacy
Local IndexedDB only; no network calls; not encrypted (stated in-app); privacy notice + policy warning at onboarding; backup/restore (JSON), per-record archive/delete, delete-all. Demo data is fictional.
