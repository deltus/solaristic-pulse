# Round 0: preview links

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round0/
(All previews: https://deltus.github.io/solaristic-pulse/preview/)

**One-off GitHub setting needed before any preview appears** (GitHub currently only lets `main` publish the site):
1. On a computer, open https://github.com/deltus/solaristic-pulse/settings/environments
2. Tap **github-pages**.
3. Under **Deployment branches and tags**, tap **Add deployment branch or tag rule**.
4. Leave "Ref type" as **Branch**, type `round*` in "Name pattern", tap **Add rule**.
5. Open https://github.com/deltus/solaristic-pulse/actions, tap the latest **Test and publish** run on a round branch, then **Re-run all jobs**. After about 5 minutes the links work.

## What changed
- Pushing main or any `round…` branch now publishes one combined site: the live app at the root, each round under `preview/<branch>/`.
- The pushed branch's tests must pass, otherwise nothing is published and the site stays as it was.
- `preview/` has a list page with every preview and when it was last updated.
- Previews use their own database (`solaristic-pulse-preview-<branch>`); the live name `solaristic-pulse` is unchanged.
- Previews have no service worker, no sign-in and no sync, and the live app's service worker now ignores `/preview/` pages.
- Previews keep their own "+1 day" test clock and other browser settings, so they can't change the live app's.
- A pink "PREVIEW · <branch> · not the live app · test data only" banner with a **Load demo data** button sits on every screen.
- Settings → Delete all data in a preview only clears that preview's data.

## How to test
1. Open the live app https://deltus.github.io/solaristic-pulse/ and add a class called "Test live".
2. In the same browser, open the round0 preview link. Check the pink banner shows.
3. Tap **Load demo data** → OK. Demo classes appear.
4. Tap **+1 day** in the preview.
5. Go back to the live app and reload. "Test live" is still there, no demo classes appeared, and the date has not moved.
6. In the preview: Settings → Delete all data → type DELETE. Then open the live app again: "Test live" is still there.
7. Delete the "Test live" class from the live app.

## Not done / unsure
- I could not check the published link: GitHub blocks round branches from publishing until the setting above is added (I didn't change repository security settings myself). Checked instead on a local copy of the preview: separate database, no service worker, banner and demo button all work.
- The live service worker rule only reaches phones once round0 is merged into main. Until then the workflow adds the same rule when it builds main, so live pages it publishes already have it.
- Branches without the round0 changes (e.g. `round3` before round3b) are listed on the previews page but not published, so they can't use live data.
- Every push rebuilds main and every preview (a few minutes each). Fine for a handful of round branches; delete old round branches once merged.
- Done without your OK on the plan, as you asked.
