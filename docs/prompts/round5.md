Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 5 for Solaristic Radar (the Pulse repo): a Brain break picker. Work on a new branch called `round5`, starting from main after rounds 3 and 4 have been merged. Don't push to main until I say so.

Read docs/HANDOVER.md first. Then read docs/brain-breaks.md, which is the vetted list. **Only load breaks marked ✅.** Breaks marked ❌ or ⬜ are left out. Reuse the roll component from round 3 (src/ui/Roll.tsx); don't build a second one.

Before changing anything, tell me in plain English what you'll change. I have limited coding experience. Keep all tests passing, add tests for new logic, and add a line to docs/BUILD_STATUS.md.

## 1. Brain break content (src/config/brainBreaks.ts)
Turn each ✅ break in docs/brain-breaks.md into a config entry with these fields:
- `id`
- `name`
- `group`: `geography`, `history`, `economics-business`, `civics` or `calm`
- `type`: `calm` or `perk`
- `years` (e.g. "7–10")
- `minutes`
- `position` (optional)
- `noise` (optional)
- `link` (optional URL)
- `resources` (exact list)
- `steps` (keep the exact "Say:" wording)
- `seatedVersion` (optional)
- `notes` (optional)

Copy the text faithfully; don't rewrite it. Keep the groups in one list, so more subjects (English, Maths, Science) can be added later just by adding entries.

## 2. Class page button
Add a **Brain break** button to the class page grid (src/ui/screens/Today.tsx), the 7th button, as a full-width row under the 2×3 grid.

## 3. Brain break flow (new screen: src/ui/screens/BrainBreak.tsx)
1. **Pick the kind.** Two big buttons: **"Subject break"** and **"Calm break"**.
   - **Subject break** goes straight to the subject that matches the class's subject field (e.g. a Geography class goes to Geography), with chips at the top to switch to another subject. If the class's subject has no breaks yet, show the subject chips to pick from.
   - **Calm break** rolls among the calm breaks.
   - Also filter by year level when the class has one: only breaks whose `years` range includes it, falling back to all breaks in that subject if none match.
2. **Roll.** The same roll animation as cold call cycles through break *names* in that group and lands on one. **Tapping during the roll skips to the result.** If there's no tap, the full roll plays. Respect the "Cold call animation" setting and reduced motion the same way cold call does.
3. **Result screen shows the name only,** big and projector-friendly, with small chips: minutes, years, and a 🔗 icon if it has a link. Buttons:
   - **"Spin again"** rolls again, never landing on the one just shown.
   - **"Show me how"** opens the instructions. Tapping the name does the same.
4. **Instructions screen:**
   - Resources at the top in a clear box ("You'll need: …" or "Nothing needed").
   - Then the numbered steps, with "Say:" lines styled so they stand out as words to read aloud.
   - If there's a link, a big **"Open game"** button that opens it in a new tab (or the system browser on Android), so the teacher can project it.
   - Then notes and the seated version. For calm breaks, add the line: "Joining in is invited, never forced. Eyes closed is optional. No touching."
   - A "Hide instructions" button returns to the big name for projecting.
5. **Done.** A "Done" button logs the break, then asks one optional, skippable question: "Did it help?" (👍 / 👎). Then it returns to the class page.

## 4. Picking rules (src/logic/brainBreaks.ts)
- Random among breaks in the chosen group, but don't land on a break this class has used in its last 3 lessons, unless every break in that group has been used.
- "Spin again" never repeats the break just shown.
- **Teacher controls in Settings → Brain breaks:**
  - a list of all breaks with a switch to hide any of them
  - "Add your own" (name, subject group or a new subject, link, years, minutes, resources, steps)
  - Custom breaks join the roll like the built-in ones.

## 5. Saving and data
- Save a BrainBreak record: lesson ID, class, break ID, type (calm/perk), time, and the optional "helped" answer.
- Show brain breaks in the lesson timeline ("Brain break: Long-exhale breathing (calm) 👍").
- Include them in the class Excel report and the SQL export.
- No student data is involved.
- **Later, not now:** the My teaching page could compare close-lesson focus on lessons with and without a brain break. Just make sure the data is saved in a way that allows it.

## Tests
- Only ✅ breaks are loaded from the config.
- A Geography class opens Geography breaks by default; the year filter works and falls back when nothing matches.
- The roll lands on a break in the chosen group, and tap-to-skip shows that same break.
- Breaks with a link show an "Open game" button.
- Spin again never repeats the last break shown.
- The last-3-lessons rule works, and falls back when every break has been used.
- Hidden breaks never appear; custom breaks do.
- A brain break saves with the lesson and appears in the timeline.

## When you're done
Give me a plain-English summary of what changed, anything you weren't sure about, and how to test it on my phone. Then wait for me to say "merge".
