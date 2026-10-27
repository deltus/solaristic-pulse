# Handover

**Current branch:** round6 (pushed, not merged). Rounds are stacked: round0 → round3 → round4 → round5 → round6. Nothing is merged into main.

**Round 6, option A (server pass, key in link) — IN PROGRESS, not finished:**
- Done: supabase/migrations/20261027000000_relief_passes.sql (NOT yet run in Supabase); src/relief/server.ts (server calls), src/relief/owner.ts (send/cancel/use log/import entries), src/relief/device.ts (relief session in its own DB, claim, push, expiry cleanup), src/ui/ReliefApp.tsx (relief teacher's app), src/main.tsx (opens relief mode from ?relief=…#rk=…), Relief tab Send sheet (QR/link/email), relief tweaks in Checkin and CloseLesson, relief lessons excluded from openLessonFor/lessonsToClose. Existing 156 tests pass; typecheck passes.
- Left to do: tests for owner/device with a fake ReliefServer (import/apply rules, push, tick/expiry, claim refusals); update docs/briefs/round6.md (option A built, click-by-click Supabase steps: SQL Editor → New query → paste the migration → Run; then test with two browser profiles via `npm run dev` + .env.local); add relief tables to docs/SUPABASE.md; BUILD_STATUS line; browser check; push.
- Untested against a real Supabase. Review the SQL before running it.

**Needs Azeem:** GitHub `round*` rule for previews (docs/briefs/round0.md); vet brain breaks; say "merge" per round.
