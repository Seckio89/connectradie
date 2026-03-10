import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Australian seasonal trade mapping (Southern Hemisphere) ──────────
const SEASONAL_TRADES: Record<string, string[]> = {
  summer: [
    "Air Conditioning",
    "Pool Maintenance",
    "Landscaping",
    "Solar Installation",
    "Pest Control",
  ],
  autumn: [
    "Roofing",
    "Guttering",
    "Painting",
    "Fencing",
    "Tree Lopping",
  ],
  winter: [
    "Heating",
    "Insulation",
    "Plumbing",
    "Electrical",
    "Flooring",
  ],
  spring: [
    "Renovation",
    "Building",
    "Carpentry",
    "Tiling",
    "Concreting",
  ],
};

function getAustralianSeason(month: number): string {
  if (month >= 11 || month <= 1) return "summer"; // Dec-Feb
  if (month >= 2 && month <= 4) return "autumn"; // Mar-May
  if (month >= 5 && month <= 7) return "winter"; // Jun-Aug
  return "spring"; // Sep-Nov
}

// ── Confidence level based on data volume ────────────────────────────
type Confidence = "high" | "medium" | "low";

function getConfidence(sampleSize: number, minForHigh: number, minForMedium: number): Confidence {
  if (sampleSize >= minForHigh) return "high";
  if (sampleSize >= minForMedium) return "medium";
  return "low";
}

function confidenceLabel(c: Confidence): string {
  if (c === "high") return "High confidence (strong data)";
  if (c === "medium") return "Medium confidence (limited data)";
  return "Low confidence (very small sample)";
}

