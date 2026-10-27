Follow CLAUDE.md for the workflow: branch, preview link, brief, and wait for "merge".

Round 6 for Solaristic Radar (the Pulse repo): Relief pass, so a relief (CRT) teacher can run a class for a day. Work on a new branch called `round6`, starting from main after round 5 has been merged. Don't push to main until I say so.

Read docs/HANDOVER.md first. This builds on the accounts, linked devices, QR and email invites, and encrypted sync that already exist. Read src/cloud.ts, src/logic/invite.ts, src/sync/ and src/ui/Sync.tsx and reuse them rather than building a new sharing system. Before changing anything, tell me in plain English how invites and encryption work today and what you'll change. I have limited coding experience. Use fictional data only. Keep all tests passing, add tests, and add a line to docs/BUILD_STATUS.md.

## 1. Creating a pass (main teacher)
Add a "Relief pass" button under Manage class. It opens a short form:
- **Dates:** today by default, or a date range (up to 5 school days).
- **Relief teacher's name** and **school email** (optional; if given, the pass only works for that email).
- **"Share ICP adjustments" tick box, unticked by default.** When it's ticked, the relief teacher sees each student's ICP adjustments (titles and short instructions) so they can apply them. When it's unticked, they only see the ICP yes/no marker, with the line "Ask the school for details".
- **"Today's plan" text box** (optional), pre-filled with the current lesson's learning intention if there is one.
- **Send:** shows a QR code, a copy link button and a share-by-email button. Reuse the invite QR and email code.

## 2. Using a pass (relief teacher)
- They open the link or scan the QR, then sign in with their email (magic link, no password), using the existing account flow.
- If a name or email was set on the pass, it must match.
- The pass works on one device only. If it's opened on a second device, show "This pass is already in use. Ask the class teacher for a new one".
- **They land on a simplified class page** with a "Relief" banner and the end date. Available:
  - Open/close lesson
  - Daily check-in
  - Homework check
  - Cold call
  - Brain break
- **They can see:**
  - student names
  - the flag marker
  - the ICP marker (and ICP adjustments only if they were shared)
  - today's plan
  - the homework set last lesson
- **They can't see:**
  - check-in history and running averages
  - notes and coping notes
  - evidence
  - ranking reasons
  - the teacher journal or My teaching
  - reports and exports
  - any other class
- **The daily check-in queue** still uses the main teacher's ranking order, but doesn't show why.

## 3. What happens to their data
- Everything a relief teacher enters is tagged with their name and "relief", and syncs back to the main teacher.
- The main teacher sees a "Relief entries to review" card on Home. They can accept everything (the default, which happens automatically after 7 days) or remove individual entries.
- Relief entries show in the timeline as "Relief: [name]".
- Relief teachers' notes are encrypted like the main teacher's notes.

## 4. Expiry and control
- The pass stops working at the end of its last day (local time). After that, the relief teacher's device deletes the class data it downloaded, after syncing any unsent entries.
- The main teacher can **cancel a pass** at any time from Manage class → Relief passes. That list shows active and past passes and when each was last used.
- Log every time a pass is used (who, when, which device) for the main teacher to see.

## 5. Encryption
Follow the existing sharing design: re-encrypt the class's student identities for the relief teacher's key only for the duration of the pass. ICP text is included only when "Share ICP adjustments" is ticked. If anything here can't be done with the current setup, stop and explain the options to me before building.

## Later, not now (just leave room for it)
- **Reception/admin mode:** front-office staff can create relief passes for teachers when a CRT arrives. Keep the "create pass" logic in a function that a future admin role can call for any class in the school.
- **School approval:** a school-level setting to turn relief passes on or off.

## Tests
- A pass only works within its dates, for the right email, and on one device.
- With ICP unticked, adjustments are not sent or visible (check the downloaded data, not just the screen).
- A relief teacher can't open history, notes, reports or other classes.
- Relief entries are tagged and appear for review.
- A cancelled pass stops working straight away, and an expired pass clears its downloaded data after sync.

## When you're done
Give me a plain-English summary, anything you weren't sure about (especially encryption), and how to test it with two devices or two browser profiles. Then wait for me to say "merge".
