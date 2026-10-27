Round 3b: finish round 3. Follow CLAUDE.md. Work on the existing `round3` branch (commit 3d22004 already has the first part of round 3). Pull it first, then add the changes below. Don't merge until I say so.

## Already on round3 (keep)
- Six class page buttons (with ICP), and Homework check always showing.
- Flag and ICP markers, and "Meets x of last 10" with trend arrows.
- Swipes from anywhere on the card, and swipe right to finish on the issue screen with Next pinned.
- Evidence via the ICP evidence sheet.
- Tap to skip the cold call shuffle, and the animation setting.
- The uneven focus dial.
- Class and student graphs, Classes search, and button sizes.

## 1. What we assess: final lists (src/config/checkin.ts, db.ts, migration)
Each area shows its question as a one-line hint under its name on the issue screen.

- **Behaviour**: "How are they acting towards others and the class?"
  - disruptive, disrespectful, technology misuse, not following instructions, peer interactions (conflict they're involved in)
  - **Minor (small chips under Behaviour): gum, uniform.** Keep this list in config so more can be added later.
    - Ticking only minor items saves them as a record but does **not** mark Behaviour as "needs support". It doesn't affect the Behaviour running average and doesn't count toward the ranking.
    - Show them in the student's timeline and reports as e.g. "Minor: gum".
    - The student page shows a count ("Uniform 3× this term") so patterns are still visible.
    - Ticking a minor item together with a real Behaviour option counts as a normal Behaviour issue.
- **Attention**: "Are they engaged in the learning?"
  - **off task** (absorbs "distracted"), not listening, **low effort or output** (absorbs "low productivity"; keep id `low_effort`)
- **Coping with work**: "Can they manage the demands of the work?"
  - pace, content, workload, **assessment progress** (behind on an assessment task or project). Optional note; no safety line.
  - One-line hints shown under each option the first few times: pace = "can't keep up with the lesson", content = "doesn't understand the material", workload = "too much on overall", assessment progress = "falling behind on the current task".
- **Wellbeing (new, flag only)**: "Are they OK in themselves?"
  - dysregulated, withdrawn, upset or distressed, tired or low energy, friendship issues (left out or struggling socially), seemed unwell, mentioned something outside school
  - A separate tick box below the three areas, **recorded only when ticked**. "All good" never records Wellbeing as fine. No running average; the card shows a discreet "Wellbeing flagged 2× recently" if flagged in the last 4 weeks.
  - Show the safety line when it's ticked: "If you're worried about this student's safety or wellbeing, follow your school's wellbeing process." Plus a light "a short note helps" hint.
  - It counts as a concern in the ranking (same as an issue).
  - Sensitive: notes encrypted when synced, left out of de-identified exports, and never shown to relief teachers later.

**Migrate saved records (new database version):**
- distracted → off_task
- low_productivity → low_effort
- coping/overwhelmed → coping/workload
- coping/dysregulated, withdrawn, upset, tired, unwell, outside → wellbeing (same sub-option)
- coping/peers → wellbeing/friendship issues
- Coping "needs support" records left with no coping sub-option stay as Coping.

Tell me how many records moved in the demo data.

## 2. Notes: inline and optional, no extra screen
- **Remove the "Anything else?" screen,** including for Wellbeing. Swipe right on the issue screen saves straight away, with "follow up next time" on.
- **On the issue screen:**
  - an "Add a note" tick box (off by default) that opens a text box in place
  - **holding a sub-option for 0.5 s** attaches a note to that one issue (reuse the hold-bar), with a small note icon once added
  - the "Include evidence?" toggle (off by default)
  - the "Follow up next time" tick box (on by default)
- **One-time tip** the first time the issue screen opens: "Tip: hold an issue to add a note to it." Never again after it's dismissed.

## 3. Daily target and clear stopping points
- **Target per lesson:** default 5, changeable in Settings and per class. Select-student check-ins count.
- **Top of the queue:** "3 of 5 today", plus an always-visible "Done for now" button.
- **At the target, a full card:** "Nice work! You've hit today's check-in target for [class]." Two equal buttons: **Finish for now** and **Keep going**.
- **If they keep going:** a smaller message every 5 more students. Settings switch "Extra encouragement messages" (on by default) hides these.
- **When everyone present has been seen:** "That's the whole class. All done for this lesson", with one button back.
- **Messages only appear between cards,** after the swipe animation, always in the same place, never mid-swipe. Keep the tone positive; no "you only did 3".

## 4. Satisfying swipe animation
- **Fly-off:** on release past the threshold, the card flies off in the swipe direction with about an 8° tilt and fades. About 250 ms, ease-out.
- **Colour wash and icon:** soft green with a tick for All good, soft amber with a flag for Issue, grey with an arrow for Skip.
- **Next card:** fades and scales in from 96% to 100% over about 150 ms.
- **Haptic:** a light tap on Android (Capacitor Haptics if installed, else `navigator.vibrate(10)`).
- **Never wait:** saves are instant; swiping during the animation finishes the old one immediately.
- **Under the threshold:** the card springs back to the centre.
- **Reduced motion** (`prefers-reduced-motion`) or a new "Swipe animations" setting set to off: a 100 ms cross-fade, keeping the colour and icon flash.
- **Same animation** for Homework check and Cold call swipes.

## 5. Cold call roll animation
- **Replace the shuffle with a roll:** names roll past like a prize wheel or slot reel, slow down and land on the already-chosen student. About 2 s, ease-out. Absent students excluded.
- **No tap:** the full roll plays.
- **Tap anywhere during the roll:** jumps straight to the landed student, with highlight and haptic.
- **Projector-friendly:** big names and a clear landing highlight. Keep the "Cold call animation" setting and the reduced-motion fallback.
- **Build it as a reusable component** (e.g. src/ui/Roll.tsx), because round 5's brain breaks will use it too.

## Tests
- **Migrations:** each mapping in section 1.
- **Minor items:** gum or uniform alone saves a record but doesn't change Behaviour's average or the ranking.
- **Wellbeing:** "All good" doesn't record it; ticking it saves and counts in the ranking; it's left out of de-identified exports.
- **Issue screen:** swipe right saves with no extra screen; a held sub-option saves its own note; swipe left cancels.
- **Target:** messages appear at the right counts and respect the setting; "all done" appears when everyone present is seen.
- **Swipe animation:** a second swipe during the animation saves both correctly; reduced motion skips the fly-off.
- **Roll:** it always lands on the pre-chosen student, and tap-to-skip shows that same student.

## When done
Follow CLAUDE.md: push round3, check the preview, and write docs/briefs/round3.md covering **all** of round 3 (the earlier commit plus this one). Give me the link. Wait for "merge".
