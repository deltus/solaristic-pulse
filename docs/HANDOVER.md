# Handover

**Live (main):** rounds 0, 3, 3b and 4, merged 27/10/2026. Previews: https://deltus.github.io/solaristic-pulse/preview/

**Current branch: `round7` (seating, with rounds 5 and 6 merged in), pushed (preview: https://deltus.github.io/solaristic-pulse/preview/round7/), not merged.** Azeem wants the Supabase work done after rounds 5 and 6 roll out. Branched from main. Brief: docs/briefs/round7.md (includes a checklist for wiring relief passes when round 6 merges). 160 tests pass; build passes.
- New: src/config/seating.ts, src/logic/rooms.ts, src/logic/seating.ts (planner), src/logic/seatingData.ts (suggestions, support, seat watch), src/logic/seatingPrint.ts (projector/print, names only), src/ui/screens/Seating.tsx. DB v14 (relationships, rooms, seatingPlans), synced with sensitive fields encrypted (src/sync/fields.ts). Demo class 8B Humanities.

**Database versions across branches:** round5 = v12, round6 = v13, round7 = v14, round8 = v15, round9 = v16. Supabase: round6 20261027000000, round8 20261031000000. Whichever round goes live after a higher version is already live must move its schema change above it (e.g. round 7 live first → round 5/6 changes become v15/v16).

**Merge order rule (Azeem, 31/10):** rounds go live in database-version order (5, then 6, then 7). If Azeem says "merge" out of order, stop and warn him, or renumber so the merged round has the highest version and test an upgrade from the live version.

**Still to do, in order:**
1. **Round 5 (brain breaks), branch `round5`: rework pushed 31/10, waiting for Azeem to test.** Main merged in. New 37-break list (Any subject group as the one-tap fallback; numbered steps; site button in the "You'll need" box). Brief: docs/briefs/round5.md (Adjustments section). 148 tests pass. Preview checked: Maths class → Subject break → Any subject break. Still v12.
2. **Round 6 (relief passes), branch `round6`: finished and pushed 31/10, waiting for Azeem to test.** Round 5 merged in. Option A (server pass, key in link). 169 tests pass (two-device tests with a fake server in tests/relief-server.test.ts). Brief has click-by-click Supabase steps and a two-phone test for after merge. Supabase script 20261027000000_relief_passes.sql not yet run (Azeem does it after merge). Relief teachers must not see Wellbeing; seating wiring is in docs/briefs/round7.md.
3. **Round 7 (seating), branch `round7`: rounds 5 and 6 merged in, relief wiring done and pushed 31/10, waiting for Azeem to test.** DB v14, no Supabase script. 196 tests pass. Brief: docs/briefs/round7.md (Adjustments). Not done: "What they'll see" doesn't show the seating plan.
4. **Round 8 (incidents, follow-ups, Close day, Brain dump), branch `round8` (from round7 + main): built and pushed 31/10, waiting for Azeem to test.** DB v15. Supabase script 20261031000000_relief_incidents.sql (run after round 6's). 214 tests pass. Brief: docs/briefs/round8.md.
5. **Round 9 (Check for understanding + absent for the rest of the day), branch `round9` (from round8 + main): built and pushed 31/10, waiting for Azeem to test.** DB v16 (cfuChecks, cfuResults, absences), no Supabase script. 231 tests pass. Brief: docs/briefs/round9.md. Goes live after round 8.

**Also on main (added from another device, 31/10):** prompts for round 8 (incidents, follow-ups, Close day, Brain dump) and round 9 (Check for understanding), and docs/BACKLOG.md (parked primary ideas; don't build).

**Small fixes to fold in:** on the previews list page, the "updated" times are local time but labelled UTC (.github/workflows/pages.yml).

**Unsure / to check on a phone:** swipe fly-off and cold-call roll motion; vibration (Android only); Word journal export opened in Word; Android notifications; the seating plan's sideways scroll on a phone.
