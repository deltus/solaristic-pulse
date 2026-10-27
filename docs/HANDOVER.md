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

**Small fixes to fold in:** on the previews list page, the "updated" times are local time but labelled UTC (.github/workflows/pages.yml).

**Unsure / to check on a phone:** swipe fly-off and cold-call roll motion; vibration (Android only); Word journal export opened in Word; Android notifications.
