import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(
  key: string, maxRequests: number, windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (entry.count >= maxRequests) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string;
  subject: string;
  body: string;
  notificationType?: string;
  metadata?: Record<string, unknown>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only allow http(s) URLs in email CTA buttons. metadata.link is
// caller-controlled, so a raw href could otherwise be `javascript:`/`data:`
// (script/redirect vector) inside a ConnecTradie-branded email. Anything that
// isn't a valid absolute http(s) URL falls back to the dashboard.
function safeHref(raw: string): string {
  const fallback = "https://connectradie.com/dashboard";
  try {
    const u = new URL(String(raw ?? "").trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : fallback;
  } catch {
    return fallback;
  }
}

function buildHtmlEmail(subject: string, body: string, notificationType?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#1e40af;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">ConnecTradie</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              <a href="https://connectradie.com/dashboard" style="display:inline-block;background-color:#1e40af;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">View in App</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                You received this email because of activity on your ConnecTradie account.
                To manage your notification preferences, visit your Settings page.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Advanced template system ---

function emailShell(accentColor: string, innerHtml: string, subject: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:${accentColor};padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">ConnecTradie</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                You received this email because of activity on your ConnecTradie account.
                To manage your notification preferences, visit your Settings page.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, href: string, color: string): string {
  return `<a href="${escapeHtml(safeHref(href))}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>`;
}

function buildLeadJobEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
  notificationType: string,
): string {
  const accent = "#059669";
  const category = metadata.category ? String(metadata.category) : "";
  const suburb = metadata.suburb ? String(metadata.suburb) : "";
  const title = metadata.jobTitle ? String(metadata.jobTitle) : "";

  let ctaLabel = "View in App";
  if (notificationType === "NEW_FLASH_LEAD") ctaLabel = "View Lead";
  else if (notificationType === "JOB_ACCEPTED") ctaLabel = "View Job";
  else if (notificationType === "JOB_COMPLETED") ctaLabel = "Leave a Review";

  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/dashboard";

  const hasDetails = category || suburb || title;

  const detailsCard = hasDetails
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    ${title ? `<p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">${escapeHtml(title)}</p>` : ""}
                    ${category ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr><td style="background-color:#059669;color:#ffffff;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;">${escapeHtml(category)}</td></tr></table>` : ""}
                    ${suburb ? `<p style="margin:0;color:#374151;font-size:14px;">${escapeHtml(suburb)}</p>` : ""}
                  </td>
                </tr>
              </table>`
    : "";

  const inner = `<h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              ${detailsCard}
              ${ctaButton(ctaLabel, link, accent)}`;

  return emailShell(accent, inner, subject);
}

function buildFinancialEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
  notificationType: string,
): string {
  const accent = "#1e40af";
  const amount = metadata.amount ? String(metadata.amount) : "";
  const reference = metadata.reference ? String(metadata.reference) : "";

  let ctaLabel = "View in App";
  if (notificationType === "INVOICE_RECEIVED") ctaLabel = "View Invoice";
  else if (notificationType === "QUOTE_RECEIVED") ctaLabel = "View Quote";
  else if (notificationType === "PAYMENT_RECEIVED") ctaLabel = "View Payment";

  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/dashboard";

  const amountBox = amount
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td align="center" style="padding:24px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Amount</p>
                    <p style="margin:0;color:#1e40af;font-size:28px;font-weight:700;">${escapeHtml(amount)}</p>
                    ${reference ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">Ref: ${escapeHtml(reference)}</p>` : ""}
                  </td>
                </tr>
              </table>`
    : "";

  const inner = `<h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              ${amountBox}
              ${ctaButton(ctaLabel, link, accent)}`;

  return emailShell(accent, inner, subject);
}

function buildBookingEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
  notificationType: string,
): string {
  const accent = "#7c3aed";
  const scheduledDate = metadata.scheduledDate ? String(metadata.scheduledDate) : "";
  const scheduledTime = metadata.scheduledTime ? String(metadata.scheduledTime) : "";
  const address = metadata.address ? String(metadata.address) : "";
  const oldDate = metadata.oldDate ? String(metadata.oldDate) : "";
  const newDate = metadata.newDate ? String(metadata.newDate) : "";

  const isTimeChange = notificationType === "TIME_CHANGE_REQUEST";

  let ctaLabel = "View Booking";
  if (isTimeChange) ctaLabel = "Review Change";

  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/dashboard";

  let dateCard = "";
  if (isTimeChange && (oldDate || newDate)) {
    dateCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    ${oldDate ? `<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Previous: <span style="text-decoration:line-through;">${escapeHtml(oldDate)}</span></p>` : ""}
                    ${newDate ? `<p style="margin:0;color:#7c3aed;font-size:16px;font-weight:600;">Proposed: ${escapeHtml(newDate)}</p>` : ""}
                  </td>
                </tr>
              </table>`;
  } else if (scheduledDate) {
    dateCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Scheduled Date</p>
                    <p style="margin:0;color:#7c3aed;font-size:16px;font-weight:600;">${escapeHtml(scheduledDate)}${scheduledTime ? ` at ${escapeHtml(scheduledTime)}` : ""}</p>
                  </td>
                </tr>
              </table>`;
  }

  const addressBlock = address
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="padding:0;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Address</p>
                    <p style="margin:0;color:#374151;font-size:14px;">${escapeHtml(address)}</p>
                  </td>
                </tr>
              </table>`
    : "";

  const inner = `<h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              ${dateCard}
              ${addressBlock}
              ${ctaButton(ctaLabel, link, accent)}`;

  return emailShell(accent, inner, subject);
}

function buildReminderEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
): string {
  const accent = "#d97706";
  const daysLeft = metadata.daysLeft != null ? String(metadata.daysLeft) : "";
  const steps = Array.isArray(metadata.steps) ? metadata.steps.map(String) : [];

  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/dashboard";

  const urgencyBanner = daysLeft
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td align="center" style="padding:20px 16px;">
                    <p style="margin:0 0 4px;color:#92400e;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Expires in</p>
                    <p style="margin:0;color:#d97706;font-size:32px;font-weight:700;">${escapeHtml(daysLeft)} day${daysLeft === "1" ? "" : "s"}</p>
                  </td>
                </tr>
              </table>`
    : "";

  const stepsList = steps.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                ${steps.map((step, i) => `<tr>
                  <td style="padding:6px 0;color:#374151;font-size:14px;line-height:1.5;">
                    <span style="display:inline-block;width:24px;height:24px;background-color:#d97706;color:#ffffff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:8px;">${i + 1}</span>
                    ${escapeHtml(step)}
                  </td>
                </tr>`).join("")}
              </table>`
    : "";

  const inner = `<h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              ${urgencyBanner}
              ${stepsList}
              ${ctaButton("Update License Now", link, accent)}`;

  return emailShell(accent, inner, subject);
}

// --- Template router ---

const TEMPLATE_CATEGORY_MAP: Record<string, string> = {
  NEW_FLASH_LEAD: "lead_job",
  JOB_ACCEPTED: "lead_job",
  JOB_COMPLETED: "lead_job",
  INVOICE_RECEIVED: "financial",
  QUOTE_RECEIVED: "financial",
  PAYMENT_RECEIVED: "financial",
  JOB_BOOKING_CONFIRMED: "booking",
  TIME_CHANGE_REQUEST: "booking",
  BOOKING_REMINDER: "booking",
  LICENSE_EXPIRING: "reminder",
};

function buildEmailHtml(
  subject: string,
  body: string,
  notificationType?: string,
  metadata?: Record<string, unknown>,
): string {
  if (!notificationType) {
    return buildHtmlEmail(subject, body, notificationType);
  }

  const category = TEMPLATE_CATEGORY_MAP[notificationType];
  const meta = metadata || {};

  switch (category) {
    case "lead_job":
      return buildLeadJobEmail(subject, body, meta, notificationType);
    case "financial":
      return buildFinancialEmail(subject, body, meta, notificationType);
    case "booking":
      return buildBookingEmail(subject, body, meta, notificationType);
    case "reminder":
      return buildReminderEmail(subject, body, meta);
    default:
      return buildHtmlEmail(subject, body, notificationType);
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate the caller — accepts either a user JWT or the service-role key.
    // Internal callers (stripe-webhook, cron jobs) use the service-role key.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.slice(7);
    const isServiceRole = token === supabaseServiceKey;
    const isAnonKey = token === supabaseAnonKey;

    // Service-role key: trusted internal caller — skip user auth
    // Anon key: likely Supabase cron scheduler — also trusted
    if (!isServiceRole && !isAnonKey) {
      // Must be a user JWT — validate it
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const requiredEnvVars = ['RESEND_API_KEY'];
    for (const envVar of requiredEnvVars) {
      if (!Deno.env.get(envVar)) {
        return new Response(JSON.stringify({ error: `Missing required configuration: ${envVar}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "notifications@connectradie.com";

    const { to, subject, body, notificationType, metadata }: EmailRequest = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: 20 requests per minute per recipient
    const rateLimitKey = `${to}-send-email`;
    const { allowed } = checkRateLimit(rateLimitKey, 20, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Remaining": "0" },
        },
      );
    }

    const html = buildEmailHtml(subject, body, notificationType, metadata);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `ConnecTradie <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "Email delivery failed",
          details: resendData.message || "Unknown Resend error",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: resendData.id,
        notificationType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
