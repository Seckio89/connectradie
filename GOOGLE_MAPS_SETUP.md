# Google Maps API Setup Guide

This guide will help you set up Google Maps Places API for address autocomplete functionality.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click "Select a project" at the top, then "New Project"
4. Enter a project name (e.g., "TradeConnect")
5. Click "Create"

## Step 2: Enable Places API

1. In the Google Cloud Console, go to **APIs & Services > Library**
2. Search for "Places API"
3. Click on **Places API** (the new version)
4. Click **Enable**

## Step 3: Create an API Key

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials** at the top
3. Select **API Key**
4. Your API key will be created and displayed
5. Click **Edit API Key** to configure restrictions

## Step 4: Restrict Your API Key (Recommended)

### Application Restrictions
- For development: Select **HTTP referrers (web sites)**
  - Add: `http://localhost:*`
  - Add: `http://127.0.0.1:*`
- For production: Add your production domain(s)

### API Restrictions
- Select **Restrict key**
- Check **Places API**
- Click **Save**

## Step 5: Add API Key to Your Project

1. Open your `.env` file in the project root
2. Add the following line with your API key:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your-api-key-here
   ```
3. Save the file
4. Restart your development server

## Pricing

Google Maps Platform offers a generous free tier:
- **First $200/month free** (monthly credit)
- Places Autocomplete: ~$17 per 1,000 requests
- Most projects stay within the free tier

To monitor usage:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services > Dashboard**
3. View your API usage and set up billing alerts

## Testing

Once configured, the address autocomplete will:
- Show suggestions after typing 3 characters
- Filter results to Australian addresses only
- Automatically include street number, name, suburb, and postcode
- Handle common abbreviations (e.g., "spr" → "spring")

## Troubleshooting

### "Address autocomplete unavailable" message
- Check that `VITE_GOOGLE_MAPS_API_KEY` is set in your `.env` file
- Restart the development server after adding the key

### "Failed to load Google Maps" error
- Verify your API key is correct
- Check that Places API is enabled in Google Cloud Console
- Verify your domain/localhost is allowed in API key restrictions

### No suggestions appearing
- Ensure you're typing at least 3 characters
- Check browser console for errors
- Verify Places API is enabled (not just Maps JavaScript API)

## Additional Resources

- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Places API Documentation](https://developers.google.com/maps/documentation/places/web-service)
- [Pricing Calculator](https://mapsplatform.google.com/pricing/)
