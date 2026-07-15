import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  estimate-quote (v2) — AI-assisted job pricing.

  Split of responsibility that makes the number trustworthy:
    • The AI (or heuristic) estimates ONLY the physical work — labour HOURS,
      likely MATERIALS cost, a confidence level, whether a site visit is needed,
      and up to 3 "sharpening" questions that would tighten the estimate.
    • This function then computes the MONEY deterministically from the tradie's
      OWN economics (hourly rate, workers, materials markup, call-out + travel,
      target margin, GST). The AI never invents the dollar figure, so the output
      is a transparent, editable line-item breakdown that reflects how THIS
      tradie prices — not a generic model.

  It stays an assistant: licensed/variable trades or thin inputs return low
  confidence + needsSiteVisit and steer to the 3-stage site-visit flow.

  Deploy WITHOUT gateway JWT (auth is enforced in-function):
    supabase functions deploy estimate-quote --no-verify-jwt
*/

// CORS: same allow-list pattern as the rest of the fleet — echo the request
// origin only when it's the prod domain (ALLOWED_ORIGIN) or a localhost dev
// server, else fall back to the prod domain. Not a wildcard.
const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173", // Vite dev server
  "http://localhost:4173", // Vite preview
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

interface Economics {
  hourlyRate: number;
  workers: number;
  marginPct: number;          // e.g. 15 → +15%
  materialsMarkupPct: number; // e.g. 20 → materials cost +20%
  gstRegistered: boolean;
  callOutFee: number;         // flat, AUD
  travelKm: number;           // one-way distance to site
}

interface EstimateRequest {
  trade?: string;
  jobType?: string;
  quantities?: Record<string, number | string>;
  condition?: string;               // light | standard | heavy | complex
  access?: string[];
  materialsSuppliedBy?: "tradie" | "client";
  materialsTier?: "budget" | "standard" | "premium";
  notes?: string;
  economics?: Partial<Economics>;
  history?: { price: number; title: string }[];
  images?: string[];
}

// Trades where a licence / site inspection usually governs price.
const LICENSED_TRADES = ["plumb", "electric", "gas", "hvac", "roof", "builder", "structural"];

const DEFAULTS: Economics = {
  hourlyRate: 75, workers: 1, marginPct: 15, materialsMarkupPct: 20,
  gstRegistered: false, callOutFee: 0, travelKm: 0,
};

function round(n: number, step = 5): number { return Math.round(n / step) * step; }

function econ(e?: Partial<Economics>): Economics {
  return {
    hourlyRate: e?.hourlyRate && e.hourlyRate > 0 ? e.hourlyRate : DEFAULTS.hourlyRate,
    workers: e?.workers && e.workers > 0 ? Math.min(e.workers, 20) : 1,
    marginPct: e?.marginPct != null && e.marginPct >= 0 ? Math.min(e.marginPct, 100) : DEFAULTS.marginPct,
    materialsMarkupPct: e?.materialsMarkupPct != null && e.materialsMarkupPct >= 0 ? Math.min(e.materialsMarkupPct, 200) : DEFAULTS.materialsMarkupPct,
    gstRegistered: !!e?.gstRegistered,
    callOutFee: e?.callOutFee && e.callOutFee > 0 ? e.callOutFee : 0,
    travelKm: e?.travelKm && e.travelKm > 0 ? e.travelKm : 0,
  };
}

interface LineItem { label: string; amount: number; detail?: string }

interface Estimate {
  source: "ai" | "estimate";
  hours: number;
  lineItems: LineItem[];
  materialsCost: number;
  subtotal: number;
  gst: number;
  total: number;
  priceMin: number;
  priceMax: number;
  confidence: "low" | "medium" | "high";
  needsSiteVisit: boolean;
  assumptions: string[];
  sharpeningQuestions: string[];
  note?: string;
}

// Physical estimate the AI/heuristic produces; money is computed from it.
interface WorkEstimate {
  hours: number;
  materialsCost: number; // tradie-supplied materials cost BEFORE markup (0 if client supplies)
  confidence: "low" | "medium" | "high";
  needsSiteVisit: boolean;
  assumptions: string[];
  sharpeningQuestions: string[];
}

