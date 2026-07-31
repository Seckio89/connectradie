import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import type { Insert, Json } from "../_shared/dbTypes.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

/*
  dispute-evidence-summary — Phase 2 of AI-assisted dispute handling.

  Reads what actually happened on a disputed job — the brief, the accepted
  quote, approved scope changes, the message timeline, photo references, and
  each party's stated position — and writes ONE structured summary row for the
  admin who will decide the case.

  ─────────────────────────────────────────────────────────────────────────────
  THIS FUNCTION MOVES NO MONEY. That is a hard constraint, not a description.
  ─────────────────────────────────────────────────────────────────────────────
  It holds no Stripe client, imports no Stripe SDK, and writes to exactly one
  table: dispute_evidence_summaries. It cannot release escrow, refund, or edit a
  payment even if the model asks it to, because there is no code path that does.
  `dispute-evidence-summary.test.ts` asserts that by scanning this file — so the
  guarantee survives someone adding a "convenient" import later.

  The `suggested_outcome` it produces is a RECOMMENDATION for a human. Nothing
  reads it and acts. Phase 3's admin UI shows it, requires a human to type their
  own outcome, and records `overridden` when they disagree.

  Idempotent by design: one summary per dispute. A second call returns the
  existing row without touching the Anthropic API — that is what stops a party
  from repeatedly re-triggering a paid model call on the same dispute. An admin
  can pass { force: true } to regenerate; each regeneration appends a new row
  (the table is append-only), so the earlier summary and its provenance survive.

  Deploy WITHOUT gateway JWT (auth is enforced in-function):
    npx supabase functions deploy dispute-evidence-summary
*/

const PROMPT_VERSION = "dispute-evidence/v1";
const MODEL = "claude-opus-5";

// CORS: same allow-list pattern as the rest of the fleet — echo the request
// origin only when it's the prod domain (ALLOWED_ORIGIN) or a localhost dev
// server, else fall back to the prod domain. Not a wildcard.
const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
    "Vary": "Origin",
  };
}

// The shape the model must return. Every field is advisory input to a human.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview",
    "agreed_scope",
    "timeline",
    "client_position",
    "tradie_position",
    "disputed_points",
    "evidence_gaps",
    "suggested_outcome",
  ],
  properties: {
    overview: {
      type: "string",
      description: "Neutral 2-4 sentence account of what happened. No blame, no recommendation.",
    },
    agreed_scope: {
      type: "string",
      description: "What both sides appear to have agreed to, from the quote and any approved variations.",
    },
    timeline: {
      type: "array",
      description: "Dated events drawn only from the supplied records, oldest first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "event", "source"],
        properties: {
          date: { type: "string" },
          event: { type: "string" },
          source: {
            type: "string",
            enum: ["job", "quote", "variation", "message", "photo", "dispute"],
          },
        },
      },
    },
    client_position: { type: "string" },
    tradie_position: {
      type: "string",
      description: "If the tradie has not stated a position in the records, say so explicitly.",
    },
    disputed_points: { type: "array", items: { type: "string" } },
    evidence_gaps: {
      type: "array",
      description: "What a decision-maker would need that the records do not contain.",
      items: { type: "string" },
    },
    suggested_outcome: {
      type: "object",
      additionalProperties: false,
      required: ["outcome", "rationale", "confidence", "split_client_pct"],
      properties: {
        outcome: {
          type: "string",
          enum: [
            "resolved_client",
            "resolved_tradie",
            "resolved_split",
            "dismissed",
            "insufficient_evidence",
          ],
        },
        rationale: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        split_client_pct: {
          type: ["integer", "null"],
          description: "Only for resolved_split: percent of the held funds returned to the client. Otherwise null.",
        },
      },
    },
  },
} as const;

interface RequestBody {
  disputeId?: string;
  force?: boolean;
}

type EvidenceBundle = Record<string, unknown>;

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

/**
 * Ask the model for a structured read of the evidence.
 *
 * Returns the parsed summary AND the raw response text, because the raw text is
 * NOT NULL on the row — a summary that cannot be audited must not be writable.
 */
