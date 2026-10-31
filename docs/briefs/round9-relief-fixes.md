# Brief: relief-fixes

## Preview link
https://deltus.github.io/solaristic-pulse/preview/relief-fixes/

## What changed
- A relief teacher can now close a lesson. Before, the Close lesson button did nothing because the app still wanted the two teacher questions that relief teachers never see.
- The flag next to a flagged student in the relief student list is now small (the same size as elsewhere), not huge.
- New test: a relief teacher can close a lesson without the teacher questions. Your own lessons still need both answers.

## How to test
Relief passes don't work in previews (no sign-in), so the lesson-closing fix can only be tested on the live app after merge.

**In the preview (flag size):**
1. Open the preview link on your phone and load the demo data.
2. Open a class that has a flagged student (Jack O'Connor in the demo) → Manage class → Relief pass → look at the pass's student list (the relief teacher's view).
3. The flagged student should show a small burgundy flag next to their name.

**On the live app after merge (closing a lesson):**
1. Make a relief pass for today for one class, with the relief teacher's email set.
2. On a second phone, open the pass link and sign in with that email.
3. Tap Open lesson, then Close lesson.
4. Set the attention dial (or tap Skip), then tap Close lesson. It should say "closed" and go back to the class page.
5. On your phone, within a minute or two, the lesson should show as closed.

## Not done / unsure
- I couldn't test closing on a real relief pass, because previews have no sign-in. The automated test covers the saving step that was failing.
