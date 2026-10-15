# Solaristic Pulse

Offline-first classroom check-ins for teachers: about five targeted student check-ins per class per day, contextual follow-ups, transparent priorities, ICP (Individual Curriculum Plan) tracking, and de-identifiable spreadsheet reports. All data stays on the device.

See `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md` and `docs/BUILD_STATUS.md`.

## Run it on this PC
Requires Node.js 20+ (installed: v24).

```bash
npm install          # first time only (needs internet)
npm run dev          # development server → http://localhost:5173
npm test             # automated tests
npm run build        # production build into dist/
npm run preview      # serve the production build → http://localhost:4173 (offline/PWA behaviour)
```

On first launch choose **Explore with fictional demo data** to see three invented classes with four weeks of history, or **Start empty**.
Sample import files: `samples/demo-roster.csv`, `samples/demo-timetable.csv` (also downloadable inside the app).

## Android (APK)
One-time setup: install **Android Studio** (includes the JDK and Android SDK), open it once and finish the setup wizard (it downloads the SDK and asks you to accept the SDK licences).

Then, from this folder:
```bash
npm run android:apk
```
This builds the web app, copies it into `android/`, and produces
`android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone (USB, Drive, email) and open it to install (allow "Install unknown apps" for the app you open it from). Alternatively run `npx cap open android` and press ▶ in Android Studio with the phone connected.

Notes for this PC (already set up): `android/local.properties` points at the SDK with forward slashes; the Gradle wrapper is 9.1 (needed for Android Studio's Java 25); `android/settings.gradle` lets Gradle fetch the Java 21 toolchain some plugins need. Because the Windows username contains a space, build with Java's temp folder redirected:

```bash
npm run android:apk:win
```

After installing, the app needs no internet connection. Lesson and daily notifications are scheduled on the phone from your timetable (enable them in Settings → Reminders).

If you change the logo: replace `assets/s-mark.png`, then `npm run icons` (web) and `npm run icons:android`.

## Install as a web app (PWA)
Host the `dist/` folder on any HTTPS static host (only the app code is uploaded, never student data), open it in Chrome (Android) → *Install app*, or Safari (iPhone) → Share → *Add to Home Screen*. Notifications in the web version only appear while the app is open.

## Backups
Settings → **Data, backup & deletion** → *Download backup* creates a complete JSON file. Restore it on the same or another device with *Restore from backup* (replaces the current data). Backups are **not encrypted**; store them according to your school's policy. Uninstalling the app or clearing browser data deletes local records.

## Privacy
No accounts, servers, cloud sync, analytics or AI services. Data is stored in the device's local database and is not encrypted by the app; the optional PIN only deters casual access. Check your school's privacy and record-keeping policies before entering real student data. All bundled names are fictional.
