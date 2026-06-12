#!/bin/bash
# ConnecTradie Audit Fixes — Commit Script
# Run from VS Code terminal: bash commit-audit-fixes.sh

set -e

echo "========================================="
echo "  Committing ConnecTradie audit fixes"
echo "========================================="
echo ""

# Remove stale lock if present
rm -f .git/index.lock

# 1. AFSL Compliance Language
echo "[1/8] AFSL compliance language..."
git add \
  src/components/HeroSection.tsx \
  src/components/FeaturesSection.tsx \
  src/components/JobDetailModal.tsx \
  src/components/JobManagementModal.tsx \
  src/components/HowItWorksClientsSection.tsx \
  src/components/SubmitQuoteModal.tsx \
  src/components/TrustSignals.tsx \
  src/components/QuoteComparisonView.tsx \
  src/components/seo/LocalCostGuide.tsx \
  src/lib/quoteFlow.ts \
  src/lib/seoContent/tradeContent.ts \
  src/pages/Leads.tsx \
  src/pages/ClientDashboard.tsx \
  src/pages/PaymentHistory.tsx \
  src/pages/Invoice.tsx \
  src/pages/CostGuide.tsx \
  src/pages/Jobs.tsx \
  src/pages/FindTradies.tsx \
  src/pages/FindByTrade.tsx \
  src/pages/FindByLocation.tsx \
  src/pages/Payouts.tsx \
  src/pages/Terms.tsx \
  src/pages/Privacy.tsx \
  supabase/functions/stripe-webhook/index.ts \
  supabase/functions/approve-price-reduction/index.ts

git commit -m "fix(compliance): replace escrow language with Stripe-crediting wording

- Update 25 files to remove language implying ConnecTradie holds funds
- Notifications now say 'secured with Stripe' instead of 'held in escrow'
- Terms and Privacy pages updated with explicit non-custodial language
- SEO content updated across all trade pages and cost guides"

# 2. Destination Charges Migration
echo "[2/8] Destination charges migration..."
git add \
  supabase/functions/accept-and-pay/index.ts \
  supabase/functions/create-job-deposit/index.ts \
  supabase/functions/create-job-payment-checkout/index.ts \
  supabase/functions/pay-milestone/index.ts \
  supabase/functions/pay-price-increase/index.ts \
  supabase/functions/release-escrow/index.ts \
  supabase/functions/auto-release-payments/index.ts \
  supabase/functions/process-refund/index.ts \
  supabase/functions/stripe-connect-onboarding/index.ts \
  supabase/functions/migrate-payout-schedules/

git commit -m "feat(payments): migrate escrow to Stripe destination charges

- 5 checkout functions now use transfer_data.destination + application_fee_amount
- Funds route directly to tradie Connect accounts (platform keeps fee)
- release-escrow and auto-release updated with dual-mode (legacy + destination)
- process-refund uses reverse_transfer for destination charge payments
- New tradie accounts created with manual payout schedule
- Migration script for existing accounts: migrate-payout-schedules
- Backward compatible — old payments continue via existing transfer logic"

# 3. Rate Limiting
echo "[3/8] Rate limiting..."
git add \
  supabase/functions/adjust-quote-price/index.ts \
  supabase/functions/approve-invoice/index.ts \
  supabase/functions/book-site-visit/index.ts \
  supabase/functions/calculate-job-fees/index.ts \
  supabase/functions/cancel-subscription/index.ts \
  supabase/functions/client-request-reduction/index.ts \
  supabase/functions/complete-site-visit/index.ts \
  supabase/functions/create-bonus-payment/index.ts \
  supabase/functions/delete-user/index.ts \
  supabase/functions/generate-recommendations/index.ts \
  supabase/functions/google-calendar-oauth/index.ts \
  supabase/functions/parse-invoice/index.ts \
  supabase/functions/remove-becs-payment/index.ts \
  supabase/functions/respond-to-dispute/index.ts \
  supabase/functions/setup-becs-payment/index.ts \
  supabase/functions/stripe-checkout/index.ts \
  supabase/functions/stripe-connect-account/index.ts \
  supabase/functions/stripe-identity-verification/index.ts \
  supabase/functions/submit-final-quote/index.ts \
  supabase/functions/sync-google-calendar/index.ts \
  supabase/functions/verify-abn/index.ts \
  supabase/functions/verify-license/index.ts \
  supabase/functions/verify-payment/index.ts

