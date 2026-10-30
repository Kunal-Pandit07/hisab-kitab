# Hisab Kitab — Aapke har rupaye ka hisaab.
Offline-first personal finance app (Expo + React Native + TypeScript + SQLite). Money is stored as integer paise.
Powered by KP Groups.

## Get the APK (Android)
```bash
npm install
npx expo install --check        # aligns any package versions with your Expo SDK
npm install -g eas-cli
eas login                       # free Expo account
eas build:configure             # first time only; links the project to your account
eas build -p android --profile preview
```
`preview` is set to produce an installable **APK** (see `eas.json`). When the cloud build finishes, EAS prints a download link / QR code: open it on your phone, download the APK and install it (allow "install unknown apps" if asked).
`eas build -p android --profile production` makes an **AAB** for the Play Store instead.

## Run it while developing
```bash
npm install
npx expo start      # scan the QR code with Expo Go, or press "a" for an Android emulator
```
Note: notifications and some audio behaviour are most reliable in a real build (the APK), not Expo Go.

## iOS
`eas build -p ios --profile production` needs an Apple Developer account (signing credentials). An iPhone build cannot be shared as a loose file the way an APK can; use TestFlight or ad-hoc provisioning.

## Tests
`npm test` runs 120 tests: money, ledger, budgets, savings, Udhaar, notifications, sounds, CSV/PDF building, PIN logic, encrypted backup/restore (including wrong password, tampering and rollback), reset, and a 20,000-transaction performance/index check. SQL is run against a real SQLite engine.
`npm run typecheck` type-checks the whole app; `npm run typecheck:logic` checks the logic layer.

## What's implemented (all phases)
- **Core:** onboarding, 5 tabs, accounts, income/expense/transfer with edit/delete, history search/filters/paging, custom categories.
- **Savings and budgets:** daily target (with history), week/month progress, manual no-spend days, goals, monthly overall and category budgets with threshold alerts.
- **Udhaar:** lent/borrowed, partial/full repayment, outstanding, due/overdue, optional account link; principal never counts as income/expense.
- **Feel:** sounds, haptics, animations, animated loading screen, your icon.
- **Notifications:** daily reminders, budget alerts, Udhaar due/overdue, goal reminders, quiet hours, permission handling.
- **Reports:** income vs expenses, daily/monthly expenses, category split, savings progress, budget performance, account balances, Udhaar outstanding; charts always have written totals.
- **Export:** CSV (formula-injection safe, Excel-friendly) and PDF for transactions, summary, savings and Udhaar, with a date range.
- **Security:** PIN (scrypt, escalating lockouts, stored in the platform keystore), optional biometrics, auto-lock timing, app-switcher cover, no recovery or back door (forgotten PIN = erase data, which is clearly warned).
- **Backup/restore:** password-encrypted (XChaCha20-Poly1305 + scrypt, header authenticated), validated before restore, restored in one transaction that rolls back on any failure, wrong password or corrupt file never changes existing data. PIN and biometric settings are never exported.
- **Reset:** erases everything (needs PIN if set, plus typing RESET).

## Honest limits
- **Not run on a phone or emulator by the author.** The app type-checks and the logic is tested, but expect small first-launch fixes. Please test on a real Android phone: icon, loading screen, sounds, notifications, PIN/biometrics, backup/restore round trip, back button, keyboard.
- Records are in plain SQLite (not encrypted by the app). The PIN is an app-level lock; a short PIN is not strong encryption. Backups are encrypted.
- Notification delivery depends on the phone's battery management. The app re-syncs reminders every time it opens.
- Backup restore requires the same data version as the app (currently 3); a backup from a newer app version is refused with a clear message.
- Not built: Udhaar interest/fees, budget threshold editing and monthly budget history, savings calendar view, animated balance changes, a success overlay, a native time picker (times are typed or chosen from presets), dark-mode visual polish beyond the theme.
- iOS: configured, but needs an Apple Developer account and has not been built.
- Sounds are generated placeholders; replace files in `assets/sounds/` (same names).
- `npm audit` may list advisories from Expo's dependency tree; they come from build tooling, not code shipped in the app.

## Tweaks
- Loading screen minimum time: `MIN_SPLASH_MS` in `app/_layout.tsx` (0 = only while loading).
- Icons: `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`, `assets/notification-icon.png` were generated from your supplied image.
