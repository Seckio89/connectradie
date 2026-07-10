# Native Site Geofencing — Setup Runbook

Background geofencing that auto-detects when a tradie arrives at / leaves a
booked job site. Works even when the app is fully closed, because the
Transistorsoft plugin POSTs geofence crossings **directly from native code** to
the `geofence-event` edge function — no live WebView required (important, since
this app loads a remote URL).

## Architecture

```
Tradie has a 'site_visit_scheduled' quote
        │  useSiteGeofencing (src/hooks) → siteGeofence.ts
        ▼
BackgroundGeolocation.addGeofences({ identifier: quoteId, lat, lng, radius })
        │  device crosses boundary (app open OR closed)
        ▼
Plugin native HTTP POST  ──X-Geofence-Token──▶  supabase/functions/geofence-event
        │  token → tradie_id (device_geofence_tokens)
        ▼
INSERT site_visit_events (ENTER/EXIT)  +  notify client on first ENTER
```

- Coordinates come from `jobs.latitude/longitude`; radius from
  `jobs.geofence_radius_m` (default 150 m).
- Auth is a per-device opaque token (`device_geofence_tokens`), NOT a JWT — a
  JWT would be expired by the time a background event fires.

## What's already in the repo

- `src/lib/siteGeofence.ts` — plugin config + add/remove/sync geofences
- `src/hooks/useSiteGeofencing.ts` — syncs geofences to scheduled visits (mounted in `DashboardLayout`)
- `supabase/functions/geofence-event/index.ts` — receives crossings
- Migrations: `..._site_geofence_tables.sql` (device tokens + event log)
- `AndroidManifest.xml` — `ACCESS_*_LOCATION` + `ACCESS_BACKGROUND_LOCATION` + license meta-data
- `res/values/strings.xml` — `transistor_bg_geo_license` key installed (order #16756, app_id `com.connectradie.app`, CORE)
- npm deps: `@transistorsoft/capacitor-background-geolocation`, `@transistorsoft/capacitor-background-fetch`

## Manual steps to go live

### 1. Deploy the edge function (custom token auth → no JWT)
```bash
supabase functions deploy geofence-event --no-verify-jwt
```

### 2. Android Gradle wiring (per the plugin's install output)
After `npx cap sync android`, follow the plugin's Android setup:
- Add the Transistorsoft maven repos to `android/build.gradle` `allprojects.repositories`
  (the plugin README lists the exact `maven { url ... }` lines for the installed version).
- Confirm `android/variables.gradle` has a compatible `minSdkVersion` (≥ 21) and
  `compileSdkVersion`/`targetSdkVersion` current.
- Sync Gradle in Android Studio; resolve any version alignment it flags.

### 3. License key — DONE
- Purchased (order #16756, Starter tier, app_id `com.connectradie.app`, CORE entitlement).
- Installed in `res/values/strings.xml` → `transistor_bg_geo_license`.
- Key whitelists `.debug`/`.dev`/`.staging` suffixes, so it validates debug builds too.
- `max_build_stamp` 2027-08-07: builds compiled after that date need a renewed key;
  already-shipped APKs keep working.

### 4. Play Store prominent disclosure (REQUIRED for background location)
`ACCESS_BACKGROUND_LOCATION` triggers Google Play review. You must:
- Show an in-app disclosure BEFORE requesting "Allow all the time" explaining
  what background location is used for (the plugin's `backgroundPermissionRationale`
  in `siteGeofence.ts` covers the OS prompt; Play also wants an in-context screen).
- Complete the Play Console **Location permissions declaration** with a short
  justification + a demo video showing the disclosure → permission → feature.
- Expect a few days' review turnaround.

### 5. Build + test on a device
```bash
npx cap sync android
# open android/ in Android Studio → run on a physical device (geofencing needs real GPS)
```
Test: create a job with coordinates, book a site visit as the tradie, then
physically enter/leave the site radius (or use Android Studio's emulator route
playback). Confirm rows land in `site_visit_events` and the client gets the
"arrived on site" notification.

## Notes / gotchas
- Windows: `npm install <pkg>` fails EBADPLATFORM on the pinned Linux rollup —
  use `--force` (see [[reference_native_google_auth]] memory).
- Android geofence radius minimum is ~100 m; `syncSiteGeofences` clamps to that.
- Geofence-only mode (`startGeofences()`) keeps battery use low — the SDK sleeps
  until a boundary is crossed rather than tracking continuously.