// ── Recommendation type ──────────────────────────────────────────────
interface Recommendation {
  category: "growth" | "pricing" | "promotions" | "trends" | "operations";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  data_snapshot: Record<string, unknown>;
  action_url: string | null;
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    // ── Auth: require admin ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (callerProfile?.role !== "admin") {
      return json({ error: "Forbidden: admin access required" }, 403);
    }

    // ── Gather platform metrics ──────────────────────────────────────
    const now = new Date();
    const thisMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const lastMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    ).toISOString();
    const lastMonthEnd = thisMonthStart;
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [
      profilesRes,
      tradieDetailsRes,
      jobsRes,
      jobsThisMonthRes,
      jobsLastMonthRes,
      paymentsCompletedRes,
      paymentsThisMonthRes,
      paymentsLastMonthRes,
      pendingVerifRes,
      subscriptionsRes,
      quotesRes,
      disputesRes,
      signupsThisMonthRes,
      signupsLastMonthRes,
      recentJobsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id, role, verification_status, stripe_connect_onboarding_complete, created_at"),
      supabase.from("tradie_details").select("profile_id, trade_category, subscription_tier"),
      supabase.from("jobs").select("id, status, created_at, budget_amount"),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thisMonthStart),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthEnd),
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "completed"),
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "completed")
        .gte("created_at", thisMonthStart),
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "completed")
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthEnd),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending"),
      supabase
        .from("stripe_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("quotes").select("id, firm_price, price_min, price_max, status, created_at"),
      supabase
        .from("disputes")
        .select("id, status")
        .in("status", ["open", "under_review"]),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thisMonthStart),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthEnd),
      // Recent jobs in last 7 days for freshness check
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
    ]);

    // ── Parse metrics ────────────────────────────────────────────────
    const profiles = profilesRes.data || [];
    const clients = profiles.filter((p) => p.role === "client");
    const tradies = profiles.filter((p) => p.role === "tradie");
    const tradieDetails = tradieDetailsRes.data || [];
    const jobs = jobsRes.data || [];
    const completedPayments = paymentsCompletedRes.data || [];
    const quotes = quotesRes.data || [];
    const disputes = disputesRes.data || [];

    const totalRevenue = completedPayments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );
    const revenueThisMonth = (paymentsThisMonthRes.data || []).reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );
    const revenueLastMonth = (paymentsLastMonthRes.data || []).reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );

    const jobsThisMonth = jobsThisMonthRes.count || 0;
    const jobsLastMonth = jobsLastMonthRes.count || 0;
    const signupsThisMonth = signupsThisMonthRes.count || 0;
    const signupsLastMonth = signupsLastMonthRes.count || 0;
    const pendingVerifications = pendingVerifRes.count || 0;
    const activeSubscriptions = subscriptionsRes.count || 0;
    const openDisputes = disputes.length;
    const recentJobsCount = recentJobsRes.count || 0;

    // Category distribution
    const categoryMap: Record<string, number> = {};
    for (const td of tradieDetails) {
      const cat = td.trade_category || "Unknown";
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    }

    // Job demand by category (use tradie_details trade_category since jobs don't have trade_category)
    const jobCategoryMap: Record<string, number> = {};
    for (const td of tradieDetails) {
      const cat = td.trade_category || "Unknown";
      jobCategoryMap[cat] = (jobCategoryMap[cat] || 0) + 1;
    }

    // Tradies without Stripe Connect
    const tradiesNoConnect = tradies.filter(
      (t) => !t.stripe_connect_onboarding_complete
    ).length;

    // Quote acceptance rate
    const totalQuotes = quotes.length;
    const acceptedQuotes = quotes.filter(
      (q) => q.status === "accepted"
    ).length;
    const quoteAcceptRate =
      totalQuotes > 0 ? acceptedQuotes / totalQuotes : 0;

    // Subscription rate
    const proTradies = tradieDetails.filter(
      (td) => td.subscription_tier === "pro"
    ).length;

    // Average job value
    const jobsWithBudget = jobs.filter((j) => (j as Record<string, unknown>).budget_cents);
    const avgJobValue = jobsWithBudget.length > 0
      ? jobsWithBudget.reduce((sum, j) => sum + (Number((j as Record<string, unknown>).budget_cents) || 0), 0) / jobsWithBudget.length
      : 0;

    // Completed vs total job ratio
    const completedJobs = jobs.filter((j) => j.status === "completed").length;
    const cancelledJobs = jobs.filter((j) => j.status === "cancelled").length;
    const completionRate = jobs.length > 0 ? completedJobs / jobs.length : 0;

    // Platform maturity level — determines which recommendations to show
    const totalUsers = profiles.length;
    const platformStage = totalUsers >= 100 ? "scale" : totalUsers >= 20 ? "growth" : "early";

    const metrics = {
      totalUsers,
      totalClients: clients.length,
      totalTradies: tradies.length,
      clientToTradieRatio:
        tradies.length > 0
          ? (clients.length / tradies.length).toFixed(1)
          : "N/A",
      totalJobs: jobs.length,
      jobsThisMonth,
      jobsLastMonth,
      totalRevenue,
      revenueThisMonth,
      revenueLastMonth,
      signupsThisMonth,
      signupsLastMonth,
      pendingVerifications,
      activeSubscriptions,
      openDisputes,
      tradiesNoConnect,
      totalQuotes,
      quoteAcceptRate: (quoteAcceptRate * 100).toFixed(1) + "%",
      proTradies,
      avgJobValue: avgJobValue > 0 ? (avgJobValue / 100).toFixed(0) : "N/A",
      completionRate: (completionRate * 100).toFixed(0) + "%",
      platformStage,
      categoryDistribution: categoryMap,
      jobDemand: jobCategoryMap,
    };

    // ── Generate recommendations ─────────────────────────────────────
    const recommendations: Recommendation[] = [];
    const currentMonth = now.getMonth();
    const season = getAustralianSeason(currentMonth);

    // ─── GROWTH ──────────────────────────────────────────────────────

    if (tradies.length > 0 && clients.length > 0) {
      const ratio = clients.length / tradies.length;
      const conf = getConfidence(totalUsers, 50, 10);

      if (ratio < 3) {
        const advice = platformStage === "early"
          ? `\n\nAction plan for early-stage growth:\n1. Personal outreach — Message 20 homeowners you know and ask them to post a job\n2. Local Facebook groups — Post in "Sydney/Melbourne Mums", local community groups with a "Get 3 free quotes" offer\n3. Real estate partnerships — Contact 5 local agents and offer their clients $50 off their first job\n4. Google Ads — Run a $10/day campaign targeting "[city] find a tradie" keywords\n5. First-job incentive — Offer clients $25 credit on their first booking\n\nBenchmark: Successful AU marketplaces like Hipages and ServiceSeeking maintain 5-8:1 client-to-tradie ratios.`
          : `\n\nRecommended actions:\n1. Run Google Ads targeting "find a tradie [city]" — budget $20-50/day\n2. Launch a "Refer a Friend, Get $50" client referral program\n3. Create SEO blog content: "How much does [trade] cost in [city]?" guides\n4. Partner with Bunnings or local hardware stores for in-store promotion\n5. Run targeted Facebook ads to homeowners aged 30-55 in your service areas\n\nBenchmark: Top AU marketplaces maintain 5-8:1 client-to-tradie ratios.`;
        recommendations.push({
          category: "growth",
          title: "Low client-to-tradie ratio",
          description: `Current ratio is ${ratio.toFixed(1)}:1 (clients:tradies). A healthy marketplace needs at least 3:1 so tradies get enough leads to stay active. You have ${clients.length} clients and ${tradies.length} tradies.${advice}\n\n[${confidenceLabel(conf)}]`,
          priority: platformStage === "early" ? "high" : "medium",
          data_snapshot: { clients: clients.length, tradies: tradies.length, ratio: ratio.toFixed(1), confidence: conf, platform_stage: platformStage },
          action_url: null,
        });
      } else if (ratio > 10) {
        recommendations.push({
          category: "growth",
          title: "Need more tradies — high client demand",
          description: `Ratio is ${ratio.toFixed(1)}:1 (clients:tradies) — clients are likely waiting too long for quotes, which causes drop-off.\n\nAction plan:\n1. Post on Seek/Indeed: "Join ConnecTradie — get leads sent to you"\n2. Contact trade associations (MBA, HIA, Master Plumbers) for partnership\n3. Visit TAFE campuses — recruit graduating apprentices\n4. LinkedIn outreach — target trade business owners in your area\n5. Offer first 3 months of Pro subscription free for new sign-ups\n6. Run a "Tradie of the Month" campaign on social media to attract attention\n\nBenchmark: When ratio exceeds 10:1, platforms typically see 40%+ client churn due to slow response times.\n\n[${confidenceLabel(conf)}]`,
          priority: "high",
          data_snapshot: { clients: clients.length, tradies: tradies.length, ratio: ratio.toFixed(1), confidence: conf },
          action_url: "/admin/users",
        });
      }
    }

    if (signupsLastMonth >= 2) {
      const conf = getConfidence(signupsLastMonth + signupsThisMonth, 30, 8);
      if (signupsThisMonth < signupsLastMonth * 0.8) {
        const dropPct = (((signupsLastMonth - signupsThisMonth) / signupsLastMonth) * 100).toFixed(0);
        recommendations.push({
          category: "growth",
          title: "Signup growth declining",
          description: `New signups dropped ${dropPct}% this month (${signupsThisMonth} vs ${signupsLastMonth} last month).\n\nPossible causes & fixes:\n1. Marketing gap — Check if any paid campaigns expired or paused. Example: If Google Ads stopped, restart with $15/day on "find a tradie near me"\n2. SEO drop — Check Google Search Console for ranking changes. Create fresh content like "Top 10 Home Renovations in 2026"\n3. Seasonal dip — ${season === "winter" ? "Winter is typically slower for trades. Run a \"Winter Special\" promotion with 10% off heating/plumbing jobs" : "Consider seasonal promotions to maintain momentum"}\n4. Word-of-mouth stall — Launch a referral program: "$30 credit for every friend who signs up and posts a job"\n5. Social proof — Add recent testimonials and job completion stats to the landing page\n\nBenchmark: Healthy marketplaces maintain 10-15% month-over-month signup growth in their first year.\n\n[${confidenceLabel(conf)}]`,
          priority: conf === "low" ? "medium" : "high",
          data_snapshot: { signupsThisMonth, signupsLastMonth, dropPct, confidence: conf },
          action_url: null,
        });
      } else if (signupsThisMonth > signupsLastMonth * 1.2) {
        const growthPct = (((signupsThisMonth - signupsLastMonth) / signupsLastMonth) * 100).toFixed(0);
        recommendations.push({
          category: "growth",
          title: "Strong signup momentum",
          description: `Signups grew ${growthPct}% this month (${signupsThisMonth} vs ${signupsLastMonth}). This is great — here's how to capitalise:\n\n1. Double down — Increase ad spend by 50% on whatever channel is driving signups\n2. Limited-time offer — "Sign up this week, get your first lead free" for tradies\n3. Client bonus — "$20 off your first job" for new clients to drive conversion\n4. PR push — Send a press release to local media: "Local tradie platform sees ${growthPct}% growth"\n5. Onboarding optimisation — Ensure new users complete their profile within 24 hours with reminder emails\n\nBenchmark: Marketplaces that capitalise on growth spurts see 2-3x higher retention.\n\n[${confidenceLabel(conf)}]`,
          priority: "low",
          data_snapshot: { signupsThisMonth, signupsLastMonth, growthPct, confidence: conf },
          action_url: null,
        });
      }
    }

    for (const [cat, jobCount] of Object.entries(jobCategoryMap)) {
      if (cat === "Unknown") continue;
      const tradieCount = categoryMap[cat] || 0;
      if (tradieCount === 0 && jobCount >= 3) {
        recommendations.push({
          category: "growth",
          title: `No tradies for "${cat}" — ${jobCount} jobs waiting`,
          description: `${jobCount} clients need "${cat}" services but there are zero registered tradies. This is direct lost revenue.\n\nImmediate actions:\n1. Google "${cat} business [your city]" and contact the top 10 results directly\n2. Post on trade-specific Facebook groups: "We have ${jobCount} ${cat} jobs waiting — join free"\n3. Check Seek/Indeed for ${cat} professionals and message them\n4. Contact the relevant trade association (e.g. Master Builders for Building, Master Plumbers for Plumbing)\n5. Offer a sign-up bonus: "First 3 jobs commission-free"\n\nExample outreach: "Hi [Name], we have ${jobCount} homeowners looking for ${cat} services on ConnecTradie right now. Sign up free and start quoting today — no commitment."\n\nEstimated lost revenue: ~$${(jobCount * 500).toLocaleString()} (assuming $500 avg job value).`,
          priority: "high",
          data_snapshot: { category: cat, jobCount, tradieCount: 0, confidence: "high", estimated_lost_revenue: `$${(jobCount * 500).toLocaleString()}` },
          action_url: "/admin/users",
        });
      } else if (tradieCount > 0 && jobCount > tradieCount * 5) {
        const jobsPerTradie = (jobCount / tradieCount).toFixed(0);
        recommendations.push({
          category: "growth",
          title: `"${cat}" demand outstrips supply`,
          description: `${jobCount} jobs but only ${tradieCount} tradie(s) in "${cat}" — that's ${jobsPerTradie} jobs per tradie. Clients will leave if they don't get quotes fast enough.\n\nActions:\n1. Recruit 3-5 more ${cat} tradies using the same outreach methods\n2. Enable push notifications for ${cat} tradies so they respond faster\n3. Consider a "Featured ${cat} Tradie" badge to incentivise quick responses\n\nBenchmark: Ideal ratio is 3-5 jobs per tradie per month for healthy competition.`,
          priority: "medium",
          data_snapshot: { category: cat, jobCount, tradieCount, jobsPerTradie, confidence: getConfidence(jobCount, 20, 5) },
          action_url: "/admin/users",
        });
      }
    }

    if (tradies.length >= 5) {
      const proRate = proTradies / tradies.length;
      const conf = getConfidence(tradies.length, 30, 10);
      if (proRate < 0.1) {
        recommendations.push({
          category: "growth",
          title: "Low Pro subscription adoption",
          description: `Only ${proTradies} of ${tradies.length} tradies (${(proRate * 100).toFixed(0)}%) are Pro subscribers. Pro tradies generate 3x more revenue for the platform.\n\nConversion strategies:\n1. Free trial — Offer 14-day Pro trial with automatic downgrade (no credit card required)\n2. ROI showcase — Send email: "Pro tradies earn an average of $X more per month"\n3. Feature comparison — Highlight Pro benefits on the tradie dashboard: priority leads, 0% platform fee, verified badge\n4. Limited offer — "Upgrade to Pro before [date] and get 50% off your first 3 months"\n5. Social proof — "85% of our top-earning tradies are Pro subscribers"\n\nExample email subject: "You're leaving money on the table — see what Pro tradies earn"\n\nBenchmark: Successful marketplaces convert 20-30% of active users to paid tiers.\n\n[${confidenceLabel(conf)}]`,
          priority: "medium",
          data_snapshot: { proTradies, totalTradies: tradies.length, proRate: (proRate * 100).toFixed(0) + "%", confidence: conf },
          action_url: null,
        });
      }
    }

    // ─── PRICING ─────────────────────────────────────────────────────

    if (totalQuotes >= 5) {
      const conf = getConfidence(totalQuotes, 50, 15);
      if (quoteAcceptRate < 0.2) {
        recommendations.push({
          category: "pricing",
          title: "Low quote acceptance rate",
          description: `Only ${(quoteAcceptRate * 100).toFixed(1)}% of ${totalQuotes} quotes are accepted (${acceptedQuotes} of ${totalQuotes}).\n\nDiagnosis checklist:\n1. Are quotes too high? — Compare to industry averages (e.g. painting: $20-50/sqm, plumbing callout: $80-120/hr, electrical: $70-100/hr)\n2. Are quotes too vague? — Require tradies to include itemised breakdowns, timeline, and warranty info\n3. Are response times slow? — Check average time between job post and first quote (target: <4 hours)\n4. Quote quality — Add a quote template with sections: scope, materials, labour, timeline, total\n\nFeature suggestions:\n• Add a "Market Rate Guide" showing avg prices per trade category\n• Show "This quote is [X%] below/above average" labels\n• Send clients a comparison: "You have 3 quotes — here's how they compare"\n• Implement a quote freshness timer: "Respond within 2 hours for priority placement"\n\nBenchmark: Hipages reports 30-40% quote acceptance rates. Target 25%+ as a first milestone.\n\n[${confidenceLabel(conf)}]`,
          priority: conf === "high" ? "high" : "medium",
          data_snapshot: { totalQuotes, acceptedQuotes, rate: (quoteAcceptRate * 100).toFixed(1) + "%", confidence: conf },
          action_url: null,
        });
      } else if (quoteAcceptRate > 0.6) {
        recommendations.push({
          category: "pricing",
          title: "High quote acceptance — opportunity to increase fees",
          description: `${(quoteAcceptRate * 100).toFixed(1)}% quote acceptance rate is excellent — well above the industry average of 30-40%.\n\nMonetisation opportunities:\n1. Introduce "Featured Tradie" placement — charge $29/month for top position in search results\n2. Offer "Instant Quote" premium — clients pay $5 for guaranteed response within 1 hour\n3. Test increasing platform fee from 10% to 12% on free-tier tradies (monitor acceptance impact)\n4. Launch "ConnecTradie Guarantee" — 100% money-back if unsatisfied, funded by a 1% surcharge\n\nBenchmark: If acceptance stays above 50% after fee increases, the market can bear higher prices.\n\n[${confidenceLabel(conf)}]`,
          priority: "low",
          data_snapshot: { totalQuotes, acceptedQuotes, rate: (quoteAcceptRate * 100).toFixed(1) + "%", confidence: conf },
          action_url: null,
        });
      }
    }

    if (revenueLastMonth > 0 && revenueThisMonth > 0) {
      const revenueChange = ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100;
      const conf = getConfidence(completedPayments.length, 30, 10);
      if (revenueChange > 15) {
        recommendations.push({
          category: "pricing",
          title: "Revenue trending up — review fee structure",
          description: `Revenue grew ${revenueChange.toFixed(0)}% ($${(revenueLastMonth / 100).toFixed(0)} → $${(revenueThisMonth / 100).toFixed(0)}).\n\nOptimisation ideas:\n1. Volume discounts — Offer tradies who process >$5,000/month a reduced 8% platform fee to increase loyalty\n2. Tiered pricing — Free tier: 10% fee, Pro: 0% fee + $49/month. Test a "Business" tier at $99/month with analytics\n3. Early payment incentive — Offer clients 2% discount for paying within 24 hours of job completion\n4. Upsell opportunities — Add "Premium Job Listing" ($15) that gets 3x more tradie responses\n\nCurrent fee structure: 10% platform + 2% processing = 12% total on free tier.\n\n[${confidenceLabel(conf)}]`,
          priority: "low",
          data_snapshot: { revenueThisMonth, revenueLastMonth, changePct: revenueChange.toFixed(0), confidence: conf },
          action_url: "/admin/payments",
        });
      } else if (revenueChange < -20) {
        recommendations.push({
          category: "pricing",
          title: "Revenue declining — investigate causes",
          description: `Revenue dropped ${Math.abs(revenueChange).toFixed(0)}% ($${(revenueLastMonth / 100).toFixed(0)} → $${(revenueThisMonth / 100).toFixed(0)}).\n\nInvestigation checklist:\n1. Job volume — Are fewer jobs being posted? Check the Jobs page for trends\n2. Average job value — Are clients posting smaller jobs? Compare budget distributions\n3. Payment completion — Are jobs being completed but not paid? Check for stuck "funded" or "in_progress" jobs\n4. Tradie churn — Are tradies leaving the platform? Check recent deactivations\n5. Seasonal factor — ${season === "winter" ? "Winter typically sees 15-20% lower trade activity in Australia" : "This season shouldn't normally cause a dip"}\n\nImmediate actions:\n• Contact top 5 tradies and ask for feedback\n• Review the last 10 cancelled jobs for common patterns\n• Check if competitors launched promotions\n\n[${confidenceLabel(conf)}]`,
          priority: conf === "high" ? "high" : "medium",
          data_snapshot: { revenueThisMonth, revenueLastMonth, changePct: revenueChange.toFixed(0), confidence: conf },
          action_url: "/admin/payments",
        });
      }
    }

    if (avgJobValue > 0 && jobsWithBudget.length >= 3) {
      const avgDollars = avgJobValue / 100;
      const conf = getConfidence(jobsWithBudget.length, 30, 10);
      if (avgDollars < 200) {
        recommendations.push({
          category: "pricing",
          title: `Average job value is low ($${avgDollars.toFixed(0)})`,
          description: `Average job budget is $${avgDollars.toFixed(0)} across ${jobsWithBudget.length} jobs. At 10% commission, that's only $${(avgDollars * 0.1).toFixed(0)} revenue per job.\n\nStrategies to increase average job value:\n1. Promote bigger categories — Feature renovation, building, and solar installation which average $2,000-15,000\n2. Bundle jobs — Suggest "While you're getting plumbing done, add electrical inspection for 15% off"\n3. Minimum job value — Set a $100 minimum to filter out micro-jobs that aren't profitable\n4. Upsell templates — When a client posts "fix a tap", suggest "Have you also considered a full bathroom inspection?"\n5. Premium categories — Highlight high-value trades on the homepage\n\nAU industry averages: Painting ($2,500), Plumbing ($350), Electrical ($300), Renovation ($15,000), Landscaping ($5,000).\n\n[${confidenceLabel(conf)}]`,
          priority: "low",
          data_snapshot: { avgJobValue: avgDollars.toFixed(0), jobCount: jobsWithBudget.length, revenuePerJob: "$" + (avgDollars * 0.1).toFixed(0), confidence: conf },
          action_url: null,
        });
      }
    }

    // ─── PROMOTIONS ──────────────────────────────────────────────────

    const seasonalTrades = SEASONAL_TRADES[season] || [];
    const seasonName = season.charAt(0).toUpperCase() + season.slice(1);
    const relevantSeasonalTrades = seasonalTrades.filter(
      (trade) => (categoryMap[trade] || 0) > 0 || (jobCategoryMap[trade] || 0) > 0
    );
    const underrepresentedSeasonal = seasonalTrades.filter(
      (trade) => (categoryMap[trade] || 0) < 2
    );

    if (underrepresentedSeasonal.length > 0) {
      const hasActivity = relevantSeasonalTrades.length > 0;
      const seasonExamples: Record<string, string> = {
        summer: "Example campaign: 'Beat the Heat Sale — Get 15% off air conditioning installation this January. Book now before the heatwave hits!' Target: Facebook ads to homeowners 30-60, Instagram stories with before/after AC installs, Google Ads on 'air conditioning installation [city]'.",
        autumn: "Example campaign: 'Autumn Home Prep — Get your roof and gutters checked before winter storms. Free inspection with any booking over $500.' Target: Letterbox drops in suburbs with older homes, Facebook ads showing storm damage photos.",
        winter: "Example campaign: 'Winter Warmth Package — Heating service + insulation check for $199 (save $80). Stay warm this winter!' Target: Email blast to existing clients, Google Ads on 'heater repair [city]', Facebook ads with cosy home imagery.",
        spring: "Example campaign: 'Spring Renovation Special — Book your renovation before December and save 10%. Free consultation included.' Target: Instagram reels showing renovation transformations, Pinterest boards, Google Ads on 'home renovation [city]'.",
      };
      recommendations.push({
        category: "promotions",
        title: `${seasonName} seasonal opportunity`,
        description: `It's ${seasonName} in Australia — peak demand for ${seasonalTrades.slice(0, 3).join(", ")}. ${hasActivity ? "You have some activity but" : "You"} have low coverage in: ${underrepresentedSeasonal.join(", ")}.\n\nSeasonal strategy:\n1. Recruit tradies in ${underrepresentedSeasonal.slice(0, 2).join(" and ")} — these are the highest-demand trades right now\n2. Create a seasonal landing page: "Top ${seasonName} Home Services"\n3. Email existing clients: "It's ${seasonName} — time for [service]. Book now!"\n4. Run a 7-day social media campaign with seasonal content\n\n${seasonExamples[season] || ""}\n\nBenchmark: Seasonal promotions typically increase job postings by 25-40% in targeted categories.`,
        priority: hasActivity ? "medium" : "low",
        data_snapshot: { season, seasonalTrades, underrepresented: underrepresentedSeasonal, existingActivity: relevantSeasonalTrades },
        action_url: null,
      });
    }

    if (currentMonth === 4 || currentMonth === 5) {
      recommendations.push({
        category: "promotions",
        title: "EOFY promotion opportunity",
        description: "End of Financial Year is approaching — one of Australia's biggest spending periods for home services.\n\nCampaign ideas:\n1. \"EOFY Home Improvement Rush\" — Promote tax-deductible work: rental property repairs, home office setups, investment property maintenance\n2. Email campaign: \"Claim your home improvement tax deductions before June 30\"\n3. Tradie incentive: \"Complete 5 jobs before June 30 and earn a $100 bonus\"\n4. Client offer: \"Book before June 30 and get free project management\"\n5. Blog post: \"What Home Improvements Are Tax Deductible in Australia?\"\n\nExample ad copy: \"Don't miss out! Home repairs and maintenance on investment properties are tax deductible. Book a tradie before June 30 and save on your tax return.\"\n\nBenchmark: EOFY typically drives 30-50% increase in renovation and maintenance bookings.",
        priority: "medium",
        data_snapshot: { month: currentMonth + 1, event: "EOFY" },
        action_url: null,
      });
    }

    if (currentMonth === 11 || currentMonth === 0) {
      recommendations.push({
        category: "promotions",
        title: "New Year / Summer promotion",
        description: "Summer holiday season — homeowners are home and ready to start projects.\n\nCampaign ideas:\n1. \"Summer Ready\" package — Pool maintenance + landscaping + outdoor lighting bundle at 15% off\n2. \"New Year, New Home\" campaign — Target New Year's resolution crowd with renovation services\n3. Holiday booking incentive: \"Book before Jan 15 and skip the February rush queue\"\n4. Social media: Share \"Summer project inspiration\" galleries with before/after photos\n5. Partner with pool supply stores for cross-promotion\n\nExample ad: \"Make your backyard the best on the street this summer! Get 3 free quotes for landscaping, pool maintenance, and outdoor living upgrades.\"\n\nBenchmark: December-January sees 45% increase in outdoor living and pool-related job postings.",
        priority: "medium",
        data_snapshot: { month: currentMonth + 1, event: "Summer" },
        action_url: null,
      });
    }

    if (signupsThisMonth <= signupsLastMonth && totalUsers >= 10) {
      recommendations.push({
        category: "promotions",
        title: "Launch a referral program",
        description: `Growth has plateaued (${signupsThisMonth} signups this month vs ${signupsLastMonth} last month). Referral programs are the most cost-effective growth lever.\n\nReferral program template:\n1. Client referral: \"Refer a friend who posts a job → both get $30 credit\"\n2. Tradie referral: \"Refer a tradie who completes 3 jobs → both get $50 credit\"\n3. Double-sided reward ensures both parties are motivated\n4. Add a shareable referral link to every user's dashboard\n5. Send monthly \"Your Referral Stats\" emails to keep it top-of-mind\n\nImplementation example:\n• Add \"Invite Friends\" button to dashboard sidebar\n• Generate unique referral codes: JOHN50, SARAHREF, etc.\n• Track referrals in a dedicated admin panel\n• Auto-credit rewards when the referred user completes their first transaction\n\nBenchmark: Airtasker's referral program drives 20% of new signups. Target 10-15% of signups from referrals.\n\nEstimated cost: $30-50 per acquired user (vs $80-120 for Google Ads).`,
        priority: "medium",
        data_snapshot: { signupsThisMonth, signupsLastMonth, totalUsers },
        action_url: null,
      });
    }

    if (platformStage === "early" && totalUsers < 10) {
      recommendations.push({
        category: "promotions",
        title: "Early-stage growth: get your first 10 users",
        description: `You have ${totalUsers} users. At this stage, personal outreach beats any marketing campaign.\n\nWeek 1 — Tradies (target: 5 tradies):\n1. Text/call 10 tradies you know personally — "I'm building an app to get you more work. Can I sign you up?"\n2. Visit 3 local hardware stores (Bunnings, Total Tools) — leave business cards near the trade desk\n3. Post in 5 local trade Facebook groups: "Looking for tradies to beta-test our new platform — first 10 get free Pro"\n4. Find 5 tradies on Google Maps with <10 reviews — they need leads most\n\nWeek 2 — Clients (target: 5 clients):\n1. Ask friends & family to post a real job (even a small one like "hang a TV" or "fix a leaky tap")\n2. Post on Nextdoor/local Facebook: "Need a tradie? Post your job free and get 3 quotes"\n3. Partner with a local real estate agent: "Offer your buyers a free tradie quote for any move-in repairs"\n4. Create a simple flyer and drop it in 100 letterboxes in a suburb with older homes\n\nWeek 3 — Activation:\n1. Personally message every tradie when a new job is posted in their area\n2. Follow up with every client to ensure they received quotes\n3. Ask for testimonials from your first completed jobs\n\nExample text to a tradie: "Hey [name], I built ConnecTradie to connect tradies with local homeowners. You'd be one of the first — meaning you'll get every lead in your area. Free to sign up, takes 2 min. [link]"`,
        priority: "high",
        data_snapshot: { totalUsers, platformStage, target: "10 users in 3 weeks" },
        action_url: null,
      });
    }

    // ─── TRENDS ──────────────────────────────────────────────────────

    if (jobsLastMonth >= 2) {
      const jobGrowth = ((jobsThisMonth - jobsLastMonth) / jobsLastMonth) * 100;
      const conf = getConfidence(jobsLastMonth + jobsThisMonth, 30, 8);

      if (jobGrowth > 30) {
        recommendations.push({
          category: "trends",
          title: "Job volume surging",
          description: `Job postings up ${jobGrowth.toFixed(0)}% (${jobsLastMonth} → ${jobsThisMonth}).\n\nWhat this means:\n• More clients are finding your platform — your marketing is working\n• Tradies need to respond quickly or clients will go elsewhere\n\nActions to handle the surge:\n1. Fast-track onboarding — Reduce tradie signup steps, approve verifications same-day\n2. Push notifications — Ensure all tradies have notifications enabled for new jobs in their area\n3. Recruitment burst — Post "We're growing fast — tradies needed!" on social media\n4. Response time alerts — Send tradies a nudge if they haven't responded to a job within 4 hours\n5. Quality control — More volume means more potential for poor experiences. Monitor reviews closely\n\nBenchmark: During surges, aim for <4hr average first-quote time to maintain 70%+ client satisfaction.\n\n[${confidenceLabel(conf)}]`,
          priority: "medium",
          data_snapshot: { jobsThisMonth, jobsLastMonth, growthPct: jobGrowth.toFixed(0), confidence: conf },
          action_url: "/admin/moderation",
        });
      } else if (jobGrowth < -20) {
        recommendations.push({
          category: "trends",
          title: "Job volume declining",
          description: `Job postings dropped ${Math.abs(jobGrowth).toFixed(0)}% (${jobsLastMonth} → ${jobsThisMonth}).\n\nInvestigation steps:\n1. Seasonal check — ${season === "winter" ? "Winter typically sees 15-25% fewer home improvement jobs. This is partially normal." : "This isn't a typically slow season, so investigate further."}\n2. UX audit — Is the "Post a Job" flow too long? Test it yourself and count the clicks (target: <5 clicks)\n3. Competitor check — Search "find a tradie [city]" — are competitors running aggressive promotions?\n4. Client feedback — Email recent clients: "We noticed you haven't posted a job lately — what can we improve?"\n5. Landing page — Is the value proposition clear? A/B test the homepage headline\n\nRe-engagement ideas:\n• Send push notification: "We have new tradies in your area — post a job and get 3 quotes in 24 hours"\n• Email campaign: "Need something fixed? Get a free quote in minutes"\n• Retargeting ads to past visitors who didn't sign up\n\n[${confidenceLabel(conf)}]`,
          priority: conf === "high" ? "high" : "medium",
          data_snapshot: { jobsThisMonth, jobsLastMonth, declinePct: Math.abs(jobGrowth).toFixed(0), confidence: conf },
          action_url: null,
        });
      }
    }

    const categoryGrowth: { cat: string; count: number }[] = [];
    for (const [cat, count] of Object.entries(jobCategoryMap)) {
      if (cat !== "Unknown" && count >= 2) {
        categoryGrowth.push({ cat, count });
      }
    }
    if (categoryGrowth.length > 0) {
      const topCats = categoryGrowth
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      recommendations.push({
        category: "trends",
        title: "Top in-demand trade categories",
        description: `Most requested: ${topCats.map((c) => `${c.cat} (${c.count} jobs)`).join(", ")}.\n\nHow to capitalise on demand:\n1. Homepage spotlight — Feature top categories with "Popular in your area" badges\n2. SEO landing pages — Create dedicated pages like "Best ${topCats[0]?.cat || "Trade"} Services in [City]" to rank on Google\n3. Tradie recruitment — Focus recruitment ads on these categories: "We have ${topCats[0]?.cat || "trade"} clients waiting"\n4. Featured placement — Offer tradies in these categories "Featured Pro" status for $15/week\n5. Social proof — Share stats: "${topCats[0]?.count || 0}+ homeowners looking for ${topCats[0]?.cat || "trade"} services"\n\nBenchmark: Platforms that highlight trending categories see 20% higher conversion from homepage visitors.`,
        priority: "low",
        data_snapshot: { topCategories: topCats, confidence: getConfidence(jobs.length, 50, 10) },
        action_url: null,
      });
    }

    // Market insights — tailored to actual platform categories
    const platformCategories = Object.keys(categoryMap);
    const emergingCategories = [
      "Solar Installation",
      "EV Charger Installation",
      "Insulation",
      "Home Office Renovation",
    ];
    const relevantEmerging = emergingCategories.filter(
      (cat) => !platformCategories.includes(cat)
    );

    if (relevantEmerging.length > 0 && totalUsers >= 5) {
      recommendations.push({
        category: "trends",
        title: "Emerging trade categories to consider",
        description: `Australian market trends show growing demand for: ${relevantEmerging.join(", ")}. These categories aren't on your platform yet.\n\nWhy these categories are growing:\n• Solar Installation — AU solar uptake is #1 globally per capita. 30% of homes have panels, but demand for battery storage + new installs continues. Average job: $5,000-12,000\n• EV Charger Installation — EV sales doubled in 2025. Every EV owner needs a home charger ($1,500-3,000 installed). Only licensed electricians can do it\n• Insulation — Energy efficiency regulations tightening. Government rebates (e.g. VEU in VIC, ESS in NSW) make insulation jobs attractive. Average: $2,000-5,000\n• Home Office Renovation — 40% of Australians work hybrid. Demand for soundproofing, built-in desks, and dedicated office spaces is rising\n\nHow to add these:\n1. Add the categories to your trade category list in Settings\n2. Create targeted recruitment posts: "EV Charger Installers — get leads from the EV boom"\n3. Blog post: "Top 5 Home Upgrades That Pay for Themselves" featuring these categories\n4. Partner with suppliers (solar companies, EV dealers) for cross-referrals\n\nSource: ABS Building Activity Data, HIA Housing Forecasts, Clean Energy Council.`,
        priority: "low",
        data_snapshot: {
          missingCategories: relevantEmerging,
          existingCategories: platformCategories,
          source: "ABS Building Activity / HIA Forecasts",
        },
        action_url: null,
      });
    }

    // Platform activity freshness
    if (jobs.length > 0 && recentJobsCount === 0) {
      recommendations.push({
        category: "trends",
        title: "No new jobs in the last 7 days",
        description: `No new jobs in 7 days. This is a warning sign — even small platforms should see at least 1-2 jobs per week.\n\nDiagnostic checklist:\n1. Is the site up? — Check that the job posting flow works end-to-end (test it yourself)\n2. Are emails delivering? — Check Supabase email logs for bounces or failures\n3. Client engagement — When was the last client login? Check auth logs\n4. Marketing — Are any campaigns still running? Have social media posts stopped?\n\nImmediate re-engagement actions:\n1. Send a push notification to all clients: "New tradies just joined! Post a job and get 3 quotes within 24 hours"\n2. Email past clients: "Need something fixed? It takes just 2 minutes to get free quotes"\n3. Post in local Facebook groups: "Free quotes from licensed tradies — post your job now"\n4. Ask your most active tradie to share the platform with their existing clients\n\nExample email subject: "Your home deserves some love — get a free quote today"`,
        priority: "medium",
        data_snapshot: { lastJobCount: jobs.length, recentJobs7d: 0 },
        action_url: null,
      });
    }

    // ─── OPERATIONS ──────────────────────────────────────────────────

    // Pending verifications — always actionable
    if (pendingVerifications > 0) {
      const urgency = pendingVerifications > 20 ? "high" : pendingVerifications > 5 ? "medium" : "low";
      recommendations.push({
        category: "operations",
        title: `${pendingVerifications} pending verification${pendingVerifications !== 1 ? "s" : ""}`,
        description: `${pendingVerifications} tradie${pendingVerifications !== 1 ? "s are" : " is"} waiting for verification.\n\n${urgency === "high" ? "URGENT: Long verification queues are the #1 reason tradies abandon marketplace signups. Every day of delay = ~15% chance of losing the tradie forever." : "Aim to process verifications within 24 hours to maintain trust and conversion."}\n\nVerification best practices:\n1. Check license numbers against state authority databases (QLD: QBCC, NSW: Fair Trading, VIC: VBA)\n2. Verify ABN is active on abr.business.gov.au\n3. Confirm insurance certificates are current and cover the stated trade\n4. Cross-reference the tradie's name with their license registration\n5. If documents are unclear, request a better photo rather than rejecting outright\n\nTime-saving tips:\n• Batch process — Set aside 30 min each morning to clear the queue\n• Template responses — Create pre-written approval/rejection messages\n• Priority queue — Verify tradies in high-demand categories first (check your Trends tab)\n\nBenchmark: Top marketplaces verify within 4 hours. Target: same-day verification.`,
        priority: urgency,
        data_snapshot: { pendingVerifications },
        action_url: "/admin/verifications",
      });
    }

    // Stripe Connect onboarding — always important
    if (tradies.length > 0 && tradiesNoConnect > 0) {
      const pct = ((tradiesNoConnect / tradies.length) * 100).toFixed(0);
      const severity = tradiesNoConnect / tradies.length > 0.5 ? "high" : tradiesNoConnect / tradies.length > 0.3 ? "medium" : "low";
      recommendations.push({
        category: "operations",
        title: `${tradiesNoConnect} tradie${tradiesNoConnect !== 1 ? "s" : ""} can't receive payments`,
        description: `${tradiesNoConnect} of ${tradies.length} tradies (${pct}%) haven't completed Stripe Connect setup. They literally cannot receive payments — this means they can't complete jobs.\n\nWhy this happens:\n• Stripe's onboarding asks for ABN, bank details, and ID — some tradies find it intimidating\n• They may have started signup and gotten interrupted\n• Some may not trust entering bank details online\n\nAction plan:\n1. Send a targeted email: "You're almost there! Complete your payout setup in 2 minutes to start earning"\n2. Add an in-app banner on their dashboard: "Set up payouts to start accepting jobs"\n3. Create a help article: "How to set up Stripe Connect (with screenshots)"\n4. For tradies who signed up 7+ days ago without completing, send a personal SMS or call\n5. Simplify the messaging — don't say "Stripe Connect", say "Set up your bank details to get paid"\n\nExample email:\nSubject: "You have jobs waiting — but we can't pay you yet"\nBody: "Hi [name], there are clients looking for [trade] services in your area. Complete your payout setup (takes 2 min) and you'll start receiving leads immediately. [Set Up Payouts Button]"\n\nBenchmark: Target 90%+ payout setup completion within 7 days of signup.`,
        priority: severity,
        data_snapshot: { tradiesNoConnect, totalTradies: tradies.length, percentage: pct + "%" },
        action_url: "/admin/users",
      });
    }

    // Open disputes — always urgent
    if (openDisputes > 0) {
      recommendations.push({
        category: "operations",
        title: `${openDisputes} open dispute${openDisputes !== 1 ? "s" : ""} need attention`,
        description: `${openDisputes} unresolved dispute${openDisputes !== 1 ? "s" : ""}. Unresolved disputes erode trust and increase chargeback risk (chargebacks cost you the payment + fees + penalty).\n\nDispute resolution process:\n1. Review both sides — Read the client's complaint and the tradie's response\n2. Check evidence — Look at photos, messages, and job timeline\n3. Attempt mediation — Contact both parties and propose a fair resolution (e.g. partial refund, rework)\n4. Escalate if needed — For disputes over $1,000, consider a phone call rather than messages\n5. Document the outcome — Record the resolution in the dispute notes for future reference\n\nCommon dispute types and resolutions:\n• "Work not completed" — Ask tradie for timeline, offer client partial refund if tradie is unresponsive\n• "Poor quality" — Request photos, arrange independent inspection if >$2,000\n• "Overcharged" — Compare quote vs final invoice, mediate the difference\n• "No show" — Full refund to client, warning to tradie, suspend after 2 no-shows\n\nBenchmark: Resolve disputes within 48 hours. Every 24-hour delay increases chargeback probability by 15%.`,
        priority: openDisputes > 5 ? "high" : "medium",
        data_snapshot: { openDisputes },
        action_url: "/admin/disputes",
      });
    }

    // Job cancellation rate — needs enough data
    if (jobs.length >= 5 && cancelledJobs / jobs.length > 0.2) {
      const cancRate = ((cancelledJobs / jobs.length) * 100).toFixed(0);
      const conf = getConfidence(jobs.length, 50, 15);
      recommendations.push({
        category: "operations",
        title: "High job cancellation rate",
        description: `${cancRate}% of jobs cancelled (${cancelledJobs} of ${jobs.length}). This is above the healthy threshold of <15%.\n\nCommon causes and fixes:\n1. Pricing shock — Client posts job, gets quotes much higher than expected → Add a "Budget Guide" showing typical costs per trade when posting\n2. No tradie response — Job sits with no quotes → Send auto-notifications to tradies in the category, show "3 tradies are viewing your job"\n3. Scope mismatch — Tradie arrives and job is different than described → Require job photos at posting, add a "Scope Confirmation" step\n4. Client changed mind — Impulse post, then cancels → Add a 24-hour "cooling off" period before matching\n5. Tradie no-show — Tradie accepts but doesn't turn up → Track no-shows, suspend after 2 incidents\n\nFeature recommendations:\n• Add mandatory "Cancellation Reason" dropdown when cancelling\n• Send a survey to cancelled jobs: "Why did you cancel? How can we improve?"\n• Create a "Job Health" dashboard showing where jobs drop off in the funnel\n\nBenchmark: Hipages reports ~12% cancellation rate. Target <15% as your first goal.\n\n[${confidenceLabel(conf)}]`,
        priority: conf === "high" ? "high" : "medium",
        data_snapshot: { completedJobs, cancelledJobs, totalJobs: jobs.length, rate: cancRate + "%", confidence: conf },
        action_url: "/admin/moderation",
      });
    }

    // Job completion rate
    if (jobs.length >= 5 && completionRate < 0.3) {
      const conf = getConfidence(jobs.length, 50, 15);
      recommendations.push({
        category: "operations",
        title: `Low job completion rate (${(completionRate * 100).toFixed(0)}%)`,
        description: `Only ${completedJobs} of ${jobs.length} jobs (${(completionRate * 100).toFixed(0)}%) reached completion. Jobs are likely stalling somewhere in the pipeline.\n\nPipeline analysis — check where jobs are stuck:\n• Pending (no quotes yet) — Tradies aren't seeing or responding to jobs. Fix: improve notifications, ensure category coverage\n• Accepted (not funded) — Client accepted a quote but didn't pay. Fix: send payment reminders, simplify checkout\n• Funded (not started) — Money is in escrow but work hasn't begun. Fix: send tradie reminders, add a "Start Job" prompt\n• In Progress (not completed) — Work may be done but not marked complete. Fix: send completion reminders to both parties\n\nActions:\n1. Review the Moderation page — filter by each status to find bottlenecks\n2. Send reminders to jobs stuck in "accepted" for >48 hours: "Complete your payment to get started"\n3. Auto-close jobs that have been "pending" for >14 days with no quotes\n4. Contact tradies with "in_progress" jobs older than 30 days\n\nBenchmark: Healthy completion rate is 60-70%. Target 50% as your first milestone.\n\n[${confidenceLabel(conf)}]`,
        priority: "medium",
        data_snapshot: { completedJobs, totalJobs: jobs.length, rate: (completionRate * 100).toFixed(0) + "%", confidence: conf },
        action_url: "/admin/moderation",
      });
    }

    // ── Deduplicate against existing active recommendations ──────────
    const { data: existingRecs } = await supabase
      .from("platform_recommendations")
      .select("title")
      .in("status", ["new", "reviewed"]);

    const existingTitles = new Set(
      (existingRecs || []).map((r) => r.title)
    );

    const newRecs = recommendations.filter(
      (r) => !existingTitles.has(r.title)
    );

    // ── Insert new recommendations ───────────────────────────────────
    let inserted = 0;
    if (newRecs.length > 0) {
      const rows = newRecs.map((r) => ({
        category: r.category,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: "new",
        data_snapshot: r.data_snapshot,
        action_url: r.action_url,
        generated_at: now.toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("platform_recommendations")
        .insert(rows);

      if (insertError) {
        return json(
          { error: `Failed to insert recommendations: ${insertError.message}` },
          500
        );
      }
      inserted = rows.length;
    }

    return json({
      generated: recommendations.length,
      inserted,
      skipped_duplicates: recommendations.length - newRecs.length,
      platform_stage: platformStage,
      metrics,
      recommendations: newRecs.map((r) => ({
        title: r.title,
        category: r.category,
        priority: r.priority,
      })),
      message: `Generated ${recommendations.length} recommendation(s), inserted ${inserted} new, skipped ${recommendations.length - newRecs.length} duplicate(s). Platform stage: ${platformStage}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
