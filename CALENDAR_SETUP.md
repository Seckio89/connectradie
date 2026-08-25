# Google Calendar Integration Setup

This guide explains how to set up Google Calendar synchronization for tradies in ConnecTradie.

## Overview

The Google Calendar integration allows tradies to:
- Connect their Google Calendar to ConnecTradie
- Push their ConnecTradie availability and jobs into Google Calendar
- Block availability slots that clash with commitments in **any** of their
  Google calendars, so a clashing slot cannot be booked
- Import existing events from chosen calendars, mapped to team members
- Keep their availability up-to-date without manual updates

Nothing in this integration ever deletes an availability slot. See "Conflict
handling" below — that distinction is load-bearing, not pedantry.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. Access to the Google Cloud Console
3. Your Supabase project URL and service role key

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" and then "New Project"
3. Enter a project name (e.g., "ConnecTradie Calendar")
4. Click "Create"

## Step 2: Enable Google Calendar API

1. In the Google Cloud Console, select your project
2. Go to "APIs & Services" > "Library"
3. Search for "Google Calendar API"
4. Click on it and press "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External
   - App name: ConnecTradie  ← must match the app being verified
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   - Add scopes: Click "Add or Remove Scopes"
   - Search for "Google Calendar API" and select **exactly these two**:
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/calendar.readonly`
   - Click "Update" then "Save and Continue"

   > ⚠️ This previously said to register the broad
   > `https://www.googleapis.com/auth/calendar` scope. That is **not** what the
   > code asks for. `google-calendar-oauth/index.ts` requests the two scopes
   > above and nothing else, so registering the broad one puts the consent
   > screen out of step with the request — and both of the ones we do use are
   > sensitive scopes that go through Google verification, where the
   > registration and the request have to agree.
   - Add test users (your email and any test accounts)
   - Click "Save and Continue"
4. Return to Credentials and create OAuth client ID:
   - Application type: Web application
   - Name: ConnecTradie Calendar OAuth
   - Authorized redirect URIs: Add your Supabase function URL:
     ```
     https://[YOUR-PROJECT-ID].supabase.co/functions/v1/google-calendar-oauth
     ```
   - Click "Create"
5. Save the Client ID and Client Secret

## Step 4: Configure Environment Variables

Add the following environment variables to your Supabase Edge Functions:

```bash
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

To set these in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to "Edge Functions" > "Settings"
3. Add the environment variables in the "Environment Variables" section
4. Redeploy your edge functions if they were already deployed

## Step 5: Test the Integration

1. Log in as a tradie
2. Go to the Dashboard
3. Click "Connect Google Calendar"
4. Authorize the application in the Google OAuth popup
5. Once connected, the button should change to "Sync Google Calendar"
6. Click the sync button to test synchronization

## How It Works

### OAuth Flow

1. Tradie clicks "Connect Google Calendar"
2. Frontend calls the `google-calendar-oauth` edge function with `action=initiate`
3. Function returns a Google OAuth authorization URL
4. User is redirected to Google to authorize the app
5. Google redirects back to the edge function with an authorization code
6. Function exchanges the code for access and refresh tokens
7. Tokens are securely stored in the `calendar_integrations` table

### Sync Process

1. Tradie clicks "Sync Google Calendar"
2. Frontend calls the `sync-google-calendar` edge function
3. Function lists the tradie's calendars (`calendarList`) and asks the FreeBusy
   API for their busy intervals over the next 30 days — across all of them, not
   just the primary one
4. Slots that overlap a busy interval are **blocked** and stamped with
   `availability_slots.external_conflict_at`
5. Slots previously blocked this way whose commitment has gone are handed back
6. ConnecTradie jobs and availability are exported into Google Calendar
7. Sync timestamp is updated
8. Frontend refreshes the calendar view

### Conflict handling

**A clash blocks a slot. It never deletes one.**

This is worth stating plainly because the sync used to delete. On 2026-06-13 the
export had just started pushing every open slot into Google as
`✅ Available — ConnecTradie`; the conflict check read those events back, saw
them overlapping the slots that had created them, and deleted the tradie's
entire availability. Deletion was removed eight minutes later and stayed
removed. Do not reintroduce it.

Two things stop that recurring:

- The read uses **FreeBusy**, which ignores events marked transparent, and every
  availability block ConnecTradie exports is transparent. Our own events cannot
  come back to us as busy. (Exported *job* events are opaque and do read as
  busy — correctly; a booked job is a real commitment.)
- A blocked slot keeps its row and carries `external_conflict_at`, so the next
  sync can hand it straight back when the Google event goes away. That column
  also distinguishes a sync-block from the tradie's own manual block, which the
  sync must never clear.

A blocked slot is genuinely unbookable, not merely hidden:
`book_availability_slot` refuses it, and a trigger on `jobs.slot_id` refuses
anything that tries to bypass the RPC.

The conflict check never receives event titles — FreeBusy returns intervals
only. That is deliberate: `availability_slots` is readable by every
authenticated user, so a title stored there would be a title published to every
client on the platform.

### Token Refresh

- Access tokens expire after 1 hour
- The sync function automatically refreshes tokens when they expire
- Refresh tokens are stored in the database (see Security Considerations)
- A refresh only overwrites the stored refresh token when Google returns a new
  one, so a refresh can never blank it

> ⚠️ **While the OAuth consent screen is in "Testing" publishing status, Google
> expires refresh tokens after 7 days.** The symptom is `invalid_grant` on every
> sync about a week after connecting, fixed by reconnecting — for another seven
> days. There is nothing to fix in this repository. Check **APIs & Services →
> OAuth consent screen → Publishing status** before investigating anything else.
>
> **The fix is "Publish app" — NOT verification.** The 7-day expiry is tied to
> the publishing *status*, so pressing **Publish app** lifts it the moment the
> status becomes "In production". Verification is a separate, slower process
> that only removes the unverified-app warning screen and the 100-user cap; the
> integration works throughout it. An earlier version of this note said the app
> had to be "published and verified", which reads as *wait weeks before the
> feature can work* — it does not.
>
> Confirmed as the cause on 2026-08-25. The evidence: the stored refresh token
> was complete and well-formed (103 chars, `1//0…`) and the expiry arithmetic
> was correct to the second, but `updated_at` still equalled `created_at` and
> `last_synced_at` was NULL — so nothing had ever refreshed successfully, while
> the code path itself was a textbook RFC 6749 grant. Diagnosed three times
> before that; the `last_refresh_error_code` / `needs_reconnect` columns exist so
> the fourth time reads the answer off the row instead.

