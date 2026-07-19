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
  // Legacy / trusted-internal callers may still pass a raw address. Untrusted
  // (user-JWT) callers should send recipientUserId so the address is resolved
  // server-side and cannot be spoofed.
  to?: string;
  recipientUserId?: string;
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

// Generic notification email. Delegates to the shared, branded shell so every
// message — even ones without a specific template — carries the logo and styling.
function buildHtmlEmail(subject: string, body: string, _notificationType?: string): string {
  const accent = BRAND_GREEN;
  const inner = `<h1 style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:700;line-height:1.35;letter-spacing:-0.01em;">${escapeHtml(subject)}</h1>
              <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.65;">${escapeHtml(body)}</p>
              ${ctaButton("View in App", "https://connectradie.com/dashboard", accent)}`;
  return emailShell(accent, inner, subject);
}

// --- Advanced template system ---

// Brand tokens. The logo is served from the production site (public/brand/…),
// so it resolves in any email client that loads images.
const BRAND_GREEN = "#06D6A0";
const LOGO_URL = "https://connectradie.com/brand/connectradie-wordmark.png";

// Shared, branded email shell: a slim accent rule, the logo on white, the
// message body, and a quiet footer. `accentColor` tints the top rule and the
// primary button so category emails (leads = green, payments = blue) stay
// distinct without a heavy coloured banner.
function emailShell(accentColor: string, innerHtml: string, subject: string, footerHtml?: string): string {
  const accent = accentColor || BRAND_GREEN;
  const footer = footerHtml ?? `You're receiving this because of activity on your ConnecTradie account. Manage your notifications any time in Settings.`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(subject)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f6;padding:32px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6eaef;">
          <tr>
            <td style="height:4px;line-height:4px;font-size:0;background-color:${accent};">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:26px 32px 20px;">
              <img src="${LOGO_URL}" alt="ConnecTradie" height="26" style="display:block;height:26px;width:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 34px;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px;background-color:#f8fafc;border-top:1px solid #eef2f6;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">${footer}</p>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;color:#b6c0cc;font-size:11px;line-height:1.5;">© ConnecTradie · Australia&rsquo;s tradie marketplace &nbsp;·&nbsp; Quoting is free — you only pay when you get paid.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Bulletproof-ish CTA: table-wrapped so the full pill renders in Outlook too.
function ctaButton(label: string, href: string, color: string): string {
  const safe = escapeHtml(safeHref(href));
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 0;"><tr>
                <td align="center" style="border-radius:10px;background-color:${color};">
                  <a href="${safe}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:1;border-radius:10px;">${escapeHtml(label)}</a>
                </td>
              </tr></table>`;
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

// A dedicated, polished invoice/payment email for OFF-APP clients (no account).
// Bespoke HTML (not the generic shell): brand header + "INVOICE" tag, an
// "Amount due" hero, a strong "Pay {amount} securely" CTA, a trust row, and a
// warm account-free footer. Metadata: amount, link, service?, businessName?.
function buildInvoiceEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
): string {
  const amount = metadata.amount ? String(metadata.amount) : "";
  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/dashboard";
  const service = metadata.service ? String(metadata.service) : "";
  const business = metadata.businessName ? String(metadata.businessName) : "";
  const href = safeHref(link);
  const payLabel = amount ? `Pay ${amount} securely` : "Pay securely";
  const heading = service ? `${service} invoice` : "Your invoice";
  const preheader = amount
    ? `Your invoice for ${amount} — pay securely by card, no account needed.`
    : "Your invoice — pay securely by card.";

  const amountHero = amount
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;background-color:#f8fafc;margin:0 0 28px;">
                <tr><td align="center" style="padding:28px 20px;">
                  <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">Amount due</p>
                  <p style="margin:0;color:#0f172a;font-size:40px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">${escapeHtml(amount)}</p>
                  ${service ? `<p style="margin:10px 0 0;color:#64748b;font-size:14px;">for ${escapeHtml(service)}</p>` : ""}
                </td></tr>
              </table>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f4;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,27,45,0.08);">
        <tr><td style="background-color:#0f1b2d;padding:26px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Connec<span style="color:#2dd4a7;">Tradie</span></td>
            <td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#8ba0b4;text-transform:uppercase;">Invoice</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 32px 4px;">
          <p style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(heading)}</p>
          <p style="margin:0 0 26px;color:#64748b;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
          ${amountHero}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${escapeHtml(href)}" style="display:inline-block;width:100%;max-width:320px;box-sizing:border-box;background-color:#059669;color:#ffffff;text-decoration:none;text-align:center;padding:16px 24px;border-radius:12px;font-weight:700;font-size:16px;letter-spacing:-0.01em;box-shadow:0 2px 10px rgba(5,150,105,0.30);">${escapeHtml(payLabel)}</a>
          </td></tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td align="center">
            <p style="margin:0;color:#94a3b8;font-size:12.5px;line-height:1.7;">&#128274; Secure card payment, powered by Stripe.<br>No ConnecTradie account needed &mdash; just tap and pay.</p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:22px 32px;border-top:1px solid #eef1f4;background-color:#fbfcfd;">
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">This invoice was sent to you securely through ConnecTradie${business ? ` on behalf of ${escapeHtml(business)}` : ""}. If you weren&rsquo;t expecting it, you can safely ignore this email.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#b6c0cc;font-size:11px;">ConnecTradie &middot; Australian tradie marketplace</p>
    </td></tr>
  </table>
</body>
</html>`;
}

// External (manual-payment) invoice email for OFF-APP clients paying by bank
// transfer / cash — NO Stripe pay button. Same polished brand shell as
// buildInvoiceEmail, but the CTA is replaced by a "Pay by bank transfer" details
// card (BSB / account / reference) plus ABN + GST line for a proper tax invoice.
// Metadata: amount, service?, businessName?, abn?, gstNote?, bankName?, bsb?,
// accountName?, accountNumber?, reference?, dueDate?.
function buildExternalInvoiceEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
): string {
  const amount = metadata.amount ? String(metadata.amount) : "";
  const service = metadata.service ? String(metadata.service) : "";
  const business = metadata.businessName ? String(metadata.businessName) : "";
  const abn = metadata.abn ? String(metadata.abn) : "";
  const gstNote = metadata.gstNote ? String(metadata.gstNote) : "";
  const bankName = metadata.bankName ? String(metadata.bankName) : "";
  const bsb = metadata.bsb ? String(metadata.bsb) : "";
  const accountName = metadata.accountName ? String(metadata.accountName) : "";
  const accountNumber = metadata.accountNumber ? String(metadata.accountNumber) : "";
  const reference = metadata.reference ? String(metadata.reference) : "";
  const dueDate = metadata.dueDate ? String(metadata.dueDate) : "";

  const heading = service ? `${service} invoice` : "Your invoice";
  const preheader = amount
    ? `Your invoice for ${amount}${business ? ` from ${business}` : ""} — pay by bank transfer.`
    : "Your invoice — pay by bank transfer.";

  const amountHero = amount
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;background-color:#f8fafc;margin:0 0 26px;">
                <tr><td align="center" style="padding:26px 20px;">
                  <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">Amount due</p>
                  <p style="margin:0;color:#0f172a;font-size:38px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;">${escapeHtml(amount)}</p>
                  ${dueDate ? `<p style="margin:10px 0 0;color:#64748b;font-size:13px;">Due by ${escapeHtml(dueDate)}</p>` : ""}
                  ${gstNote ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${escapeHtml(gstNote)}</p>` : ""}
                </td></tr>
              </table>`
    : "";

  const row = (label: string, value: string) =>
    value
      ? `<tr>
                  <td style="padding:8px 0;color:#64748b;font-size:13px;">${escapeHtml(label)}</td>
                  <td align="right" style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
                </tr>`
      : "";

  const hasBank = bsb || accountNumber || accountName;
  const bankCard = hasBank
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;margin:0 0 22px;">
                <tr><td style="padding:6px 20px 14px;">
                  <p style="margin:14px 0 6px;color:#0f172a;font-size:14px;font-weight:700;">Pay by bank transfer</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${row("Account name", accountName)}
                    ${row("BSB", bsb)}
                    ${row("Account number", accountNumber)}
                    ${bankName ? row("Bank", bankName) : ""}
                    ${reference ? row("Reference", reference) : ""}
                  </table>
                </td></tr>
              </table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fde68a;background-color:#fffbeb;border-radius:14px;margin:0 0 22px;">
                <tr><td style="padding:16px 20px;">
                  <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">Bank transfer details will be provided separately${business ? ` by ${escapeHtml(business)}` : ""}.</p>
                </td></tr>
              </table>`;

  const abnLine = abn
    ? `<p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">${business ? `${escapeHtml(business)} · ` : ""}ABN ${escapeHtml(abn)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f4;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,27,45,0.08);">
        <tr><td style="background-color:#0f1b2d;padding:26px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Connec<span style="color:#2dd4a7;">Tradie</span></td>
            <td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#8ba0b4;text-transform:uppercase;">Tax Invoice</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:34px 32px 4px;">
          ${abnLine}
          <p style="margin:${abn ? "4px" : "0"} 0 8px;color:#0f172a;font-size:20px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(heading)}</p>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
          ${amountHero}
          ${bankCard}
          <p style="margin:0;color:#94a3b8;font-size:12.5px;line-height:1.7;">Once you've paid, no further action is needed — ${business ? escapeHtml(business) : "your tradie"} will mark this invoice as settled.</p>
        </td></tr>
        <tr><td style="padding:22px 32px;border-top:1px solid #eef1f4;background-color:#fbfcfd;">
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">This invoice was sent to you through ConnecTradie${business ? ` on behalf of ${escapeHtml(business)}` : ""}. If you weren&rsquo;t expecting it, you can safely ignore this email.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#b6c0cc;font-size:11px;">ConnecTradie &middot; Australian tradie marketplace</p>
    </td></tr>
  </table>
</body>
</html>`;
}

// A quote goes to an OFF-APP client with no ConnecTradie account, so it gets its
// own warmer, account-free template (the generic "financial" one talks about
// "your account" and "Settings", which would confuse the recipient).
function buildQuoteEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
): string {
  const accent = "#059669"; // emerald — matches the Accept button on the quote page
  const amount = metadata.amount ? String(metadata.amount) : "";
  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/dashboard";

  const priceBox = amount
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td align="center" style="padding:24px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Quoted price</p>
                    <p style="margin:0;color:#047857;font-size:28px;font-weight:700;">${escapeHtml(amount)}</p>
                  </td>
                </tr>
              </table>`
    : "";

  const inner = `<h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              ${priceBox}
              ${ctaButton("View & accept quote", link, accent)}
              <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">No payment is taken now — the button above just opens your quote to view and accept.</p>`;

  const footer = `This quote was sent to you through ConnecTradie. You don't need an account to view or accept it.`;

  return emailShell(accent, inner, subject, footer);
}

// Sent to the TRADIE when their client accepts a quote — a "you won the job"
// moment. The tradie has an account, so the default footer applies.
function buildQuoteAcceptedEmail(
  subject: string,
  body: string,
  metadata: Record<string, unknown>,
): string {
  const accent = "#059669";
  const amount = metadata.amount ? String(metadata.amount) : "";
  const link = metadata.link ? String(metadata.link) : "https://connectradie.com/work";

  const amountBox = amount
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td align="center" style="padding:24px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Quote value</p>
                    <p style="margin:0;color:#047857;font-size:28px;font-weight:700;">${escapeHtml(amount)}</p>
                  </td>
                </tr>
              </table>`
    : "";

  const inner = `<h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(subject)}</h2>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
              ${amountBox}
              ${ctaButton("View job", link, accent)}`;

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
  INVOICE_RECEIVED: "invoice",
  INVOICE_EXTERNAL: "invoice_external",
  QUOTE_RECEIVED: "quote",
  QUOTE_ACCEPTED: "quote_accepted",
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
    case "invoice":
      return buildInvoiceEmail(subject, body, meta);
    case "invoice_external":
      return buildExternalInvoiceEmail(subject, body, meta);
    case "quote":
      return buildQuoteEmail(subject, body, meta);
    case "quote_accepted":
      return buildQuoteAcceptedEmail(subject, body, meta);
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
    // Trust tiers. Only the service-role key is fully trusted (it never leaves
    // the server). The anon key is PUBLIC — it ships in the web bundle — so it
    // is NOT trusted and can never send to a raw `to`. A user JWT is
    // authenticated but only trusted to email its own saved clients (enforced
    // at recipient resolution below).
    const isServiceRole = token === supabaseServiceKey;
    let callerUserId: string | null = null;
    if (!isServiceRole) {
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user } } = await supabaseClient.auth.getUser(token);
      callerUserId = user?.id ?? null;
      // Reject anything that is neither the service-role key, a valid user JWT,
      // nor the (public) anon key. Anon is allowed through ONLY so callers that
      // use recipientUserId keep working; it still cannot use a raw `to`.
      if (!callerUserId && token !== supabaseAnonKey) {
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

    const { to, recipientUserId, subject, body, notificationType, metadata }: EmailRequest = await req.json();

    // Resolve the recipient address. Prefer a server-side lookup from
    // recipientUserId — the caller cannot spoof the delivered address that way.
    // A caller-supplied `to` is still accepted for the migration window and for
    // trusted internal callers (service-role / cron) that already derive the
    // address server-side.
    let recipientEmail = typeof to === "string" ? to.trim() : "";
    if (recipientUserId) {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: recipientProfile } = await adminClient
        .from("profiles")
        .select("email")
        .eq("id", recipientUserId)
        .maybeSingle();
      if (!recipientProfile?.email) {
        return new Response(
          JSON.stringify({ error: "Recipient not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      recipientEmail = recipientProfile.email;
    } else if (recipientEmail && !isServiceRole) {
      // Raw `to` from a non-service caller is only allowed to an address the
      // caller actually owns as a saved client_contact. This is what stops a
      // logged-in user (or a holder of the public anon key) from blasting a
      // ConnecTradie-branded email to an arbitrary address. Trusted internal
      // callers (service-role) derive the address server-side and are exempt.
      if (!callerUserId) {
        return new Response(
          JSON.stringify({ error: "A raw recipient address is not permitted here — use recipientUserId." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const esc = recipientEmail.replace(/([\\%_])/g, "\\$1"); // neutralise ilike metachars
      const { data: owned } = await adminClient
        .from("client_contacts")
        .select("id")
        .eq("owner_id", callerUserId)
        .ilike("email", esc)
        .limit(1);
      let allowedRecipient = !!(owned && owned.length > 0);
      if (!allowedRecipient) {
        // Also allow a site-specific email on one of the caller's clients
        // (client_sites.contact_email — e.g. a work email for the office site).
        const { data: siteOwned } = await adminClient
          .from("client_sites")
          .select("id, client_contacts!inner(owner_id)")
          .eq("client_contacts.owner_id", callerUserId)
          .ilike("contact_email", esc)
          .limit(1);
        allowedRecipient = !!(siteOwned && siteOwned.length > 0);
      }
      if (!allowedRecipient) {
        return new Response(
          JSON.stringify({ error: "You can only email your own saved clients. Add them to your client list first." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!recipientEmail || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: recipientUserId (or to), subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: 20 requests per minute per recipient
    const rateLimitKey = `${recipientEmail}-send-email`;
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
        to: [recipientEmail],
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
