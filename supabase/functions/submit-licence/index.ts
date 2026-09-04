// ─────────────────────────────────────────────────────────────────────────────
// submit-licence — the tradie confirms (or corrects) the four extracted fields
// and the draft moves to awaiting_review.
//
// The pre-checks are re-run here on the CONFIRMED values, server-side, so the
// ticks the admin sees describe what was submitted, not what OCR guessed.
// Only the owner can submit, and only a row still in 'extracted'.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { Update } from "../_shared/dbTypes.ts";
import { parseAuDate, runPrechecks } from "../_shared/licenceParsing.ts";
import {
  corsFor,
  jsonResponder,
  readServiceEnv,
  resolveCaller,
  serviceClient,
  UUID_RE,
} from "../_shared/verificationHttp.ts";

const LICENCE_NUMBER_RE = /^[A-Z0-9][A-Z0-9 /-]{2,29}$/i;

export const handler = async (req: Request): Promise<Response> => {
  const cors = corsFor(req);
  const json = jsonResponder(cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readServiceEnv();
  if (!env) {
    console.error("submit-licence: missing SUPABASE_URL / SERVICE_ROLE_KEY");
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

  const id = typeof body.verification_id === "string" ? body.verification_id.trim() : "";
  if (!UUID_RE.test(id)) return json({ error: "verification_id must be a uuid" }, 400);

  const licenceNumber = typeof body.licence_number === "string" ? body.licence_number.trim().toUpperCase() : "";
  const holderName = typeof body.licence_holder_name === "string" ? body.licence_holder_name.trim().replace(/\s+/g, " ") : "";
  const licenceClass = typeof body.licence_class === "string" ? body.licence_class.trim().replace(/\s+/g, " ") : "";
  const expiryRaw = typeof body.expiry_date === "string" ? body.expiry_date.trim() : "";

  if (!LICENCE_NUMBER_RE.test(licenceNumber)) return json({ error: "Enter the licence number as it appears on the card (letters, digits, spaces, dashes)." }, 400);
  if (holderName.length < 2 || holderName.length > 120) return json({ error: "Enter the name printed on the licence." }, 400);
  if (licenceClass.length > 120) return json({ error: "Licence class is too long." }, 400);
  const expiry = parseAuDate(expiryRaw);
  if (!expiry) return json({ error: "Enter the expiry date shown on the card." }, 400);

  const { data: current, error: readError } = await admin
    .from("licence_verifications")
    .select("id, user_id, status, trade_category")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("submit-licence: read failed", readError);
    return json({ error: "Couldn't load the licence. Try again." }, 500);
  }
  if (!current || current.user_id !== caller.id) return json({ error: "Not found" }, 404);
  if (current.status !== "extracted") {
    return json({ error: `This licence has already been submitted (${current.status}).` }, 409);
  }

  const { data: bv } = await admin
    .from("business_verifications")
    .select("entity_name, business_names")
    .eq("user_id", caller.id)
    .maybeSingle();

  const prechecks = runPrechecks({
    expiry_date: expiry,
    licence_holder_name: holderName,
    candidate_names: [caller.fullName, bv?.entity_name, ...(bv?.business_names ?? [])],
    licence_class: licenceClass || null,
    trade_category: current.trade_category,
  });

  const patch: Update<"licence_verifications"> = {
    licence_number: licenceNumber,
    licence_holder_name: holderName,
    licence_class: licenceClass || null,
    expiry_date: expiry,
    ...prechecks,
    status: "awaiting_review",
  };

  const { data: updated, error: updateError } = await admin
    .from("licence_verifications")
    .update(patch)
    .eq("id", id)
    .eq("status", "extracted") // optimistic lock against a double submit
    .select("id, status, licence_number, licence_holder_name, licence_class, expiry_date, precheck_expiry_ok, precheck_name_match, precheck_class_match")
    .maybeSingle();
  if (updateError) {
    console.error("submit-licence: update failed", updateError);
    return json({ error: "Couldn't submit the licence. Try again." }, 500);
  }
  if (!updated) return json({ error: "This licence was submitted a moment ago. Reload to see its status." }, 409);

  console.log(`submit-licence: user=${caller.id} id=${id} -> awaiting_review expiry_ok=${prechecks.precheck_expiry_ok} name=${prechecks.precheck_name_match} class=${prechecks.precheck_class_match}`);
  return json({ ok: true, verification: updated });
};

if (import.meta.main) Deno.serve(handler);
