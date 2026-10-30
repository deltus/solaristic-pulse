# Round 5: Brain breaks

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round5/
(Includes everything live on main, plus the rework below.)

## What changed
- All 24 breaks from docs/brain-breaks.md are in the app (`src/config/brainBreaks.ts`), with the steps and "Say:" lines copied word for word. All were marked ⬜, so all are included, as you asked.
- A full-width **Brain break** button under the class page buttons.
- **Subject break** opens the subject matching the class (e.g. Geography), with chips to switch subject; if the class subject has no breaks yet, you pick from the chips. **Calm break** rolls among the calm breaks. Breaks are filtered by the class's year level, falling back to the whole subject if none fit.
- The same roll as cold call lands on a break (tap anywhere to skip to it). The result shows the name big for the projector, with minutes, years and 🔗 chips.
- **Show me how** (or tap the name): "You'll need" box, numbered steps with "Say:" lines highlighted, a big **Open game** button for linked games, notes, seated version, and the calm-break rule. **Hide instructions** goes back to the big name.
- **Spin again** never lands on the one just shown, and breaks used in this class's last 3 lessons are skipped (unless every one has been used).
- **Done** saves the break with the lesson and asks "Did it help?" 👍 / 👎 (or Skip).
- **Settings → Brain breaks**: switch any break off, tap a name to read it, and **Add your own** (name, subject or a new subject, link, years, minutes, what you need, steps). Your own breaks join the roll.
- Breaks show in the student lesson timeline ("Brain break: Long-exhale breathing (calm) 👍"), on My teaching, in the class Excel report ("Brain breaks" sheet) and the SQL export. No student data.

## How to test
1. Open the link, tap **Load demo data**, open a class, **Open lesson**.
2. Tap **Brain break** → **Calm break**: names roll and land (tap during the roll to jump). Tap **Spin again** a few times: never the same one twice in a row.
3. Tap **Show me how**: check the "Say:" lines stand out. **Hide instructions**.
4. Tap **Done** → 👍. You're back on the class page.
5. Edit a class (Manage class → ✏️) and set Subject to **Geography** and Year level **Year 11**. Brain break → **Subject break**: it goes straight to Geography and never shows Globle (Years 7–10).
6. Set Year level back to **Year 9**, spin until **Globle** shows → Show me how → **🔗 Open Globle** opens the site in a new tab.
7. Settings → **Brain breaks**: switch off Box breathing; Calm break never lands on it. **Add your own** with a new subject "English"; set a class subject to English and Subject break finds it.
8. Reports → export the class: the **Brain breaks** sheet lists what you did.
9. After a few lessons (+1 day, open/close lessons), a break used in the last 3 lessons doesn't come up again until all have been used.

## Not done / unsure
- Done without your OK on the plan, as you asked.
- Every break was ⬜ (not vetted). Replaced by the v3 list in the Adjustments below.
- "Open game" uses a normal new-tab link. In the Android app it should open the phone's browser, but I haven't tried it on a device.
- Hidden breaks are a setting on this device only (settings don't sync). Your own breaks do sync.
- Comparing focus on lessons with and without a brain break (My teaching) is not built; the data needed (break per lesson, close-lesson focus) is saved.
- The roll motion is the cold call roll; in my test browser reduced motion was on, so I saw the instant version.

## Adjustments (31/10/2026: rework after your feedback)
**What changed**
- **New, stronger list: 37 breaks** (docs/brain-breaks.md, same as the app). 6 Geography, 6 History, 6 Economics and Business, 5 Civics, 7 **Any subject** and 7 Calm. New ones include Mystery street, Fact or fiction, Dollar Street, Guess the price, Double majority vote, Mini parliament, Count to 20, Quick Draw, Board sketch, Listening minute and Seated stretch. Removed: Travle, WhenTaken, RBA Inflation Explorer and Will your referendum pass? (weak or broken links).
- **Any subject breaks:** if a class's subject has no breaks of its own (e.g. Maths, English, Science, or no subject set), **Subject break** rolls a random Any subject break straight away. That's one tap, with no "which subject?" screen. Chips at the top still let you switch.
- **Every subject break has numbered steps** (3–5 each) with "Say:" lines to read aloud.
- **The website is a tap-to-open button inside the "You'll need" box** at the top, named after the site (e.g. **🔗 Open Globle**), so you don't scroll past the steps to find it.
- All 11 website links were checked and opened on 31/10/2026.
- Previews list page: the "updated" times are now really in UTC (they were local time labelled UTC).
- `samples/*.json` snapshots are now ignored by git, so a database snapshot can't be committed by accident.

**How to test**
1. Open the link → **Load demo data** → open a class → **Open lesson**.
2. Manage class → ✏️ → set Subject to **Maths**. Brain break → **Subject break**: it rolls straight away and lands on an Any subject break (e.g. Count to 20). The "Any subject" chip is highlighted at the top.
3. Tap **Show me how**: numbered steps, with the "Say:" lines highlighted.
4. Tap the **Geography** chip and spin until a website one shows (Globle, Worldle, Mystery street or Map quiz race) → Show me how: the **🔗 Open …** button sits in the "You'll need" box and opens the site.
5. Settings → Brain breaks: switch off all the Any subject ones; a Maths class's Subject break now asks which subject.

**Not done / unsure**
- The new list hasn't been vetted by you. Everything is marked ✅ in docs/brain-breaks.md; change any to ❌ (or tell me) and I'll remove it.
- Mystery street depends on MapCrunch's "Stealth" option to hide the place name. Check that it still works.
- The "Federal, state or local?" answers are simplified (e.g. libraries can be state or local). The last step says roads are all three.
- Some schools block game sites. If one is blocked, hide it in Settings → Brain breaks.
- No database change, so this is still v12.