const CONF_SPREAD: Record<string, number> = { high: 0.08, medium: 0.18, low: 0.35 };

/** Turn a physical work estimate into the tradie's line-item price. */
function priceFrom(work: WorkEstimate, e: Economics, req: EstimateRequest, source: "ai" | "estimate"): Estimate {
  const items: LineItem[] = [];

  const labour = work.hours * e.hourlyRate * e.workers;
  items.push({
    label: "Labour",
    amount: Math.round(labour),
    detail: `${work.hours} h × $${e.hourlyRate}/h${e.workers > 1 ? ` × ${e.workers}` : ""}`,
  });

  const materials = req.materialsSuppliedBy === "client" ? 0 : work.materialsCost * (1 + e.materialsMarkupPct / 100);
  if (materials > 0) {
    items.push({ label: "Materials", amount: Math.round(materials), detail: `+${e.materialsMarkupPct}% markup` });
  }

  // Call-out + travel (30c/km one-way as a simple, editable default). A $0
  // call-out fee means the tradie doesn't charge one — skip the whole
  // component, including the distance-based travel part.
  const travel = e.callOutFee > 0 && e.travelKm > 0 ? Math.round(e.travelKm * 0.6) : 0; // round trip @ ~0.30/km
  const callOut = e.callOutFee > 0 ? e.callOutFee + travel : 0;
  if (callOut > 0) {
    items.push({ label: "Call-out", amount: Math.round(callOut), detail: e.travelKm > 0 ? `incl. ~${Math.round(e.travelKm)} km travel` : undefined });
  }

  const baseSubtotal = labour + materials + callOut;
  const margin = baseSubtotal * (e.marginPct / 100);
  if (margin > 0) items.push({ label: "Margin", amount: Math.round(margin), detail: `${e.marginPct}%` });

  const subtotal = baseSubtotal + margin;
  const gst = e.gstRegistered ? subtotal * 0.1 : 0;
  const total = subtotal + gst;

  const spread = CONF_SPREAD[work.confidence] ?? 0.18;

  return {
    source,
    hours: work.hours,
    lineItems: items,
    materialsCost: Math.round(materials),
    subtotal: Math.round(subtotal),
    gst: Math.round(gst),
    total: round(total),
    priceMin: round(total * (1 - spread)),
    priceMax: round(total * (1 + spread)),
    confidence: work.confidence,
    needsSiteVisit: work.needsSiteVisit,
    assumptions: work.assumptions,
    sharpeningQuestions: work.sharpeningQuestions,
    note: source === "estimate" ? "Estimate only — review each line before quoting." : undefined,
  };
}

