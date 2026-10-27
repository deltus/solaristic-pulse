# Solaristic Radar (Pulse repo): how we work

Claude Code reads this file at the start of every chat. Follow it for every change.

## Who I am
I'm Azeem. I have very limited coding experience. Explain what you're doing in plain English, keep summaries short, and tell me exactly what to tap or type when I need to do something. Thomas is my co-founder; he tests on his phone and gives feedback.

## The app
Solaristic Radar (repo name solaristic-pulse) is a phone-first classroom app for teachers: swipe check-ins, homework checks, cold calls, Blitz, ICP, lessons that open and close, and reflection. Key docs: docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, docs/BUILD_STATUS.md. Editable lists and settings live in src/config/.

## How every round works
1. **Branch.** Each round gets its own branch named after it (e.g. `round4`), made from the latest main. Never commit straight to main.
2. **Build.** Do the work in the round's prompt (in docs/prompts/). Before writing code, give me a short plan (5–10 lines) and wait for my OK.
3. **Test.** `npm test` must pass. Add tests for new logic. Use fictional data only.
4. **Preview.** Push the branch. That publishes a preview at `https://deltus.github.io/solaristic-pulse/preview/<branch>/`, separate from the live app (its own database, no sign-in or sync, and a "PREVIEW" banner). Wait for the GitHub Action to finish and check the link loads.
5. **Brief.** Write `docs/briefs/<branch>.md` and commit it to the branch, with these sections:
   - **Preview link**
   - **What changed** (plain English, one line each)
   - **How to test** (numbered steps on a phone, including "+1 day" where useful)
   - **Not done / unsure** (anything skipped, guessed or worth a second look)

   Then reply to me with the link and the "What changed" list.
6. **Adjust.** If I ask for changes, make them on the same branch, push again (the preview updates), and add an "Adjustments" section to the brief.
7. **Merge only when I say "merge".** Then merge the branch into main and push (this updates the live app), update docs/BUILD_STATUS.md, and tell me it's live.

## Keeping chats small (to save usage)
- After every merge, write docs/HANDOVER.md, commit it, and tell me: "Ready for a fresh chat: type /clear and paste the start prompt." HANDOVER.md should be under one page: current branch and state, what the last round changed, anything unfinished or uncertain, and the next prompt in docs/prompts/.
- Also do this mid-round if the chat has become long (lots of files read, many back-and-forths, or you notice you're re-reading things), and say why.
- At the start of a chat, read docs/HANDOVER.md and the prompt for the round, and only open the files they point to. Don't re-read the whole codebase.

## Safety rules
- Never push to main without my "merge".
- Previews must never touch live data. Keep the database name, service worker and sync separate (see round 0).
- Student data stays out of the repo. Demo and test data are fictional.
- Wellbeing notes, coping notes, the teacher journal and ICP text are sensitive: keep them encrypted when synced, and out of de-identified exports.
