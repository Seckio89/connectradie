# Owner TODO — everything only you can do, in plain English

These steps need your logins, your credentials, or your legal authority.
Claude prepares everything around them but must never do these itself.
Work top to bottom — item 1 has a review queue measured in days, so start it
first. Timing/ordering context: [GO-LIVE-RUNBOOK.md](GO-LIVE-RUNBOOK.md).

---

## 1. Google — submit the sign-in approval (start today, it queues for days)

Right now, people signing in with Google see a raw technical URL instead of
"ConnecTradie". Google has to approve the branding.

1. Go to **console.cloud.google.com** → sign in with your Google account →
   pick the ConnecTradie project (top bar dropdown).
2. Left menu → **APIs & Services → OAuth consent screen**.
3. Fill in / confirm: App name **ConnecTradie**, support email, the logo
   (already in the repo: `oauth-consent-logo-120.png`), homepage
   `https://connectradie.com`, privacy `https://connectradie.com/privacy`,
   terms `https://connectradie.com/terms`.
4. Press **Publish app**, then **Submit for verification**.
5. If it asks why you need the *calendar* permission: consider removing the
   calendar scope for now and submitting with basic scopes only — calendar is
   a "sensitive scope" and slows review down a lot. (The calendar import
   feature is parked anyway.) Ask Claude to walk you through it live if the
   screens don't match this.

## 2. Stripe — flip from test money to real money (do this the day before launch)

Open `docs/stripe-go-live-checklist.md` alongside — it shows the exact
screens. In short:

1. **dashboard.stripe.com** → toggle from **Test mode** to **Live mode**
   (top right). Complete anything Stripe still asks for: business details,
   your ID, the bank account payouts land in.
2. **Developers → API keys**: copy the **Secret key** (`sk_live_...`) →
   paste it into **Supabase → project settings → Edge Functions secrets** as
   `STRIPE_SECRET_KEY`. *Never* paste this key into chat, email, or a file.
3. Copy the **Publishable key** (`pk_live_...`) → **Vercel → your project →
   Settings → Environment Variables** → update `VITE_STRIPE_PUBLISHABLE_KEY`
   → redeploy.
4. **Developers → Webhooks → Add endpoint**: the checklist §3 has the URL
   and events. Copy the **Signing secret** (`whsec_...`) into Supabase
   secrets as `STRIPE_WEBHOOK_SECRET`.
5. Tell Claude when done — it verifies the endpoints respond correctly
   without ever seeing the keys.

## 3. GitHub — 2 minutes that protects the live site (decision D1)

This stops anything reaching the live site before the automated checks pass.

1. **github.com/Seckio89/connectradie** → **Settings** → **Branches**.
2. **Add branch protection rule** → branch name pattern: `master`.
3. Tick **Require status checks to pass before merging** → search and select
   the CI checks (Type Check, Tests, Build, DB Columns, Navigability).
4. **Save**. Done — from now on the merge button stays grey until checks are
   green.

## 4. Vercel — one env var now, one approval later

- Now: nothing (the publishable key swap is step 2.3 above).
- About a week after launch: Claude will open a PR turning on the strict
  security policy (CSP enforce). You just review and merge it.

## 5. Google Play — publish the Android app (after the website launch)

Open `docs/android-release-checklist.md` for exact values. In short:

1. **play.google.com/console** → create the app listing for
   **com.connectradie.app**.
2. Upload the signed app file (already built — the checklist §8 names it).
3. Fill the store listing: name, description, screenshots, the
   background-location explainer video/text (§6 — Play rejects without it).
4. Register the release SHA-1 fingerprint with Google Sign-In (§3) — without
   this, Google login fails in the Android app.
5. Submit for review; expect a few days.

## 6. Your weekly routine once live (~10 minutes, Mondays)

1. Read the top of **`docs/growth/RECOMMENDATIONS.md`** — the Monday scan
   puts its 3 best ideas in your notification and the full list there.
   Nothing in it is ever built until you say so.
2. Open **`docs/governance/DECISIONS-PENDING.md`** — tick approve/reject on
   anything new. (Or just tell Claude "approve D4" in chat.)
3. Merge any green fix PRs on GitHub — each one has before/after screenshots
   so you can judge it in seconds. Green checks + screenshots look right =
   safe to merge.

---

*Everything else — audits, fixes, PRs, reports, scans, monitoring — is
Claude's job and happens without you. If a step above doesn't match what you
see on screen, ask Claude to walk you through it live.*
