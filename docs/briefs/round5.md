# Round 5: Brain breaks

## Preview link
https://deltus.github.io/solaristic-pulse/preview/round5/
(Needs the one-off GitHub setting in docs/briefs/round0.md. Includes rounds 0, 3 and 4.)

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
5. Edit a class (Manage class → ✏️) and set Subject to **Geography** and Year level **Year 7**. Brain break → **Subject break**: it goes straight to Geography and never shows Travle (Years 8–12).
6. Pick **Globle** (spin until it shows) → Show me how → **Open game** opens the site in a new tab.
7. Settings → **Brain breaks**: switch off Box breathing; Calm break never lands on it. **Add your own** with a new subject "English"; set a class subject to English and Subject break finds it.
8. Reports → export the class: the **Brain breaks** sheet lists what you did.
9. After a few lessons (+1 day, open/close lessons), a break used in the last 3 lessons doesn't come up again until all have been used.

## Not done / unsure
- Done without your OK on the plan, as you asked.
- Every break was ⬜ (not vetted). The **(check link)** ones (Wikitrivia, Chronophoto, Higher or Lower) show "(check link)" under the Open game button. Please still vet the list.
- WhenTaken's steps say "same as TimeGuessr", so its instructions show that line followed by TimeGuessr's steps.
- "Open game" uses a normal new-tab link. In the Android app it should open the phone's browser, but I haven't tried it on a device.
- Hidden breaks are a setting on this device only (settings don't sync). Your own breaks do sync.
- Comparing focus on lessons with and without a brain break (My teaching) is not built; the data needed (break per lesson, close-lesson focus) is saved.
- The roll motion is the cold call roll; in my test browser reduced motion was on, so I saw the instant version.
