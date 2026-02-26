# Google Calendar Integration Setup

This guide explains how to set up Google Calendar synchronization for tradies in your TradeConnect application.

## Overview

The Google Calendar integration allows tradies to:
- Connect their Google Calendar to TradeConnect
- Automatically sync their calendar events
- Remove availability slots that conflict with calendar events
- Keep their availability up-to-date without manual updates

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. Access to the Google Cloud Console
3. Your Supabase project URL and service role key

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" and then "New Project"
3. Enter a project name (e.g., "TradeConnect Calendar")
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
   - App name: TradeConnect
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   - Add scopes: Click "Add or Remove Scopes"
   - Search for "Google Calendar API" and select: `https://www.googleapis.com/auth/calendar`
   - Click "Update" then "Save and Continue"
   - Add test users (your email and any test accounts)
   - Click "Save and Continue"
4. Return to Credentials and create OAuth client ID:
   - Application type: Web application
   - Name: TradeConnect Calendar OAuth
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
3. Function fetches events from Google Calendar for the next 30 days
4. Function checks for conflicts with existing availability slots
5. Conflicting slots (where calendar events overlap) are automatically removed
6. Sync timestamp is updated
7. Frontend refreshes the calendar view

### Token Refresh

- Access tokens expire after 1 hour
- The sync function automatically refreshes tokens when they expire
- Refresh tokens are stored securely in the database

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

## Database Schema

The `calendar_integrations` table stores:
- `tradie_id`: Reference to the tradie's profile
- `provider`: Calendar provider (currently only 'google')
- `access_token`: OAuth access token (expires after 1 hour)
- `refresh_token`: OAuth refresh token (used to get new access tokens)
- `token_expires_at`: When the access token expires
- `calendar_id`: The Google Calendar ID
- `last_synced_at`: Timestamp of last successful sync
- `sync_enabled`: Whether auto-sync is enabled

## Future Enhancements

Potential improvements for the calendar integration:
- Automatic sync on a schedule (e.g., every hour)
- Support for multiple calendar providers (Outlook, Apple)
- Two-way sync (create calendar events from booked slots)
- Selective calendar sync (choose which calendars to sync)
- Conflict resolution options (keep slot vs remove slot)
