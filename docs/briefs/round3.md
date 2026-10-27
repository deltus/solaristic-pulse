# Round 3: feedback from testing with Thomas (3 + 3b)

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round3/
(Needs the one-off GitHub setting in docs/briefs/round0.md. This branch includes round0.)

## What changed
**Round 3 (first part, commit 3d22004)**
- Class page has six equal buttons, adding ICP with a due badge; Homework check always shows.
- Check-in card shows flag and ICP markers, and "Meets x of last 10" with trend arrows.
- Swipes start anywhere on the card; quick flicks count.
- ICP evidence sheet reused for check-in evidence.
- Uneven focus dial; class and student graphs, Classes search, consistent button sizes.

**Round 3b (this part)**
- Final lists: Behaviour, Attention (off task, not listening, low effort or output) and Coping (pace, content, workload, assessment progress), each with its question as a one-line hint.
- Minor items under Behaviour (gum, uniform): saved and shown as "Minor: gum", but not an issue and not in the ranking. Student page shows "Uniform 3× this term".
- New Wellbeing tick box (flag only): recorded only when ticked, counts in the ranking, safety line, "Wellbeing flagged 2× recently" on the card, left out of de-identified exports.
- Older records moved to the new lists (database v10). In the demo data, 15 of 102 detail records moved: 6 "distracted" → off task, 3 "low productivity" → low effort, 6 coping items (4 withdrawn, 2 dysregulated) → Wellbeing; 5 check-ins got a Wellbeing flag and 4 of them went back to Coping "meets".
- No more "Anything else?" screen. The issue screen has Add a note, Include evidence, Follow up next time, and hold an option for half a second to give it its own note. One-time tip explains the hold.
- Daily target per lesson (default 5; Settings and per class): "3 of 5 today", Done for now, a "Nice work!" card at the target, small messages every 5 more (can be turned off), and "That's the whole class" at the end.
- Swipes save instantly; the card flies off with a tilt and a green/amber/grey flash, the next card fades in, light vibration on Android. "Swipe animations" setting, and reduced motion gets a quick fade. Same for Homework check and Cold call.
- Cold call uses a slot-reel roll that lands on the already-picked student (tap anywhere to jump to the end). Reusable for brain breaks.

## How to test
1. Open the link on your phone, tap **Load demo data**.
2. Open a class → **Open lesson** → **Daily check-in**. Check "0 of 5 today" and **Done for now** at the top.
3. Swipe right on a few students: the card flies off green and the next fades in. Swipe fast twice: both save.
4. Tap **Issue**: the tip "hold an issue to add a note" shows once. Tap **Behaviour**, then hold **Disruptive** for half a second: a note box opens. Type something, tap **Done**, swipe right to save.
5. Next student → Issue → tick only **Gum** under Behaviour → Save. Open that student's page: timeline shows "All good · Minor: gum".
6. Next student → Issue → tick **Wellbeing** → **Withdrawn**. The safety line shows. Save. Their card later shows "Wellbeing flagged 1× recently".
7. Keep going to 5: the "Nice work!" card appears. Tap **Keep going**; at 10 a small message appears.
8. Settings → turn off **Swipe animations**: swipes now fade quickly. Turn off **Extra encouragement messages**.
9. Class → **Cold call** → **Pick a student**: names roll and land. Pick again and tap during the roll: it jumps to the student.
10. Tap **+1 day** and check the follow-up box for the student with the held note ("Disruptive: …").

## Not done / unsure
- Done without your OK on the plan, as you asked. Choices I made:
  - Minor items always show as small chips under Behaviour (no need to tap Behaviour first).
  - A Wellbeing tick with no other area still makes the check-in an "Issue" and turns on follow-up.
  - When a check-in's coping details all moved to Wellbeing, Coping went back to "meets" and the note moved to Wellbeing.
  - "This term" means the last 10 weeks (no term dates in the app yet).
  - Per-issue notes show in the follow-up box and are encrypted when synced, but aren't in the lesson-by-lesson export column (it isn't name-scrubbed).
- The detail chips' ids (e.g. "withdrawn") are synced unencrypted like other details; only the notes are encrypted.
- De-identified exports still show that a check-in was an "Issue" even if the only issue was Wellbeing (the details and notes are removed).
- The fly-off and roll motion were checked in code and in a browser with reduced motion on; please eyeball the motion on a phone.
- Capacitor Haptics isn't installed, so vibration uses the browser's vibrate (Android only).
- Relief teachers (round 6) must not see Wellbeing: not built yet.