async function summarise(
  apiKey: string,
  bundle: EvidenceBundle,
): Promise<{ parsed: Record<string, unknown>; raw: string; model: string }> {
  const system =
    "You are assisting a human dispute officer on an Australian tradie marketplace. " +
    "You do not decide anything and you do not move money — a person reads your output and decides.\n\n" +
    "Work ONLY from the records supplied. Do not invent events, amounts, dates, or statements. " +
    "Where the records are silent, say they are silent rather than inferring. " +
    "Both parties are people acting in good faith until the evidence says otherwise; write about them neutrally " +
    "and do not adopt either side's characterisation as fact.\n\n" +
    "Your suggested outcome is a recommendation, not a decision. Prefer 'insufficient_evidence' over a confident " +
    "guess: an honest 'we cannot tell from this' is more useful to the officer than a plausible story.";

  const prompt =
    "Here are the records for a disputed job. Produce the structured summary.\n\n" +
    "```json\n" +
    JSON.stringify(bundle, null, 2) +
    "\n```";

  const buildBody = (withFallback: boolean) => ({
    model: MODEL,
    max_tokens: 8000,
    // Opus 5 thinks by default and max_tokens caps thinking + response text
    // together, so this budget is deliberately generous for a JSON payload.
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system,
    messages: [{ role: "user", content: prompt }],
    ...(withFallback ? { fallbacks: "default" } : {}),
  });

  const call = async (withFallback: boolean) =>
    await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        ...(withFallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify(buildBody(withFallback)),
    });

  // Opus 5's safety classifiers can decline a request outright; `fallbacks`
  // re-runs it server-side on Opus 4.8 instead of handing us a dead end. It is
  // a beta parameter, so if this deployment's API rejects it we retry once
  // without it rather than failing the whole summary on an optional feature.
  let res = await call(true);
  if (res.status === 400) {
    const detail = await res.text();
    if (/fallback|beta/i.test(detail)) {
      res = await call(false);
    } else {
      throw new Error(`Anthropic 400: ${detail.slice(0, 300)}`);
    }
  }

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error(`refusal (${data.stop_details?.category ?? "uncategorised"})`);
  }

  const textBlock = (data.content || []).find(
    (b: { type: string; text?: string }) => b.type === "text" && b.text,
  );
  if (!textBlock?.text) throw new Error(`no text block (stop_reason=${data.stop_reason})`);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    const m = textBlock.text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`unparseable: ${textBlock.text.slice(0, 200)}`);
    parsed = JSON.parse(m[0]);
  }

  // `data.model` names the model that actually produced the message, which is
  // the fallback model when a fallback ran. Record what answered, not what we asked.
  return { parsed, raw: textBlock.text, model: String(data.model || MODEL) };
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const token = authHeader.slice(7);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Two kinds of caller: the service role (an internal trigger) or a signed-in
    // user who must turn out to be an admin or a party to the dispute.
    const isServiceRole = token === serviceKey;
    let callerId: string | null = null;
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return json({ error: "Unauthorized" }, 401);
      callerId = user.id;

      // Paid model call. The service-role caller is an internal trigger and is
      // deliberately not limited.
      const { allowed } = await checkRateLimit(`${user.id}-dispute-evidence-summary`, 5, 60000);
      if (!allowed) return json({ error: "Rate limit exceeded. Please try again later." }, 429);
    }

    let body: RequestBody;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
    const disputeId = body.disputeId;
    if (!disputeId) return json({ error: "disputeId is required" }, 400);

    const { data: disputeRow, error: disputeError } = await supabase
      .from("disputes")
      .select("id, job_id, opened_by, against_user, reason, description, status, dispute_type, created_at")
      .eq("id", disputeId)
      .maybeSingle();
    if (disputeError) return json({ error: "Failed to load dispute" }, 500);
    if (!disputeRow) return json({ error: "Dispute not found" }, 404);

    const dispute = disputeRow as {
      id: string; job_id: string; opened_by: string; against_user: string;
      reason: string; description: string; status: string;
      dispute_type: string | null; created_at: string;
    };

    // Authorisation. Admins always; otherwise the caller must be one of the two
    // parties named on the dispute. Anyone else gets 403 — the evidence bundle
    // contains the full message history for the job.
    let isAdmin = false;
    if (!isServiceRole && callerId) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("is_admin, role")
        .eq("id", callerId)
        .maybeSingle();
      const p = profileRow as { is_admin?: boolean | null; role?: string | null } | null;
      isAdmin = p?.is_admin === true || p?.role === "admin";

      const isParty = callerId === dispute.opened_by || callerId === dispute.against_user;
      if (!isAdmin && !isParty) return json({ error: "Forbidden" }, 403);
    }

    // Idempotency. One paid model call per dispute unless an admin forces a
    // regeneration — this is the cost control, so a party cannot force it.
    const force = body.force === true && (isAdmin || isServiceRole);
    if (!force) {
      const { data: existing } = await supabase
        .from("dispute_evidence_summaries")
        .select("id, created_at")
        .eq("dispute_id", disputeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return json({ summaryId: (existing as { id: string }).id, generated: false });
      }
    }

    // ── Gather the evidence ─────────────────────────────────────────────────
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("id, title, description, status, budget_amount, budget_type, created_at, completed_at, client_id, tradie_id")
      .eq("id", dispute.job_id)
      .maybeSingle();
    const job = jobRow as Record<string, unknown> | null;

    const { data: quoteRows } = await supabase
      .from("quotes")
      .select("id, status, firm_price, final_price, price_min, price_max, message, estimated_duration, includes_materials, materials_description, accepted_at, created_at")
      .eq("job_id", dispute.job_id)
      .order("created_at", { ascending: true });

    const { data: variationRows } = await supabase
      .from("job_variations")
      .select("id, description, additional_amount, status, reason_category, created_at")
      .eq("job_id", dispute.job_id)
      .order("created_at", { ascending: true });

    const { data: photoRows } = await supabase
      .from("job_photos")
      .select("id, stage, caption, uploaded_by, created_at")
      .eq("job_id", dispute.job_id)
      .order("created_at", { ascending: true });

    // Message bodies are the bulk of the payload and the most sensitive part of
    // it. Cap the count and the per-message length so one chatty job cannot
    // blow the context window or the token bill.
    const { data: messageRows } = await supabase
      .from("messages")
      .select("id, sender_id, content, created_at, deleted_at")
      .eq("job_id", dispute.job_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    // Label people by role rather than name or id — the officer needs to know
    // who said what, not who they are, and ids in a prompt invite the model to
    // treat them as meaningful.
    const clientId = (job?.client_id as string | null) ?? null;
    const tradieId = (job?.tradie_id as string | null) ?? null;
    const roleOf = (id: string | null | undefined) =>
      id && id === clientId ? "client" : id && id === tradieId ? "tradie" : "other";

    const bundle: EvidenceBundle = {
      dispute: {
        raised_by: roleOf(dispute.opened_by),
        against: roleOf(dispute.against_user),
        type: dispute.dispute_type,
        reason: dispute.reason,
        description: truncate(dispute.description, 4000),
        raised_at: dispute.created_at,
      },
      job: job
        ? {
            title: job.title,
            description: truncate(job.description as string | null, 4000),
            status: job.status,
            budget_amount: job.budget_amount,
            budget_type: job.budget_type,
            posted_at: job.created_at,
            marked_complete_at: job.completed_at,
          }
        : null,
      quotes: (quoteRows ?? []).map((q) => {
        const r = q as Record<string, unknown>;
        return { ...r, message: truncate(r.message as string | null, 2000) };
      }),
      approved_variations: (variationRows ?? []).filter(
        (v) => (v as { status: string }).status === "approved",
      ),
      other_variations: (variationRows ?? []).filter(
        (v) => (v as { status: string }).status !== "approved",
      ),
      photos: (photoRows ?? []).map((p) => {
        const r = p as Record<string, unknown>;
        return {
          stage: r.stage,
          caption: r.caption,
          uploaded_by: roleOf(r.uploaded_by as string | null),
          at: r.created_at,
        };
      }),
      messages: (messageRows ?? []).map((m) => {
        const r = m as Record<string, unknown>;
        return {
          from: roleOf(r.sender_id as string | null),
          at: r.created_at,
          text: truncate(r.content as string | null, 1500),
        };
      }),
    };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "AI summary is not configured" }, 503);

    let result: { parsed: Record<string, unknown>; raw: string; model: string };
    try {
      result = await summarise(apiKey, bundle);
    } catch (err) {
      console.error("dispute-evidence-summary: model call failed", err);
      // A failed summary must never block the dispute itself. The admin queue
      // works without one — it just doesn't get the assist.
      return json({ error: "Could not generate a summary", generated: false }, 502);
    }

    // Provenance is NOT NULL and written in the SAME insert as the summary, so
    // a summary that cannot be audited cannot exist.
    const payload: Insert<"dispute_evidence_summaries"> = {
      dispute_id: disputeId,
      summary: result.parsed as unknown as Json,
      model: result.model,
      prompt_version: PROMPT_VERSION,
      raw_input: bundle as unknown as Json,
      raw_output: result.raw,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("dispute_evidence_summaries")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      console.error("dispute-evidence-summary: insert failed", insertError);
      return json({ error: "Could not store the summary" }, 500);
    }

    return json({ summaryId: (inserted as { id: string }).id, generated: true });
  } catch (err) {
    console.error("dispute-evidence-summary: unhandled", err);
    return json({ error: "Internal server error" }, 500);
  }
});
