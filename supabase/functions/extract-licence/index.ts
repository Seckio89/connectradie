// ─────────────────────────────────────────────────────────────────────────────
// extract-licence — read a licence card photo and open a draft verification row.
//
//   1. Consent gate: a granted consent_records row for purpose 'licence_ocr'
//      must exist for this user, or 403. (manual: true skips OCR AND the gate —
//      nothing is sent anywhere.)
//   2. Download the photo via service_role; the path must be under the caller's
//      own folder.
//   3. OCR through the OcrProvider selected by OCR_PROVIDER, 20 s budget.
//   4. Parse number / holder / class / expiry with the per-state patterns.
//   5. Pre-checks: expiry in the future, holder name vs profile + ABR names,
//      class vs trade.
//   6. Resolve the state register, insert the row as 'extracted', return it for
//      the tradie to confirm or correct.
//
// OCR failure is not an error: the row is inserted with empty fields so the
// tradie can type them. Onboarding never blocks on a model.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import type { Insert } from "../_shared/dbTypes.ts";
import { parseLicenceText, runPrechecks, STATE_CODES } from "../_shared/licenceParsing.ts";
import { selectOcrProvider, type OcrProvider } from "../_shared/ocrProvider.ts";
import {
  corsFor,
  jsonResponder,
  readServiceEnv,
  resolveCaller,
  serviceClient,
} from "../_shared/verificationHttp.ts";

export const BUCKET = "licence-uploads";
export const CONSENT_PURPOSE = "licence_ocr";
const OCR_BUDGET_MS = 20_000;
const TRADE_RE = /^[a-z0-9-]{2,40}$/;

interface Deps {
  ocr?: () => OcrProvider;
}

