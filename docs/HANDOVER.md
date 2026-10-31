# Handover (31/10/2026)

**Live (main):** rounds 0, 3, 3b and 4 (database v11). Previews: https://deltus.github.io/solaristic-pulse/preview/

**Nothing from rounds 5–9 is live.** Each branch is built on the one before:
- `round5`, then
- `round6` (5 merged in), then
- `round7` (5 and 6 merged in), then
- `round8` (from round7), then
- `round9` (from round8).

All are pushed with previews and briefs (docs/briefs/roundN.md).

| Branch | What | DB | Supabase script | Tests |
|---|---|---|---|---|
| round5 | Brain breaks | v12 | – | 148 |
| round6 | Relief passes | v13 | 20261027000000_relief_passes.sql | 169 |
| round7 | Seating | v14 | – | 196 |
| round8 | Incidents, follow-ups, Close day, Brain dump | v15 | 20261031000000_relief_incidents.sql | 214 |
| round9 | Check for understanding, absent for the rest of the day, Previous button, name → Profile | v16 | – | 233 |

## Plan agreed with Azeem (31/10)
1. **Now: Round 7 adjustments.** Prompt from Cowork: "Merge main into round7, then do docs/prompts/round7-adjustments.md. Show me a 5-line plan first and wait for my OK. Push for a preview when done." (The prompt file is on main, so merge main in first.) Stay on DB v14 unless a new table is unavoidable.
2. **Carry round7 up:** merge round7 into round8, then round8 into round9. Keep the DB numbers (v14, v15, v16). If HANDOVER.md conflicts, keep the newest one.
3. **Rework round9** to the updated docs/prompts/round9-cfu.md (changed on main 31/10, agreed with Thomas):
   - Thumbs check is replaced by **Whole class**: everyone starts as Yes; tap for Not yet, long-press for Sort of; saved per student, and Not yet is a content signal.
   - Add **Select a student**: a searchable grid, saved as a cold call with `manual: true`.
   - Tickets: up to 3 questions, saved questions to reuse per class, shown with round 7's **Present** page.
   - Each mode gets its own icon and colour.
   - Keep: cold call, absent for the rest of the day, the Previous button, results feeding signals/timeline/graph/My teaching, and Close lesson's "Run an exit ticket?".
   - The current round9 code: src/ui/screens/Cfu.tsx, src/logic/cfu.ts, src/config/cfu.ts and tests/round9.test.ts. The yes/no grid is the closest starting point for Whole class.
4. **Test once** on the round9 preview, which includes everything.
5. **Merge all together** (Azeem decided this is better than one at a time). Merge round9 into main and add a test that upgrading from v11 to v16 keeps data. Then Azeem runs the two Supabase scripts in order (round 6's, then round 8's), with click-by-click steps. Update BUILD_STATUS.md and this file.

**Merge order rule:** rounds go live in database-version order. If Azeem says "merge" out of order, stop and warn him.

## Unsure / to check on a phone
- swipe fly-off and cold-call roll motion
- vibration (Android only)
- Word journal export opened in Word
- Android notifications
- the seating plan's sideways scroll
- thumbs long-press and ticket swipes (round 9)
