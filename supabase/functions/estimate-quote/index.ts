import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  estimate-quote — AI-assisted job pricing helper (opt-in "advanced" quoting).

  Given a trade + structured answers (sqm, rooms, scope) and optional photos, it
  suggests labour hours and a price RANGE for the tradie to confirm. It is an
  ASSISTANT, never a binding quote: for licensed/variable trades it widens the
  range and recommends a site visit.

  Hybrid by design:
    • If ANTHROPIC_API_KEY is set → Claude (vision) reads the photos + answers.
    • Otherwise → a deterministic heuristic (area/room based) so the feature is
      useful immediately, with AI as an upgrade.

  Deploy WITHOUT gateway JWT (the gateway would 401 the CORS preflight, which
  carries no Authorization header). Auth is enforced IN-FUNCTION via
  supabase.auth.getUser, so it stays tradie-only:
    supabase functions deploy estimate-quote --no-verify-jwt
*/

// Token-authenticated (Bearer JWT, no cookies), so the origin is not the
// security boundary — allow any origin so the app works from the native app,
// production web, and local preview alike.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface EstimateRequest {
  trade?: string;
  sqm?: number;
  rooms?: number;
  scope?: string[];
  notes?: string;
  hourlyRate?: number;
  images?: string[]; // base64 data URLs (data:image/jpeg;base64,...), max 3 used
}

interface Estimate {
  source: "ai" | "estimate";
  hours: number;
  priceMin: number;
  priceMax: number;
  confidence: "low" | "medium" | "high";
  needsSiteVisit: boolean;
  assumptions: string[];
  note?: string;
}

// Trades where a licence/site inspection usually governs the price — never
// auto-commit a firm number; widen the range and steer to a site visit.
const LICENSED_TRADES = ["plumber", "plumbing", "electrician", "electrical", "gas", "hvac", "roofing", "builder"];
// Trades where hours scale predictably with area/rooms — the heuristic is decent.
const AREA_TRADES = ["cleaner", "cleaning", "painter", "painting", "flooring", "tiler", "tiling", "gardener", "landscaping"];

const DEFAULT_HOURLY = 70;

function round(n: number, step = 5): number {
  return Math.round(n / step) * step;
}

/** Deterministic fallback estimate — no AI. */
function heuristicEstimate(req: EstimateRequest): Estimate {
  const trade = (req.trade || "").toLowerCase();
  const sqm = Math.max(0, req.sqm ?? 0);
  const rooms = Math.max(0, req.rooms ?? 0);
  const scope = req.scope ?? [];
  const rate = req.hourlyRate && req.hourlyRate > 0 ? req.hourlyRate : DEFAULT_HOURLY;

  const isLicensed = LICENSED_TRADES.some((t) => trade.includes(t));
  const isArea = AREA_TRADES.some((t) => trade.includes(t));

  let hours: number;
  const assumptions: string[] = [];

  if (trade.includes("clean")) {
    hours = 0.5 + rooms * 0.4 + sqm * 0.008;
    assumptions.push("Standard clean; ~0.4 h per room plus area.");
  } else if (trade.includes("paint")) {
    hours = 1 + sqm * 0.06 + rooms * 0.5;
    assumptions.push("Two coats, walls only; prep not included.");
  } else if (isArea) {
    hours = 1 + rooms * 0.75 + sqm * 0.02;
    assumptions.push("Area/room-based estimate.");
  } else {
    hours = 1.5 + rooms * 0.75 + sqm * 0.015;
    assumptions.push("General estimate — confirm scope on site.");
  }

  // Scope multipliers (deep clean, prep, etc.).
  const scopeText = scope.join(" ").toLowerCase();
  if (/deep|detailed|end.?of.?lease|move.?out/.test(scopeText)) { hours *= 1.6; assumptions.push("Deep/end-of-lease scope (×1.6)."); }
  if (/prep|sand|repair|patch/.test(scopeText)) { hours *= 1.25; assumptions.push("Surface prep/repairs included (×1.25)."); }

  hours = Math.max(1, Math.round(hours * 2) / 2); // nearest 0.5h, min 1

  const base = hours * rate;
  // Licensed/variable trades: wide band + materials headroom + site visit.
  const spread = isLicensed ? 0.45 : 0.15;
  const materials = isLicensed ? base * 0.4 : 0;

  const priceMin = round(base - base * spread);
  const priceMax = round(base + base * spread + materials);

  if (isLicensed) {
    assumptions.push("Licensed trade: labour only — parts/compliance vary. A site inspection is recommended.");
  }
  if (sqm === 0 && rooms === 0) {
    assumptions.push("No size given — estimate is rough. Add area or room count to sharpen it.");
  }

  return {
    source: "estimate",
    hours,
    priceMin,
    priceMax,
    confidence: isLicensed ? "low" : sqm || rooms ? "medium" : "low",
    needsSiteVisit: isLicensed || (sqm === 0 && rooms === 0),
    assumptions,
    note: "Estimate only — review before quoting. Add ANTHROPIC_API_KEY to enable AI photo analysis.",
  };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    hours: { type: "number" },
    priceMin: { type: "number" },
    priceMax: { type: "number" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    needsSiteVisit: { type: "boolean" },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["hours", "priceMin", "priceMax", "confidence", "needsSiteVisit", "assumptions"],
  additionalProperties: false,
};

function imageBlocks(images: string[] | undefined) {
  const blocks: unknown[] = [];
  for (const img of (images ?? []).slice(0, 3)) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(img || "");
    if (m) blocks.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  return blocks;
}

/** AI estimate via Claude vision. Throws on any failure so the caller falls back. */
async function aiEstimate(req: EstimateRequest, apiKey: string): Promise<Estimate> {
  const rate = req.hourlyRate && req.hourlyRate > 0 ? req.hourlyRate : DEFAULT_HOURLY;
  const prompt =
    `You are helping an Australian tradie price a job. Estimate the LABOUR HOURS and a fair price RANGE in AUD. ` +
    `Trade: ${req.trade || "unspecified"}. ` +
    `${req.sqm ? `Area: ${req.sqm} sqm. ` : ""}${req.rooms ? `Rooms: ${req.rooms}. ` : ""}` +
    `${req.scope?.length ? `Scope: ${req.scope.join(", ")}. ` : ""}${req.notes ? `Notes: ${req.notes}. ` : ""}` +
    `Their hourly rate is about $${rate}. ` +
    `Use any photos to judge condition, size and complexity. Be conservative and realistic. ` +
    `For licensed or variable trades (plumbing, electrical, gas, roofing, structural), give a WIDER range, set confidence low, ` +
    `set needsSiteVisit true, and note that parts/compliance vary. ` +
    `List the key assumptions you made. Do not invent scope the photos/answers don't support.`;

  const content = [...imageBlocks(req.images), { type: "text", text: prompt }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("refusal");

  const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("no text block");
  const parsed = JSON.parse(textBlock.text) as Omit<Estimate, "source">;

  return {
    source: "ai",
    hours: parsed.hours,
    priceMin: round(parsed.priceMin),
    priceMax: round(parsed.priceMax),
    confidence: parsed.confidence,
    needsSiteVisit: parsed.needsSiteVisit,
    assumptions: parsed.assumptions ?? [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

    // Authenticate the tradie (JWT).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    let body: EstimateRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (apiKey) {
      try {
        return json(await aiEstimate(body, apiKey));
      } catch (aiErr) {
        console.warn("estimate-quote: AI path failed, falling back to heuristic", aiErr);
      }
    }
    return json(heuristicEstimate(body));
  } catch (err) {
    console.error("estimate-quote error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
