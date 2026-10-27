# Handover

**Current branch:** round6 (pushed, not merged). This branch has the latest HANDOVER. Rounds are stacked: round0 → round3 (3 + 3b) → round4 → round5 → round6, each branched from the one before, so round6 contains everything. **Nothing is merged into main.**

**Done:**
- round0: preview links (docs/briefs/round0.md). Preview safety in src/preview.ts.
- round3 (+3b): check-in lists, Wellbeing, minor items, DB v10, inline notes, daily target, swipe fly-off, cold call roll (src/ui/Roll.tsx).
- round4: shared class setup, import buttons, ICP forms + import, year level in exports, journal, Assessment check, DB v11.
- round5: brain breaks (all 24, unvetted ⬜), DB v12.
- round6 (part): relief pass form, list/cancel, rules, privacy-filtered sealed bundle and preview, relief entry review; DB v13 (src/logic/relief.ts, src/ui/Relief.tsx).

**Stopped / needs Azeem:**
1. **Round 6 decision:** pick option A, B or C in docs/briefs/round6.md (how a relief teacher's device gets the class and sends entries back). Nothing server-side has been built or changed.
2. **Previews:** they only publish after adding the `round*` rule to GitHub Settings → Environments → github-pages (steps in docs/briefs/round0.md). Then re-run the latest "Test and publish" action.
3. Test each preview, then say "merge" per round (CLAUDE.md). Later rounds include the earlier ones.
4. Vet the brain breaks (all ⬜) and the "(check link)" games.

**Next:** after the round 6 option is chosen, continue on `round6` (docs/prompts/round6.md sections 2–5).
