# Handover

**Live (main):** rounds 0, 3, 3b and 4, merged 27/10/2026. Previews work (GitHub `round*` rule added): https://deltus.github.io/solaristic-pulse/preview/

**Next: redo Round 5 (brain breaks), branch `round5`.** Azeem's feedback on the preview:
- The brain break lists are weak. Rewrite them (docs/brain-breaks.md and the config in src/config/) with better, classroom-tested activities.
- If a subject has no brain break of its own, don't ask the teacher to pick from other subjects. Assign a random general one they can run on the spot, in as few taps as possible.
- Subject-specific breaks: make the instructions explicit (step by step, what the teacher says/does), and put any resource (link, video, printable) right there as a tap-to-open link, so everything is in one place.
- round5 was built on round4, so it already has everything that's live. Merge main into round5 first (main has 2 small doc commits), then rework it.

**After that: finish Round 6 (relief passes), branch `round6`, option A, in progress.**
- Done: supabase/migrations/20261027000000_relief_passes.sql (NOT yet run in Supabase), src/relief/server.ts, owner.ts, device.ts, src/ui/ReliefApp.tsx, relief mode in src/main.tsx, Relief tab Send sheet, relief tweaks in Checkin and CloseLesson.
- Left: tests with a fake ReliefServer, docs/briefs/round6.md (click-by-click Supabase steps), the relief tables in docs/SUPABASE.md, a BUILD_STATUS line, a browser check, push. Relief teachers must not see Wellbeing (from round 3b).
- Rebase/merge onto the reworked round5 when that's done.

**After round 6: Round 7 (seating plan assistant), branch `round7`.** Prompt: docs/prompts/round7-seating.md. Agreed with Azeem on 29/10/2026:
- Relationships (works well / keep apart). Peer interactions in check-ins can record "With who?"; keep-aparts are suggested after 2 incidents and the teacher confirms.
- Being left out never separates students. It suggests seating them with someone they work well with.
- No built-in gender field. Teacher-made balance tags (e.g. A/B, EAL, new) with "don't leave anyone alone", stored encrypted.
- "Nobody sits alone" is a strong preference. It can be broken with a warning, then the student gets a "How are they going at Table 3?" check-in question for 3 lessons; "Not settled" flags a seat review.
- "Support right now" (needs more support / on track / ready for extension): off by default, per class, reviewed each term, teacher-only, encrypted, never on the projector, print or relief.

**Then Round 8 (serious incidents, follow-ups, Close day, Brain dump), branch `round8`.** Prompt: docs/prompts/round8-incidents.md.
**Then Round 9 (Check for understanding), branch `round9`.** Prompt: docs/prompts/round9-cfu.md.
**Parked (don't build):** the primary version, capability snapshots and the report builder. See docs/BACKLOG.md. Secondary comes first.

**Round 7 adjustments (seating), from the 31/10 call with Thomas.** Do these on the round7 branch before it merges:
- **Guided room setup:**
  1. "Tap the wall with the whiteboard"
  2. "Tap the wall with the door" (and where along it)
  3. "Tap the wall(s) with windows"
  4. Then a 10×10 grid: tap cells to place desks. Desks touching in a row form one table; an empty cell between them is a walkway. Tables can face each other (two rows back to back, like the 6-tables-of-4 "3 above, 3 below" layout).
- **Ready-made templates, each editable:** rows of 3, separate desks, groups of 4, groups of 6, and U-shape. "Pick a template, then Edit" is the main path.
- **Saved classrooms, named by the teacher** (e.g. "Block C 12", "Block A 3"). A class can switch room, and the plan re-flows automatically, keeping locked seats where possible.
- **Present view:** a "Present" button opens a clean full-screen window for the projector (names only, the board at the top). On a computer it opens in a new browser window. From a phone, show "Open on your computer: [URL]" if sync is on; otherwise say "Open Radar on the classroom computer and tap Present". There's no direct casting. The same Present view will be reused later for tickets and brain breaks (a big title plus an optional countdown).

**Priorities (Thomas, 31/10):** data security first (student, teacher, transfer and storage), then reports. Report writing is what teachers most want help with, so the report builder in docs/BACKLOG.md moves up to Round 10, after Round 9.

**Small fixes to fold in:** on the previews list page, the "updated" times are local time but labelled UTC (.github/workflows/pages.yml).

**Unsure / to check on a phone:** swipe fly-off and cold-call roll motion; vibration (Android only); Word journal export opened in Word; Android notifications.
