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

## 2. Release signing ✅ GRADLE WIRED — supply the keystore
`android/app/build.gradle` now has a release `signingConfig` that loads credentials from `android/keystore.properties` (git-ignored) and falls back to debug signing when that file is absent (commit `8e512ac`). Remaining is the local, per-developer setup:
- [ ] Create an upload keystore (once, store it OUTSIDE the repo and back it up — losing it means you can't update the app):
  ```
  keytool -genkey -v -keystore connectradie-upload.jks -alias connectradie -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] `cp android/keystore.properties.example android/keystore.properties` and fill in `storeFile`, `storePassword`, `keyAlias`, `keyPassword` (this file is git-ignored — never commit it).
- [ ] Enroll in **Play App Signing** (recommended) — you upload with the upload key; Google manages the distribution key.
- [ ] Consider enabling `minifyEnabled true` for release (currently `false`) — optional; verify the WebView + plugins still work if you do.

## 3. Google Sign-In — SHA-1 registration ⚠️ REQUIRED
Native Google Sign-In (`@codetrix-studio/capacitor-google-auth`) validates the app by package name + signing-certificate SHA-1. The `serverClientId` above is the **Web** client; Android also needs an **Android OAuth client** in the **same** GCP project (`491568884460`). The Android clients are *not referenced by ID in code* — they just need to exist so Play Services allows an app with this package + cert. **No code change** after creating them. SHA-1 fingerprints are not secret.

Three certs, each its own Android OAuth client (same package `com.connectradie.app`):

| Cert | SHA-1 | Status |
|---|---|---|
| **Debug** (this machine's `~/.android/debug.keystore`, valid to 2056) | `9C:05:C6:25:49:47:97:51:F2:31:42:F6:E0:B1:84:30:EB:21:57:01` | ✅ **registered** (Android OAuth client already exists for this package + SHA-1, confirmed 2026-07-12) |
| **Upload key** | _TBD — fill after creating `connectradie-upload.jks`_ | ⏳ `keytool -list -v -keystore connectradie-upload.jks -alias connectradie` |
| **Play App Signing** (⭐ the one production users run) | _TBD — after first AAB upload_ | ⏳ Play Console → Setup → App integrity → App signing |

> Debug SHA-256 (if a flow asks for it): `9D:FA:E4:6A:39:85:47:EE:62:04:39:22:4B:71:86:4B:72:30:8F:DC:22:9D:6F:8F:DB:45:C4:D4:32:9F:72:E0`
> The debug SHA-1 is machine-specific — each dev's `debug.keystore` differs, so each needs its own entry to test sign-in locally.
> Extract keytool on Windows from Android Studio's JDK: `"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"`.

Steps in **Google Cloud Console** (project that owns the Web client `491568884460-…`):
- [x] ~~Debug SHA-1 Android client~~ — already registered (Google rejects duplicates: "package name and fingerprint already in use" = it exists). Nothing to create.
- [ ] APIs & Services → Credentials → **+ Create Credentials → OAuth client ID → Android** for the **upload key** and **Play App Signing** SHA-1s (own client each, same package `com.connectradie.app`, same project as the Web client `491568884460`)
- [ ] Sanity-check sign-in on a device installed from an **internal-testing** track (Play-signed), not just a local debug build. If sign-in fails only in production, the Play App Signing SHA-1 is almost certainly unregistered — the #1 miss.

## 4. Push notifications (FCM) — ⏭️ DEFERRED, NOT a go-live blocker
Native push is **not implemented** and is **not required to launch**. Notifications are already delivered by **email** (`send-email`) and **in-app**; native push would be an additional nice-to-have channel.

State of the feature (audited 2026-07-12):
- `@capacitor/push-notifications` is installed but **never imported/called** — nothing registers a device token.
- No device-token table in migrations; no server-side FCM sender (all edge-fn "push" matches are array `.push()`). `src/lib/notifications.ts` has Web Push only (`navigator.serviceWorker` + `pushManager`), which doesn't apply to the native WebView.
- `google-services.json` is absent — but adding it alone does **nothing** except let the plugin compile; there's no code for it to drive.

To build native push later (a real feature, not a file drop): (1) Firebase project attached to `com.connectradie.app` + `google-services.json` + FCM v1 service-account key; (2) client `PushNotifications.register()` on login → store token; (3) `device_push_tokens` table + RLS; (4) FCM-v1 sender edge function fanned out from existing notification events. `POST_NOTIFICATIONS` is already declared in the manifest for when this happens.

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
| Release signing config | ✅ gradle wired (`8e512ac`) — supply keystore locally |
| SHA-1 → Android OAuth client | 🟡 debug ✅ registered; upload + Play App Signing still to add |
| Push notifications (FCM) | ⏭️ deferred — not implemented, NOT a blocker (email + in-app cover it) |
| Background-location Play disclosure | ⏳ submit in console |
| CSP × WebView check | ⏳ verify under report-only |
