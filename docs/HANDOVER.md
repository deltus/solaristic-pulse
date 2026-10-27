# Handover

**Current branch:** round5 (pushed, not merged). Rounds are stacked: round0 → round3 (3 + 3b) → round4 → round5 → round6, each branched from the one before. Nothing is merged into main.

**Done:**
- round0: preview links (docs/briefs/round0.md). Preview safety in src/preview.ts.
- round3 (+3b): check-in lists, Wellbeing, minor items, DB v10, inline notes, daily target, swipe fly-off, cold call roll (src/ui/Roll.tsx).
- round4: shared class setup, import buttons, ICP forms + import, year level in exports, journal, Assessment check, DB v11.
- round5: brain breaks (src/config/brainBreaks.ts, src/logic/brainBreaks.ts, src/ui/screens/BrainBreak.tsx, src/ui/BrainBreakSettings.tsx), DB v12. Brief: docs/briefs/round5.md.

**Next:** docs/prompts/round6.md (relief pass) on a new `round6` branch made from `round5`. If the encryption design doesn't fit, build what's safe, then stop and explain options in the brief. Wellbeing must never be shown to relief teachers.

**Unsure / needs Azeem:**
- Previews only publish after adding the `round*` rule to Settings → Environments → github-pages (steps in docs/briefs/round0.md).
- Brain breaks are all unvetted (⬜).
- Choices listed under "Not done / unsure" in each brief.
