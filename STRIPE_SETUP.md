# Stripe Integration Setup Guide

This guide will help you complete the Stripe payment integration for TradeConnect.

## Prerequisites

- A Stripe account (sign up at https://stripe.com)
- Your Supabase project URL and keys
- Access to your Stripe Dashboard

## Step 1: Get Your Stripe API Keys

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Click on **Developers** in the left sidebar
3. Go to **API keys**
4. Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
5. Click "Reveal test key" and copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

## Step 2: Configure Environment Variables

### Local Development (.env file)

Update your `.env` file with your Stripe keys:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
VITE_STRIPE_PRO_PRICE_ID=price_your_live_pro_price_id_here
```

### Supabase Edge Functions

The `STRIPE_SECRET_KEY` needs to be available to your Edge Functions. This is automatically configured when you deploy.

## Step 3: Set Up Stripe Webhook

Webhooks allow Stripe to notify your application when subscription events occur (payments, cancellations, etc.).

### For Development (using Stripe CLI)

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Run: `stripe listen --forward-to https://your-project.supabase.co/functions/v1/stripe-webhook`
3. Copy the webhook signing secret (starts with `whsec_`)
4. Add it to your `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
   ```

### For Production

1. Go to your [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter your webhook URL:
   ```
   https://your-project.supabase.co/functions/v1/stripe-webhook
   ```
4. Select these events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add it as an Edge Function secret in Supabase:
   - Go to your Supabase project
   - Navigate to Edge Functions settings
   - Add `STRIPE_WEBHOOK_SECRET` with the webhook signing secret value

## Step 4: Test the Integration

### Test Upgrade Flow

1. Log in as a tradie user
2. Navigate to Settings or Dashboard
3. Click "Upgrade to Pro"
4. Use a [Stripe test card](https://stripe.com/docs/testing):
   - Card number: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
5. Complete the checkout
6. Verify the Pro badge appears on your profile

### Test Cancellation Flow

1. While on a Pro subscription, click "Manage Subscription"
2. Click "Cancel Subscription"
3. Verify the subscription is set to cancel at period end
4. Check your Stripe Dashboard to confirm the cancellation

## Step 5: Go Live

When you're ready to accept real payments:

1. Activate your Stripe account (complete verification in the Dashboard)
2. Switch to **Live mode** in your Stripe Dashboard
3. Get your **live API keys** from the API keys page
4. Update your production environment variables:
   ```env
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
   STRIPE_SECRET_KEY=sk_live_your_key_here
   ```
5. Update the Price ID to your live product price ID
6. Set up the production webhook endpoint (same URL, but in live mode)
7. Update the live webhook secret in your environment variables

## Subscription Features

The Pro subscription ($29/month) includes:

- Verified Pro Badge
- Priority Search Ranking
- Unlimited Job Accepts
- 0% Service Fees
- Google Calendar Sync
- Invoice Creation
- Project & Milestones Management
- Bulk Availability Setting
- Unlimited Lead Unlocks

## Troubleshooting

### "Stripe configuration missing" error

- Ensure `VITE_STRIPE_PUBLISHABLE_KEY` is set in your `.env` file
- Ensure `STRIPE_SECRET_KEY` is available to Edge Functions

### Webhook not receiving events

- Verify the webhook URL is correct
- Check that you've selected the correct events
- Ensure `STRIPE_WEBHOOK_SECRET` is correctly configured
- Check the webhook logs in your Stripe Dashboard

### Checkout session fails to create

- Verify the Price ID is correct
- Check that your Stripe account is active
- Ensure the user is authenticated

## Security Notes

- Never commit your `.env` file to version control
- Always use environment variables for API keys
- Use test mode keys during development
- The webhook endpoint validates signatures to prevent tampering
- Subscriptions are tracked in the `stripe_subscriptions` table with proper RLS policies

## Support

For Stripe-specific issues, refer to:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)

For integration issues, check:
- Supabase Edge Function logs
- Browser console for client-side errors
- Stripe Dashboard webhook logs