// ── Deterministic heuristic (no AI) ──────────────────────────────────────────
function heuristicWork(req: EstimateRequest): WorkEstimate {
  const trade = (req.trade || "").toLowerCase();
  const q = req.quantities ?? {};
  const num = (k: string) => Math.max(0, Number(q[k]) || 0);
  const rooms = num("rooms"), sqm = num("sqm"), bathrooms = num("bathrooms");
  const fixtures = num("fixtures"), points = num("points"), linearMetres = num("linearMetres"), coats = Math.max(1, num("coats") || 2);
  const workstations = num("workstations"), toilets = num("toilets"), levels = num("levels"), mezzanines = num("mezzanines");
  const jobType = (req.jobType || "").toLowerCase();
  const isCommercial = /office|retail|warehouse|strata|commercial/.test(jobType);
  const assumptions: string[] = [];
  const isLicensed = LICENSED_TRADES.some((t) => trade.includes(t));

  let hours = 0;
  if (trade.includes("clean") && isCommercial) {
    // Commercial cleaning scales on workstations/toilets/area, not rooms.
    if (jobType.includes("warehouse")) {
      hours = 1 + sqm * 0.004 + toilets * 0.5 + mezzanines * 0.75;
      assumptions.push("Warehouse: open-floor rate (~0.004 h/m²) + amenities.");
    } else if (jobType.includes("strata")) {
      hours = 1 + levels * 0.75 + sqm * 0.006 + toilets * 0.5;
      assumptions.push("Strata/common areas: per-level + shared amenities.");
    } else {
      hours = 1 + workstations * 0.08 + toilets * 0.5 + sqm * 0.006;
      assumptions.push("Office/retail: ~5 min/workstation, 30 min/toilet, plus area.");
    }
  } else if (trade.includes("clean")) {
    hours = 0.5 + rooms * 0.4 + bathrooms * 0.6 + sqm * 0.008;
    assumptions.push("~0.4 h/room, 0.6 h/bathroom, plus area.");
  } else if (trade.includes("paint")) {
    hours = 1 + (sqm * 0.055 + rooms * 0.6) * coats * 0.6;
    assumptions.push(`${coats} coat(s), walls${/ceiling/i.test(JSON.stringify(q)) ? " + ceilings" : " only"}.`);
  } else if (trade.includes("plumb") || trade.includes("gas")) {
    hours = 1.5 + fixtures * 1.5;
    assumptions.push("~1.5 h/fixture; parts extra and variable.");
  } else if (trade.includes("electric")) {
    hours = 1.5 + points * 0.75;
    assumptions.push("~0.75 h/point; compliance/cabling can vary.");
  } else if (trade.includes("floor") || trade.includes("til")) {
    hours = 2 + sqm * 0.15;
    assumptions.push("~0.15 h/sqm laying; subfloor prep not included.");
  } else if (trade.includes("fenc") || trade.includes("landscap") || trade.includes("garden")) {
    hours = 1 + linearMetres * 0.4 + sqm * 0.02;
    assumptions.push("Linear-metre / area based.");
  } else {
    hours = 1.5 + rooms * 0.75 + sqm * 0.015 + fixtures * 1 + points * 0.6 + linearMetres * 0.3;
    assumptions.push("General estimate — confirm scope on site.");
  }

  // Condition & scope multipliers.
  const cond = (req.condition || "").toLowerCase();
  if (cond === "heavy" || /end.?of.?lease|deep/i.test((req.jobType || "") + JSON.stringify(q))) { hours *= 1.5; assumptions.push("Heavy/deep scope (×1.5)."); }
  else if (cond === "complex") { hours *= 1.7; assumptions.push("Complex conditions (×1.7)."); }
  if ((req.access ?? []).length) { hours *= 1.1; assumptions.push("Difficult access (×1.1)."); }

  hours = Math.max(1, Math.round(hours * 2) / 2);

  // Rough materials guess when the tradie supplies (very approximate).
  let materialsCost = 0;
  if (req.materialsSuppliedBy !== "client") {
    if (trade.includes("paint")) materialsCost = sqm * 3.5 * coats;
    else if (trade.includes("floor") || trade.includes("til")) materialsCost = sqm * 35;
    else if (trade.includes("fenc")) materialsCost = linearMetres * 45;
    if (materialsCost > 0) assumptions.push("Materials are a rough guess — confirm from a supplier.");
  }

  const thin = rooms + sqm + bathrooms + fixtures + points + linearMetres + workstations + toilets + levels + mezzanines === 0;
  if (thin) assumptions.push("No quantities given — add them to sharpen this.");
  if (isLicensed) assumptions.push("Licensed trade: labour only — parts/compliance vary; a site inspection is recommended.");

  const sharpening: string[] = [];
  if (thin) sharpening.push("How big is the job (rooms / sqm / count)?");
  if (req.materialsSuppliedBy == null) sharpening.push("Are you supplying materials, or the client?");
  if (!req.condition) sharpening.push("What condition is the site in?");

  return {
    hours,
    materialsCost: Math.round(materialsCost),
    confidence: isLicensed ? "low" : thin ? "low" : "medium",
    needsSiteVisit: isLicensed || thin,
    assumptions,
    sharpeningQuestions: sharpening.slice(0, 3),
  };
}

