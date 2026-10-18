# Architecture

## Stack (and why)
| Piece | Choice | Reason |
|---|---|---|
| UI | **Preact + TypeScript**, Vite | React-style components at ~4 KB; fast builds; easy to maintain. |
| Storage | **Dexie (IndexedDB)** | Durable local database in every browser/WebView; live queries keep screens in sync. |
| Spreadsheets | **SheetJS** (`xlsx` 0.20.3 from cdn.sheetjs.com) | Reads CSV/XLSX rosters & timetables; writes XLSX. Lazy-loaded only when importing/exporting. |
| Offline web | **vite-plugin-pwa** (Workbox) | Precaches the app shell, fonts and the SheetJS chunk so the PWA runs without a connection. |
| Android | **Capacitor 8** + Filesystem, Share, LocalNotifications | Wraps the same web build into an APK; adds real file saving, the share sheet and scheduled notifications. |
| Fonts | Inter Variable + IBM Plex Mono (bundled via @fontsource) | Matches the Solaristic Insights look; works offline. |
| Styled XLSX | ExcelJS (lazy-loaded) | Outlined tables, header styling. |
| SQL export | sql.js (SQLite as WebAssembly, lazy-loaded) | .sqlite file and portable .sql script for long-term analysis. |
| Tests | Vitest + fake-indexeddb | Fast unit and integration tests without a browser. |

No AI service, no analytics. The only backend is the **optional** Supabase account (`src/cloud.ts`, `supabase/migrations/`): sign-in by emailed code, linked devices, invites and opt-in live sync (`src/sync/`: outbox middleware, push/pull engine, AES-GCM field encryption). Without sync it holds no student data. It is switched off unless `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set at build time; otherwise the app makes no network requests at runtime. See `docs/SUPABASE.md`.

## Folder layout
```
src/
  types.ts          data model
  db.ts             Dexie schema, core categories/questions, settings helpers
  services.ts       every write/read used by the UI (classes, students, plan, check-ins, ICP, timetable, backup)
  logic/            pure, tested functions
    priority.ts       weights, explanation, ranking/selection
    followups.ts      open follow-ups, prompts, follow-up levels
    trends.ts         category trends (facts vs interpretation)
    icp.ts            ICP due status, implementation rate, before/after comparison
    schedule.ts       timetable lookups, which questions are due
    reminderPlan.ts   timetable + prefs → concrete reminder times
    deidentify.ts     pseudonyms and note scrubbing
    importers.ts      roster/timetable parsing
    invite.ts         invite codes, invite/sign-in links, invite email text, device names
  exporting.ts      report sheets + XLSX/CSV writer
  demo.ts           fictional demo data (replays the real algorithm over 4 weeks)
  platform.ts       files, share, install prompt, notifications, PIN hashing (web + native switch)
  cloud.ts          optional Supabase account: email-code sign-in, linked devices, invites
  native.ts         Android implementations (Capacitor plugins)
  ui/               App shell, Lock, Onboarding, reminders hook, screens/*
tests/              logic, services (IndexedDB), exporting (XLSX read-back)
android/            Capacitor Android project (generated; icons via scripts/android-icons.mjs)
```

## Data model (IndexedDB tables)
- `classes` {id, name, subject, yearLevel, archived, dailyTarget?}
- `students` {id, classId, firstName, lastName, preferredName?, externalId?, archived, flag?{reason,since}, priorityAdjust}
- `questions` {id, text with `{name}`, categoryId, options[{label, level}], allowDetail, classIds[], studentIds[], frequencyDays, enabled, builtIn, order}
- `categories` {id, name, phrase, builtIn}
- `checkins` id = `date|classId|studentId` {status: complete|partial|absent|skipped, source: daily|extra|manual}
- `observations` id = `checkinId|questionId` {response, level 0|1|2|null, followUp?{previousId, outcome}, context?, note?}
- `plans` id = `date|classId` {entries[{studentId, source, reasons[]}]} (keeps the day's queue stable)
- `notes`, `icpAdjustments`, `icpChecks` (id = `adjustmentId|date`), `timetable`, `kv` (settings incl. PIN hash)

Deterministic ids make corrections idempotent (re-answering updates, never duplicates) and keep one check-in per student/class/day.

## Blitz records
Blitz marks are stored as observations with `blitz` set (topic id), `checkinId = blitz|date|classId` and the matching area's category. They are not check-ins (coverage and rotation ignore them) but feed trends, the last-5-answers table, draw weight and reports (own "Blitz" sheet).

## Security notes
- PIN: PBKDF2-SHA256 (150k iterations, random salt) via WebCrypto; lock on launch and after N minutes in background; 30 s back-off every 5 failures. **Data is not encrypted at rest** — stated in the privacy notice.
- Backups/exports are plain files; the app warns about this.

## Platform-specific behaviour / limitations
| Feature | Android APK | Installed PWA / browser | iPhone (PWA) |
|---|---|---|---|
| Offline use | Yes (bundled) | Yes after first load (service worker) | Yes after first load |
| Lesson / daily notifications when app closed | **Yes** — scheduled 14 days ahead on the device; refreshed each time the app opens. May arrive a few minutes late (Android inexact alarms / battery optimisation). | **No** — only while the app is open | No |
| In-app reminders (lesson banner, overdue, ICP due) | Yes | Yes | Yes |
| Save files | Documents/Solaristic Radar, or share sheet | Browser download | Share sheet / download |
| Dictation | Keyboard microphone | Keyboard microphone | Keyboard microphone |

Internet is only needed to *install* (download the APK or open the PWA's address once) and for development (`npm install`). Keyboard dictation may be processed by the keyboard provider depending on device settings.
