import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  access-pin — server-side gate for PIN-protected job access instructions.

  The instructions live in job_access_details (service-role only), NOT on the
  jobs row, so they never reach the browser until a viewer proves their PIN
  here. Each user (tradie or logged-in team member) sets a 4-digit PIN; it's
  PBKDF2-hashed and stored in access_pins with lockout + email-reset support.

  Actions (POST { action, ... }):
    status                        -> { hasPin, locked, lockedUntil }
    has     { jobId }             -> { hasInstructions }         (no PIN)
    setup   { pin }               -> { ok }                       (first PIN only)
    verify  { pin, jobId }        -> { accessInstructions } | 423 locked / 401 wrong
    change  { currentPin, newPin }-> { ok }
    forgot                        -> { ok } emails a 6-digit reset code
    reset   { code, newPin }      -> { ok }

  Deploy WITHOUT gateway JWT (auth enforced in-function):
    supabase functions deploy access-pin --no-verify-jwt
*/

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

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
const RESET_TTL_MIN = 15;
const PBKDF2_ITER = 120_000;

const te = new TextEncoder();
const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(secret: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", te.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key, 256,
  );
  return toB64(bits);
}
async function hashSecret(secret: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(secret, salt), salt: toB64(salt) };
}
async function verifySecret(secret: string, saltB64: string, expected: string): Promise<boolean> {
  const got = await pbkdf2(secret, fromB64(saltB64));
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
const isPin = (v: unknown): v is string => typeof v === "string" && /^\d{4}$/.test(v);

interface PinRow {
  profile_id: string; pin_hash: string; pin_salt: string;
  failed_attempts: number; locked_until: string | null;
  reset_code_hash: string | null; reset_expires_at: string | null;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

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

    let body: { action?: string; pin?: string; newPin?: string; currentPin?: string; code?: string; jobId?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
    const action = body.action;

    const { data: pinRow } = await supabase
      .from("access_pins").select("*").eq("profile_id", user.id).maybeSingle();
    const row = pinRow as PinRow | null;
    const now = Date.now();
    const lockedUntilMs = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
    const isLocked = lockedUntilMs > now;

    // Can this caller view access details for the job? (owner tradie or a member
    // of that tradie's business.)
    const canViewJob = async (jobId: string): Promise<boolean> => {
      const { data: job } = await supabase.from("jobs").select("tradie_id").eq("id", jobId).maybeSingle();
      const tradieId = (job as { tradie_id: string | null } | null)?.tradie_id;
      if (!tradieId) return false;
      if (tradieId === user.id) return true;
      const { data: m } = await supabase
        .from("business_team_members").select("id")
        .eq("business_owner_id", tradieId).eq("member_profile_id", user.id).limit(1);
      return !!(m && m.length);
    };

    switch (action) {
      case "status":
        return json({ hasPin: !!row, locked: isLocked, lockedUntil: row?.locked_until ?? null });

      case "has": {
        if (!body.jobId || !(await canViewJob(body.jobId))) return json({ error: "Not your job" }, 403);
        const { data: d } = await supabase
          .from("job_access_details").select("job_id")
          .eq("job_id", body.jobId)
          .not("access_instructions", "is", null).maybeSingle();
        return json({ hasInstructions: !!d, hasPin: !!row });
      }

      case "setup": {
        if (row) return json({ error: "A PIN is already set. Use change or reset instead." }, 409);
        if (!isPin(body.pin)) return json({ error: "PIN must be exactly 4 digits." }, 400);
        const { hash, salt } = await hashSecret(body.pin);
        const { error } = await supabase.from("access_pins")
          .insert({ profile_id: user.id, pin_hash: hash, pin_salt: salt, failed_attempts: 0 });
        if (error) return json({ error: "Could not save your PIN." }, 500);
        return json({ ok: true });
      }

      case "verify": {
        if (!row) return json({ error: "No PIN set", needsSetup: true }, 409);
        if (isLocked) return json({ error: "Too many attempts. Try again later.", lockedUntil: row.locked_until }, 423);
        if (!isPin(body.pin)) return json({ error: "Enter your 4-digit PIN." }, 400);
        const ok = await verifySecret(body.pin, row.pin_salt, row.pin_hash);
        if (!ok) {
          const attempts = (row.failed_attempts ?? 0) + 1;
          const lock = attempts >= MAX_ATTEMPTS;
          await supabase.from("access_pins").update({
            failed_attempts: lock ? 0 : attempts,
            locked_until: lock ? new Date(now + LOCK_MINUTES * 60_000).toISOString() : row.locked_until,
            updated_at: new Date().toISOString(),
          }).eq("profile_id", user.id);
          return json({
            error: lock ? `Too many attempts. Locked for ${LOCK_MINUTES} minutes.` : "Incorrect PIN. Try again.",
            attemptsLeft: lock ? 0 : MAX_ATTEMPTS - attempts,
            locked: lock,
          }, lock ? 423 : 401);
        }
        // Correct PIN → clear attempts, then authorise + return the instructions.
        await supabase.from("access_pins")
          .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
          .eq("profile_id", user.id);
        if (!body.jobId || !(await canViewJob(body.jobId))) return json({ error: "Not your job" }, 403);
        const { data: d } = await supabase
          .from("job_access_details").select("access_instructions").eq("job_id", body.jobId).maybeSingle();
        return json({ accessInstructions: (d as { access_instructions: string | null } | null)?.access_instructions ?? null });
      }

      case "change": {
        if (!row) return json({ error: "No PIN set", needsSetup: true }, 409);
        if (isLocked) return json({ error: "Locked. Try again later.", lockedUntil: row.locked_until }, 423);
        if (!isPin(body.newPin)) return json({ error: "New PIN must be 4 digits." }, 400);
        if (!isPin(body.currentPin) || !(await verifySecret(body.currentPin, row.pin_salt, row.pin_hash))) {
          return json({ error: "Current PIN is incorrect." }, 401);
        }
        const { hash, salt } = await hashSecret(body.newPin);
        await supabase.from("access_pins")
          .update({ pin_hash: hash, pin_salt: salt, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
          .eq("profile_id", user.id);
        return json({ ok: true });
      }

      case "forgot": {
        if (!row) return json({ error: "No PIN set", needsSetup: true }, 409);
        const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
        // Hash the reset code with the user's existing pin_salt so reset can
        // verify it symmetrically (the code hash is never comparable to the PIN).
        const codeHash = await pbkdf2(code, fromB64(row.pin_salt));
        await supabase.from("access_pins").update({
          reset_code_hash: codeHash,
          reset_expires_at: new Date(now + RESET_TTL_MIN * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("profile_id", user.id);
        // Email the code to the caller (recipient resolved server-side).
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              recipientUserId: user.id,
              subject: "Your ConnecTradie access-PIN reset code",
              body: `Your access-PIN reset code is ${code}. It expires in ${RESET_TTL_MIN} minutes. If you didn't request this, ignore this email.`,
            }),
          });
        } catch (e) { console.error("access-pin forgot: email failed", e); }
        return json({ ok: true });
      }

      case "reset": {
        if (!row) return json({ error: "No PIN set", needsSetup: true }, 409);
        if (!row.reset_code_hash || !row.reset_expires_at || new Date(row.reset_expires_at).getTime() < now) {
          return json({ error: "Your reset code has expired. Request a new one." }, 410);
        }
        if (!isPin(body.newPin)) return json({ error: "New PIN must be 4 digits." }, 400);
        if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) return json({ error: "Enter the 6-digit code from your email." }, 400);
        const codeHash = await pbkdf2(body.code, fromB64(row.pin_salt));
        if (codeHash !== row.reset_code_hash) return json({ error: "Incorrect reset code." }, 401);
        const { hash, salt } = await hashSecret(body.newPin);
        await supabase.from("access_pins").update({
          pin_hash: hash, pin_salt: salt, failed_attempts: 0, locked_until: null,
          reset_code_hash: null, reset_expires_at: null, updated_at: new Date().toISOString(),
        }).eq("profile_id", user.id);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("access-pin error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