export function makeHandler(deps: Deps = {}) {
  return async (req: Request): Promise<Response> => {
    const cors = corsFor(req);
    const json = jsonResponder(cors);

    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const env = readServiceEnv();
    if (!env) {
      console.error("extract-licence: missing SUPABASE_URL / SERVICE_ROLE_KEY");
      return json({ error: "Server configuration error" }, 500);
    }
    const admin = serviceClient(env);

    const caller = await resolveCaller(req.headers.get("Authorization"), admin);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const tradeCategory = typeof body.trade_category === "string" ? body.trade_category.trim().toLowerCase() : "";
    const stateCode = typeof body.state_code === "string" ? body.state_code.trim().toUpperCase() : "";
    const manual = body.manual === true;
    const storagePath = typeof body.storage_path === "string" ? body.storage_path.trim() : "";

    if (!TRADE_RE.test(tradeCategory)) return json({ error: "trade_category is required" }, 400);
    if (!(STATE_CODES as string[]).includes(stateCode)) return json({ error: "state_code must be one of NSW, VIC, QLD, WA, SA, TAS, ACT, NT" }, 400);
    if (!manual) {
      if (!storagePath) return json({ error: "storage_path is required" }, 400);
      // Ownership by path: the bucket policy already scopes uploads to the
      // caller's folder, but this function reads with service_role, so it must
      // check the same thing itself.
      if (!storagePath.startsWith(`${caller.id}/`) || storagePath.includes("..")) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const { allowed } = await checkRateLimit(`${caller.id}-extract-licence`, 10, 60 * 60 * 1000);
    if (!allowed) return json({ error: "Too many licence uploads this hour. Wait a bit and try again." }, 429);

    // ── 1. Consent gate ─────────────────────────────────────────────────────
    if (!manual) {
      const { data: consent, error: consentError } = await admin
        .from("consent_records")
        .select("granted")
        .eq("user_id", caller.id)
        .eq("purpose", CONSENT_PURPOSE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (consentError) {
        console.error("extract-licence: consent read failed", consentError);
        return json({ error: "Couldn't confirm your consent. Try again." }, 500);
      }
      if (!consent?.granted) {
        return json({ error: "Agree to the licence scan first, or choose to type the details yourself.", error_code: "consent_required" }, 403);
      }
    }

    // ── Resolve the register for this state + trade ─────────────────────────
    const { data: register } = await admin
      .from("licence_registers")
      .select("id")
      .eq("state_code", stateCode)
      .contains("trade_categories", [tradeCategory])
      .order("register_name")
      .limit(1)
      .maybeSingle();

    // ── Names the holder may legitimately appear as ─────────────────────────
    const [{ data: bv }] = await Promise.all([
      admin.from("business_verifications").select("entity_name, business_names").eq("user_id", caller.id).maybeSingle(),
    ]);
    const candidateNames = [caller.fullName, bv?.entity_name, ...(bv?.business_names ?? [])];

    // ── Abandon any earlier draft for the same trade: one live draft at a time.
    const { data: stale } = await admin
      .from("licence_verifications")
      .select("id, storage_path")
      .eq("user_id", caller.id)
      .eq("trade_category", tradeCategory)
      .in("status", ["pending", "extracted"]);
    if (stale && stale.length > 0) {
      const paths = stale.map((s) => s.storage_path).filter((p): p is string => !!p && p !== storagePath);
      if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);
      await admin.from("licence_verifications").delete().in("id", stale.map((s) => s.id));
    }

    // ── 2–4. Download, OCR, parse ────────────────────────────────────────────
    let parsed = { licence_number: null as string | null, licence_holder_name: null as string | null, licence_class: null as string | null, expiry_date: null as string | null, fields_found_ratio: 0, parser: "none" };
    let ocrProviderId: string = "manual";
    let ocrConfidence: number | null = null;
    let ocrNote: string | null = null;

    if (!manual) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OCR_BUDGET_MS);
      try {
        const provider = (deps.ocr ?? (() => selectOcrProvider((k) => Deno.env.get(k))))();
        ocrProviderId = provider.id;

        const { data: file, error: dlError } = await admin.storage.from(BUCKET).download(storagePath);
        if (dlError || !file) {
          console.error("extract-licence: download failed", dlError);
          return json({ error: "The uploaded photo couldn't be read. Upload it again." }, 400);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";

        const ocr = await provider.extractText(bytes, mime, controller.signal);
        parsed = parseLicenceText(stateCode, ocr.text);
        // Providers that report no confidence get a heuristic one: how much of
        // the card the parser could make sense of.
        ocrConfidence = ocr.confidence ?? parsed.fields_found_ratio;
      } catch (err) {
        // Never block onboarding on OCR. Empty fields, status 'extracted', the
        // tradie types them in.
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`extract-licence: OCR failed (${ocrProviderId}):`, msg);
        ocrNote = controller.signal.aborted ? "The scan took too long, so the fields are blank — type them in." : "The scan didn't work this time, so the fields are blank — type them in.";
        ocrConfidence = 0;
      } finally {
        clearTimeout(timer);
      }
    }

    // ── 5. Pre-checks ───────────────────────────────────────────────────────
    const prechecks = runPrechecks({
      expiry_date: parsed.expiry_date,
      licence_holder_name: parsed.licence_holder_name,
      candidate_names: candidateNames,
      licence_class: parsed.licence_class,
      trade_category: tradeCategory,
    });

    // ── 6. Insert as 'extracted' ────────────────────────────────────────────
    const row: Insert<"licence_verifications"> = {
      user_id: caller.id,
      trade_category: tradeCategory,
      state_code: stateCode,
      register_id: register?.id ?? null,
      storage_path: manual ? null : storagePath,
      licence_number: parsed.licence_number,
      licence_holder_name: parsed.licence_holder_name,
      licence_class: parsed.licence_class,
      expiry_date: parsed.expiry_date,
      ocr_confidence: ocrConfidence === null ? null : Math.round(ocrConfidence * 1000) / 1000,
      ocr_provider: ocrProviderId,
      ...prechecks,
      status: "extracted",
    };

    const { data: saved, error: insertError } = await admin
      .from("licence_verifications")
      .insert(row)
      .select("id, trade_category, state_code, register_id, storage_path, licence_number, licence_holder_name, licence_class, expiry_date, ocr_confidence, ocr_provider, precheck_expiry_ok, precheck_name_match, precheck_class_match, status, created_at")
      .single();
    if (insertError || !saved) {
      console.error("extract-licence: insert failed", insertError);
      return json({ error: "The scan worked but couldn't be saved. Try again." }, 500);
    }

    console.log(`extract-licence: user=${caller.id} trade=${tradeCategory} state=${stateCode} provider=${ocrProviderId} parser=${parsed.parser} found=${parsed.fields_found_ratio}`);
    return json({ ok: true, verification: saved, note: ocrNote, parser: parsed.parser });
  };
}

export const handler = makeHandler();

if (import.meta.main) Deno.serve(handler);
