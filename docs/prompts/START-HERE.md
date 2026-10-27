# Prompts to paste into Claude Code

CLAUDE.md (in the repo) holds the standing rules: a branch and preview per round, a brief, wait for "merge", and a handover after each merge. So these prompts can be short.

---

## Very first time (round 0)
Open Claude Code in the Pulse project folder, then paste:

> Read docs/prompts/round0-previews.md and follow it. The CLAUDE.md file I've added has our workflow; follow that from now on.

---

## Start of every new chat
> Read CLAUDE.md, docs/HANDOVER.md and docs/prompts/[ROUND FILE]. Don't re-read the whole codebase. Tell me in 5 lines what state things are in and your plan, then wait for my OK.

Replace [ROUND FILE] with the next one: round3b.md → round4.md → round5.md → round6.md.

---

## After testing a preview
- **Changes needed:** just describe them, e.g. "On the issue screen the Save button covers the last option. Fix that."
- **Happy with it:** type **merge**.

---

## If Claude Code hasn't offered a handover and the chat feels long
> Write docs/HANDOVER.md now as described in CLAUDE.md, commit it, and tell me when I can /clear.

Then type `/clear` and use "Start of every new chat".

---

## Round order
| Round | What it does | Needs first |
|---|---|---|
| round0-previews.md | Preview links, CLAUDE.md, files into docs/ | – |
| round3b.md | Finishes round 3: Wellbeing split, inline notes, daily target, swipe animation, cold call roll | round 0 merged |
| round4.md | Second class setup, import names, ICP bulk add and CSV, year in exports, teacher journal, Assessment check | round 3 merged |
| round5.md | Brain breaks (subject + calm), using the roll | round 4 merged, and brain-breaks.md vetted (✅/❌) |
| round6.md | Relief pass | round 5 merged |
