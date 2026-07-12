# Android Release Checklist — ConnecTradie

Play Store release steps for the Capacitor Android app. Values below are read
from the actual project config, not generic boilerplate.

**App identity (do not change):**

| Field | Value |
|---|---|
| Application ID / namespace | `com.connectradie.app` |
| App name | ConnecTradie |
| WebView loads | `https://connectradie.com/login` (remote — `capacitor.config.ts` `server.url`) |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |
| Current versionCode / versionName | `1` / `1.0` (`android/app/build.gradle`) |
| Google Web OAuth client (serverClientId) | `491568884460-unfmph1ckhu227ut9kh5b6cbgui028se.apps.googleusercontent.com` |

> Because the app loads the **remote** site, most product changes ship via the
> normal web deploy and need **no** new APK. A new Play release is only required
> for native changes: version bump, permissions, plugins, signing, icons/splash,
> SDK levels, or the geofence license.

---

## 1. Versioning
- [ ] Bump `versionCode` (integer, **must increase every upload**) and `versionName` in `android/app/build.gradle`. First release can stay `versionCode 1` / `1.0`.

## 2. Release signing ⚠️ NOT YET CONFIGURED
`android/app/build.gradle` has **no release `signingConfig`** — release builds are currently debug-signed and Play will reject them.
- [ ] Create an upload keystore (once, store it OUTSIDE the repo and back it up — losing it means you can't update the app):
  ```
  keytool -genkey -v -keystore connectradie-upload.jks -alias connectradie -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] Add a `signingConfigs { release { ... } }` block and wire `buildTypes.release.signingConfig`, reading the keystore path/passwords from `~/.gradle/gradle.properties` or env vars (**never** commit them).
- [ ] Enroll in **Play App Signing** (recommended) — you upload with the upload key; Google manages the distribution key.
- [ ] Consider enabling `minifyEnabled true` for release (currently `false`) — optional; verify the WebView + plugins still work if you do.

## 3. Google Sign-In — SHA-1 registration ⚠️ REQUIRED
Native Google Sign-In (`@codetrix-studio/capacitor-google-auth`) validates the app by package name + signing-certificate SHA-1. The `serverClientId` above is the **Web** client; Android also needs an **Android OAuth client** in the **same** GCP project (`491568884460`).
- [ ] Get the SHA-1 of BOTH: (a) your upload key, and (b) the **Play App Signing** cert (Play Console → Setup → App integrity). Users run the Play-signed cert, so (b) is the one that matters in production.
  ```
  keytool -list -v -keystore connectradie-upload.jks -alias connectradie   # upload key SHA-1
  ```
- [ ] In Google Cloud Console → Credentials, create/verify an **OAuth client (Android)** with package `com.connectradie.app` and each SHA-1 above.
- [ ] Sanity-check sign-in on a device installed from an **internal-testing** track (Play-signed), not just a local debug build.

## 4. Push notifications (FCM) ⚠️ google-services.json MISSING
`android/app/build.gradle` applies the google-services plugin **only if `google-services.json` exists** — it currently does **not**, so push is disabled.
- [ ] If launching with push: create/download `android/app/google-services.json` from the Firebase project for `com.connectradie.app`, and confirm the FCM server key is wired to the `send-sms`/push edge path.
- [ ] `POST_NOTIFICATIONS` is already declared in the manifest (Android 13+ runtime prompt) — verify the app requests it at the right moment.
- [ ] If NOT launching with push: fine to skip — the build degrades gracefully.

## 5. Background geofencing license ✅ DONE — just verify
The Transistorsoft license is already in `android/app/src/main/res/values/strings.xml` (`transistor_bg_geo_license`, order #16756, bound to `com.connectradie.app`, CORE entitlement, validates debug + release).
- [ ] Note the license `max_build_stamp` is **2027-08-07** — builds compiled after that date need a renewed key. Not a launch blocker.
- [ ] Confirm a release build registers geofences and fires ENTER/EXIT on a real device (see `docs/native-geofencing-setup.md`).

## 6. Background-location prominent disclosure ⚠️ Play review gate
`ACCESS_BACKGROUND_LOCATION` triggers Google's sensitive-permission review.
- [ ] In Play Console → App content → **Location permissions**, complete the background-location declaration and record the required **prominent-disclosure + in-app consent demo video** (the disclosure copy + in-app consent screen were built earlier this session).
- [ ] Ensure the in-app runtime flow shows the disclosure BEFORE requesting background location.

## 7. WebView / CSP compatibility ⚠️ tie-in
The WebView loads `connectradie.com`, which will serve the new CSP.
- [ ] Test a release build against the site **while CSP is in report-only** and watch for violations from Capacitor's injected bridge. If any, add the `capacitor:` scheme to `script-src`/`connect-src` in `vercel.json` **before** the CSP is switched to enforcing — otherwise the app white-screens.
- [ ] Confirm Stripe Checkout still returns into the app (the `allowNavigation` allow-list in `capacitor.config.ts` handles this).

## 8. Build the release artifact
- [ ] `npm run build` (produces `dist/` — the offline fallback bundle)
- [ ] `npx cap sync android`
- [ ] Build a signed **AAB** (Play requires App Bundle, not APK):
  ```
  cd android && ./gradlew bundleRelease
  # output: android/app/build/outputs/bundle/release/app-release.aab
  ```
- [ ] Install the equivalent signed build on a physical device and smoke-test: launch/splash, Google sign-in, a Stripe payment round-trip, push (if enabled), and a geofence ENTER/EXIT.

## 9. Play Console store listing & policies
- [ ] Store listing: title, short + full description, feature graphic, phone/tablet screenshots, app icon.
- [ ] **Data safety** form — declare what's collected (location, financial via Stripe, personal info) and that data is encrypted in transit; keep it consistent with `/privacy`.
- [ ] Privacy policy URL: `https://connectradie.com/privacy`.
- [ ] Content rating questionnaire; Target audience (18+ — matches the privacy policy's under-18 exclusion).
- [ ] Roll out through **Internal testing → Closed → Production**, not straight to Production.

## 10. Post-submit
- [ ] After the first Production release, re-fetch the **Play App Signing** SHA-1 and confirm it's registered on the Android OAuth client (step 3) — sign-in silently fails if only the upload-key SHA-1 is registered.
- [ ] Tag the release commit and record the `versionCode`.

---

### Quick status summary
| Item | State |
|---|---|
| Geofence license | ✅ configured (order #16756) |
| Permissions in manifest | ✅ present |
| targetSdk current | ✅ 36 |
| Release signing config | ❌ **to do** |
| SHA-1 → Android OAuth client | ❌ **to do** |
| google-services.json (push) | ❌ **missing** (only if shipping push) |
| Background-location Play disclosure | ⏳ submit in console |
| CSP × WebView check | ⏳ verify under report-only |