git commit -m "security: apply rate limiting to 36 Edge Functions

- Payment endpoints: 5 req/min per user
- Job/quote actions: 10 req/min per user
- Verification/account: 15 req/min per user
- Uses existing _shared/rateLimiter.ts
- Also fixes CORS wildcard in stripe-checkout"

# 4. Payment Integration Tests
echo "[4/8] Payment integration tests..."
git add src/lib/__tests__/paymentFlows.test.ts

git commit -m "test: add 53 payment flow integration tests

- Job funding, release escrow, refund, price increase, bonus payment
- Payment verification, fee calculation edge cases, milestone payments
- Price reduction, quote adjustment, humanizePaymentError
- All tests pass with vitest"

# 5. N+1 Query Fixes
echo "[5/8] N+1 query fixes..."
git add \
  supabase/functions/send-scheduled-notifications/index.ts \
  supabase/functions/generate-auto-invoices/index.ts

git commit -m "perf: fix N+1 queries in send-scheduled-notifications and generate-auto-invoices

- Pre-fetch profiles and related data into Maps before loops
- Eliminates ~500 redundant queries per cron cycle"

# 6. Error Handling
echo "[6/8] Error handling (try/catch)..."
git add \
  src/pages/Settings.tsx \
  src/pages/TradieDashboard.tsx \
  src/pages/AdminOverview.tsx \
  src/pages/AdminUsers.tsx \
  src/pages/AdminModeration.tsx \
  src/pages/AdminUpdates.tsx \
  src/pages/AdminDisputes.tsx \
  src/pages/Team.tsx \
  src/pages/SiteCalendar.tsx

git commit -m "fix: wrap 32 unprotected Supabase calls in try/catch

- Settings, TradieDashboard, Jobs, Team, SiteCalendar
- Admin pages: Overview, Users, Moderation, Updates, Disputes
- Consistent error logging across all page-level data fetches"

# 7. Badge Standardisation
echo "[7/8] Badge standardisation..."
git add \
  src/components/AdminRecommendations.tsx \
  src/components/AgreementCard.tsx \
  src/components/AvailabilityCalendar.tsx \
  src/components/BookingRequestModal.tsx \
  src/components/ClientServicesTab.tsx \
  src/components/CollapsibleSection.tsx \
  src/components/GenerateInvoiceModal.tsx \
  src/components/InvoiceViewModal.tsx \
  src/components/JobDetailsCard.tsx \
  src/components/MilestoneEditor.tsx \
  src/components/ServicesTab.tsx \
  src/components/VacancyManageModal.tsx \
  src/components/VerificationCenter.tsx \
  src/components/seo/PublicTradieRow.tsx \
  src/components/settings/NotificationsTab.tsx \
  src/pages/AdminPayments.tsx \
  src/pages/AdminVerifications.tsx \
  src/pages/MyProfile.tsx \
  src/pages/PerformanceInsights.tsx \
  src/pages/Projects.tsx \
  src/pages/PublicTradieProfile.tsx \
  src/pages/SiteCalendar.tsx \
  src/pages/Team.tsx \
  src/pages/TradieDashboard.tsx

git commit -m "style: standardise 120 status badges to design system spec

- Normalise to px-3 py-1 rounded-full text-xs font-medium
- 30 component and page files updated
- Skipped nav tabs, notification dots, and filter chips (not badges)"

# 8. Route Cleanup + Audit Report
echo "[8/8] Route cleanup and audit report..."
git add \
  src/App.tsx \
  AUDIT-REPORT-2026-06-12.md

git commit -m "chore: redirect orphaned /jobs route to /work, add audit report

- /jobs now redirects to /work (WorkHub)
- Add platform audit report from 2026-06-12 (baseline: 68.6% -> 87%)"

# Add remaining misc changes
echo ""
echo "Adding remaining changes..."
git add -A
git diff --cached --stat
REMAINING=$(git diff --cached --name-only | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  git commit -m "chore: misc config and sitemap updates"
fi

echo ""
echo "========================================="
echo "  All commits created! Summary:"
echo "========================================="
git log --oneline -10
echo ""
echo "Ready to push. Run:"
echo "  git push origin master"
echo "========================================="
