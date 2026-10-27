# Handover

**Current branch:** round4 (pushed, not merged). Rounds are stacked: round0 → round3 (3 + 3b) → round4 → round5 → round6, each branched from the one before. Nothing is merged into main.

**Done:**
- round0: preview links (docs/briefs/round0.md). Preview safety in src/preview.ts.
- round3 (+3b): final check-in lists, Wellbeing, minor items, DB v10, inline notes, daily target, swipe fly-off, cold call roll (src/ui/Roll.tsx).
- round4: shared class setup (src/ui/ClassSetup.tsx), import buttons, ICP forms + import (src/ui/IcpForms.tsx, src/config/icp.ts), year level in exports, journal (src/ui/Journal.tsx, src/logic/journal.ts), Assessment check (src/ui/screens/Assessment.tsx, src/logic/assessments.ts), DB v11. Brief: docs/briefs/round4.md.

**Next:** docs/prompts/round5.md on a new `round5` branch made from `round4`. Load every brain break in docs/brain-breaks.md (⬜ counts as included); each must be hideable in Settings. Reuse src/ui/Roll.tsx.

**Unsure / needs Azeem:**
- Previews only publish after adding the `round*` rule to Settings → Environments → github-pages (steps in docs/briefs/round0.md).
- Choices listed under "Not done / unsure" in each brief.