## Security Considerations

- OAuth tokens are stored in the database
- For production, consider encrypting tokens at rest using PostgreSQL's pgcrypto extension
- Only the tradie who owns the integration can access their tokens (enforced by RLS policies)
- Service role key is required for the edge functions (never exposed to the client)

## Troubleshooting

### "Failed to exchange code for tokens"
- Verify your Client ID and Client Secret are correct
- Ensure the redirect URI in Google Cloud Console matches your Supabase function URL exactly

### "Failed to fetch calendar events"
- Check that the Google Calendar API is enabled in your GCP project
- Verify the access token hasn't expired (tokens are auto-refreshed)
- Ensure the tradie granted calendar access during OAuth

### "No Google Calendar integration found"
- The tradie needs to connect their calendar first
- Check the `calendar_integrations` table to verify the record exists

### "Reconnect Google Calendar — Google no longer accepts the saved authorisation"
- This is `invalid_grant`. Most often it is the 7-day Testing-mode expiry above.
- Otherwise: the tradie revoked access at myaccount.google.com/permissions, or
  consent was withdrawn.
- Reconnecting mints a new refresh token. If it fails again a week later, the
  publishing status is the cause.
- Note the deliberately different message for `invalid_client` ("Check
  GOOGLE_CLIENT_SECRET"): that one is not fixed by reconnecting, and telling a
  tradie to reconnect would send them round a loop that cannot terminate. See
  `supabase/functions/_shared/googleTokenError.ts`.

### Sync says "we could not read your calendars to check for clashes"
- The conflict half of the sync failed while the export half carried on.
- Usually a 403 because `calendar.readonly` has not been granted — likely while
  Google verification is still pending.
- The function logs the reason; nothing was blocked or released on that run.

## Database Schema

The `calendar_integrations` table stores:
- `tradie_id`: Reference to the tradie's profile
- `provider`: Calendar provider (currently only 'google')
- `access_token`: OAuth access token (expires after 1 hour)
- `refresh_token`: OAuth refresh token (used to get new access tokens)
- `token_expires_at`: When the access token expires
- `calendar_id`: The Google Calendar the export writes to. Always the literal
  `"primary"`. The *conflict check* does not use it — that reads every calendar
  via `calendarList` + FreeBusy.
- `last_synced_at`: Timestamp of last successful sync
- `sync_enabled`: Whether auto-sync is enabled

`availability_slots.external_conflict_at` records that the sync blocked a slot
because the tradie is committed elsewhere. `NULL` means it did not — which is
what tells a sync-block apart from the tradie's own manual block. It never holds
an event title.

`imported_calendar_visits` holds events pulled in by `google-calendar-import`,
deduped on `(business_owner_id, google_event_id)` so re-importing updates rather
than duplicates. They are shown on the Schedule calendar as read-only chips.
They are deliberately not `jobs`: a job is a client-owned record with a
lifecycle and money attached, and an imported visit is neither.

## Future Enhancements

Potential improvements for the calendar integration:
- Automatic sync on a schedule (e.g., every hour)
- Support for multiple calendar providers (Outlook, Apple)
- Letting the tradie choose which calendars count towards conflicts (today: all
  of them, minus the holiday and birthday group calendars)
- Incremental sync via a sync token, instead of a full 30-day window each time
