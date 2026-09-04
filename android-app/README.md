# Balance Sheet Square V2 Android app

This is the V2 Android update containing the redesigned multi-view Balance Sheet Square and retirement simulator. The original website and repository remain unchanged.

## Features

- Android package: `com.lbp.balancesheetsquare`
- Version code 15 / version name 2.3.8, suitable as an update to the existing closed-test app
- Minimum Android 7.0 (API 24)
- Targets Android 16 (API 36)
- Local storage for balance-sheet and retirement-planning figures
- Fully offline calculation from the first launch
- Native Android PDF save picker and share sheet
- One Free-to-Paid package using the Google Play one-time product `bss_full_lifetime`
- No ads, analytics, sign-in, or sensitive permissions

## Open in Android Studio

1. Install Android Studio with JDK 17 and Android SDK 36.
2. Choose **Open** and select the `android-app` folder.
3. Allow Gradle to sync.
4. Run the `app` configuration on an emulator or Android device.

## Build locally

First build and copy the latest website into the app, then run Gradle:

```bash
npm run sync:android
gradle -p android-app assembleDebug
gradle -p android-app bundleRelease
```

The release bundle produced by this project is unsigned. Configure Play App Signing before creating the final bundle for Google Play. Do not commit a keystore, `keystore.properties`, or any signing password.
