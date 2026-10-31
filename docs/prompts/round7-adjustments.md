Follow CLAUDE.md. Round 7 adjustments (agreed with Thomas, 31/10/2026). Work on the existing `round7` branch: merge main in first, then make these changes, push for a preview, and add them to docs/briefs/round7.md under "Adjustments". Database: if anything new needs storing, stay on v14 (round 7's version) unless a new table is unavoidable.

Round 7 already has room templates, the tap-to-edit grid and a projector view. Keep all of that. Only add what's missing.

## 1. Templates first, then tweak (the main path)
- **The room step opens on the template picker:** big tiles with a small drawing each. Order: Groups of 4, Rows of pairs, **Rows of 3 (new)**, Groups of 6, U-shape, Rows of singles.
- **Picking a tile** makes the room straight away, sized to the class, with one button: **"Use this room"**. A smaller **"Tweak"** button opens the existing grid editor.
- **Aim: a ready room in under 30 seconds** for most teachers. Don't make anyone draw a room from scratch unless they choose to.

## 2. Quick wall setup (optional, inside Tweak)
At the top of the editor, a 3-step strip:
1. "Tap the wall with the board"
2. "Tap where the door is"
3. "Tap the wall(s) with windows" (Done or Skip)

Each tap moves the board, door or windows on the current layout; desks stay put. The 10×10 grid editing stays as it is underneath. A gap of one empty cell between desks is a walkway, and desks touching in a line are one table. Make sure tables of 4 or 6 can face each other (two rows back to back), e.g. 6 tables of 4 as "3 above, 3 below".

## 3. Saved, named classrooms
- When a teacher saves a room, ask for a name (e.g. "B12", "Science lab 3"). Rooms belong to the teacher, not the class, so any class can use them.
- The room step lists **"Your rooms"** above the templates.
- **Switching a class to a different room** re-fits the current plan:
  - keep locked seats and students' tables where the table still exists
  - re-run the planner for everyone else
  - show "4 students moved because the room changed"
- Teachers can rename, duplicate and delete rooms. A room used by an active plan can't be deleted; say which class uses it.

## 4. Present view on the classroom computer
- Rename "Projector view" to **"Present"**.
- **On a computer:** Present opens in a new browser window (`window.open`) as a clean, full-screen page, with names only, the board at the top and large text. Add a **Full screen** button (Fullscreen API).
- **On a phone:**
  - Present opens full screen on the phone.
  - Add a line: "To show it on the board, open Radar on the classroom computer and tap Present."
  - If sync is on, add: "Your plan is already there."
- **Build Present as a reusable page** (e.g. src/ui/Present.tsx: a big title, optional body, optional countdown), because tickets and brain breaks will use it later. Only seating uses it in this round.

## 5. Small fixes
- **Labels:** keep the "Mixed tables / Support table near teacher" labels.
- **Previews page:** the "updated" times are local time but labelled UTC (.github/workflows/pages.yml); fix the label.

## Tests
- The new "Rows of 3" template seats a class of 24 and 27 sensibly.
- Wall setup moves the board, door and windows without changing desks.
- A named room can be used by two classes; deleting it is blocked while a plan uses it.
- Switching rooms keeps locked seats and reports how many students moved.
- Present output contains names only (no needs, levels, tags or reasons).
