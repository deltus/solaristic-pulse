Round 0: preview links for every branch. Do this before anything else. Work on a branch called `round0`.

CLAUDE.md, the round prompts (docs/prompts/) and docs/brain-breaks.md are already in the repo.

## Goal
Every branch I push (except main) should publish its own preview at:
`https://deltus.github.io/solaristic-pulse/preview/<branch>/`
The live app at `https://deltus.github.io/solaristic-pulse/` (built from main) must keep working exactly as now.

## 1. Publishing (.github/workflows/)
- Pages can only host one site per repo, so build a combined site: main at the root, plus each `round*` branch under `preview/<branch>/`.
- Trigger it on a push to main or any `round*` branch.
- Run the tests for the branch being pushed. If they fail, don't publish that branch, but leave everything else as it was.
- Pick the simplest approach that needs the fewest manual GitHub settings changes, e.g. one workflow that checks out main and every remote `round*` branch, builds each into the right folder, and deploys the combined `dist`.
- If I have to change anything in GitHub settings, give me exact click-by-click steps.

## 2. Preview builds must never touch live data (very important)
The previews and the live app are on the same website address (deltus.github.io), so a browser shares storage between them. In preview builds (e.g. `VITE_PREVIEW=<branch>`):
- **Separate database:** the IndexedDB name becomes `solaristic-pulse-preview-<branch>`. The live name `solaristic-pulse` stays the same.
- **No service worker:** turn off the PWA in previews. Also stop the live app's service worker from taking over `/preview/` pages (e.g. Workbox `navigateFallbackDenylist: [/\/preview\//]`).
- **No sign-in or sync:** build with empty Supabase settings.
- **Preview banner:** a bright banner at the top on every screen: "PREVIEW · <branch> · not the live app · test data only", with a "Load demo data" button.
- **Settings → Delete all data** in a preview only deletes that preview's database.

## 3. A list of previews
Publish `preview/index.html`, a simple page listing each preview branch with its link and last-updated time.

## Tests
- A unit test that the database name comes from the preview setting (live name unchanged when not a preview).
- Manual check: in the same browser, open the live app, add a test class, open the round0 preview, load demo data, then go back to the live app. The test class must still be there and nothing in live has changed. Write the steps in the brief.

## When done
Follow CLAUDE.md: push round0, check the preview link works, write docs/briefs/round0.md, and give me the link. Wait for "merge".