// ── AI path (Claude vision) ──────────────────────────────────────────────────
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    hours: { type: "number" },
    materialsCost: { type: "number", description: "Tradie-supplied materials cost in AUD before markup; 0 if client supplies or none." },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    needsSiteVisit: { type: "boolean" },
    assumptions: { type: "array", items: { type: "string" } },
    sharpeningQuestions: { type: "array", items: { type: "string" }, description: "Up to 3 questions that would most tighten the estimate." },
  },
  required: ["hours", "materialsCost", "confidence", "needsSiteVisit", "assumptions", "sharpeningQuestions"],
  additionalProperties: false,
};

function imageBlocks(images?: string[]) {
  const blocks: unknown[] = [];
  for (const img of (images ?? []).slice(0, 4)) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(img || "");
    if (m) blocks.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  return blocks;
}

async function aiWork(req: EstimateRequest, apiKey: string): Promise<WorkEstimate> {
  const q = req.quantities ?? {};
  const qStr = Object.entries(q).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}=${v}`).join(", ");
  const hist = (req.history ?? []).slice(0, 6).map((h) => `"${h.title}" $${h.price}`).join("; ");

  const prompt =
    `You are helping an Australian tradie price a job. Estimate ONLY the physical work — do NOT compute a dollar price (the app does that from the tradie's own rates).\n` +
    `Return: labour HOURS (for one worker-equivalent of total effort), likely MATERIALS cost in AUD (before markup; 0 if the client supplies or none apply), a confidence level, whether a site visit is needed, key assumptions, and up to 3 sharpening questions.\n\n` +
    `Trade: ${req.trade || "unspecified"}${req.jobType ? ` (${req.jobType})` : ""}.\n` +
    `${qStr ? `Quantities: ${qStr}.\n` : ""}` +
    `${req.condition ? `Condition: ${req.condition}.\n` : ""}` +
    `${(req.access ?? []).length ? `Access issues: ${req.access!.join(", ")}.\n` : ""}` +
    `Materials supplied by: ${req.materialsSuppliedBy || "unspecified"}${req.materialsTier ? ` (${req.materialsTier} tier)` : ""}.\n` +
    `${req.notes ? `Notes: ${req.notes}.\n` : ""}` +
    `${hist ? `This tradie's recent accepted quotes (anchor your pricing to how THEY price, adjusting for size): ${hist}.\n` : ""}` +
    `\nUse any photos to judge scale, condition and complexity. Be conservative and realistic. ` +
    `For licensed or variable trades (plumbing, electrical, gas, roofing, structural) or when key facts are missing, set confidence low, needsSiteVisit true, and say why. ` +
    `Do not invent scope the inputs/photos don't support.`;

  const content = [...imageBlocks(req.images), { type: "text", text: prompt }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("refusal");
  const textBlock = (data.content || []).find((b: { type: string; text?: string }) => b.type === "text" && b.text);
  if (!textBlock?.text) throw new Error(`no text block (stop_reason=${data.stop_reason})`);

  let parsed: WorkEstimate;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    const m = textBlock.text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`unparseable: ${textBlock.text.slice(0, 200)}`);
    parsed = JSON.parse(m[0]);
  }
  return {
    hours: Math.max(0.5, Number(parsed.hours) || 1),
    materialsCost: Math.max(0, Number(parsed.materialsCost) || 0),
    confidence: parsed.confidence,
    needsSiteVisit: !!parsed.needsSiteVisit,
    assumptions: parsed.assumptions ?? [],
    sharpeningQuestions: (parsed.sharpeningQuestions ?? []).slice(0, 3),
  };
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
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    let body: EstimateRequest;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const e = econ(body.economics);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    let work: WorkEstimate;
    let source: "ai" | "estimate" = "estimate";
    if (apiKey) {
      try { work = await aiWork(body, apiKey); source = "ai"; }
      catch (aiErr) { console.warn("estimate-quote: AI path failed, heuristic fallback", aiErr); work = heuristicWork(body); }
    } else {
      work = heuristicWork(body);
    }

    return json(priceFrom(work, e, body, source));
  } catch (err) {
    console.error("estimate-quote error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
