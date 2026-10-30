# Handover

**Live (main):** rounds 0, 3, 3b and 4, merged 27/10/2026. Previews: https://deltus.github.io/solaristic-pulse/preview/

**Current branch: `round7` (seating plan assistant), pushed (preview: https://deltus.github.io/solaristic-pulse/preview/round7/), not merged.** Azeem wants the Supabase work done after rounds 5 and 6 roll out. Branched from main. Brief: docs/briefs/round7.md (includes a checklist for wiring relief passes when round 6 merges). 160 tests pass; build passes.
- New: src/config/seating.ts, src/logic/rooms.ts, src/logic/seating.ts (planner), src/logic/seatingData.ts (suggestions, support, seat watch), src/logic/seatingPrint.ts (projector/print, names only), src/ui/screens/Seating.tsx. DB v14 (relationships, rooms, seatingPlans), synced with sensitive fields encrypted (src/sync/fields.ts). Demo class 8B Humanities.

**Database versions across branches:** round5 = v12, round6 = v13, round7 = v14. Whichever round goes live after a higher version is already live must move its schema change above it (e.g. round 7 live first → round 5/6 changes become v15/v16).

**Merge order rule (Azeem, 31/10):** rounds go live in database-version order (5, then 6, then 7). If Azeem says "merge" out of order, stop and warn him, or renumber so the merged round has the highest version and test an upgrade from the live version.

**Still to do, in order:**
1. **Redo Round 5 (brain breaks), branch `round5`.** Azeem's feedback:
   - The lists are weak; rewrite them with better activities.
   - A subject with no brain break of its own gets a random general one, in as few taps as possible.
   - Subject-specific ones get step-by-step instructions, with the resource as a tap-to-open link.
   - Merge main into round5 first.
2. **Finish Round 6 (relief passes), branch `round6`.**
   - Left: tests with a fake ReliefServer, the brief with click-by-click Supabase steps, docs/SUPABASE.md, a BUILD_STATUS line, a browser check, push.
   - The Supabase migration hasn't been run yet; Azeem wants to do the Supabase steps after rounds 5 and 6.
   - Relief teachers must not see Wellbeing; seating wiring is in docs/briefs/round7.md.
3. **Then Round 7:** test the preview, adjust, merge.
4. **Then rounds 8 and 9** (docs/prompts/round8-incidents.md, round9-cfu.md). main has an extra Round 9 addition: merge main in again before starting Round 9.

**Also on main (added from another device, 31/10):** prompts for round 8 (incidents, follow-ups, Close day, Brain dump) and round 9 (Check for understanding), and docs/BACKLOG.md (parked primary ideas; don't build).

**Small fixes to fold in:** on the previews list page, the "updated" times are local time but labelled UTC (.github/workflows/pages.yml).

**Unsure / to check on a phone:** swipe fly-off and cold-call roll motion; vibration (Android only); Word journal export opened in Word; Android notifications; the seating plan's sideways scroll on a phone.
