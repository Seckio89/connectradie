import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ─────────────────────────────────────────────────────────────────────────────
// Service-role authorization by CAPABILITY, not by string shape.
//
// The old guard `authHeader.startsWith("Bearer ey")` passed ANY valid JWT — every
// signed-in user's token starts with "eyJ…" — so with verify_jwt=true a random
// authenticated user was treated as service-role. This probes the PRESENTED key
// against an admin-only API (listUsers): only a real service-role key succeeds.
// Works for legacy JWT service keys AND new sb_secret_* keys; rejects anon/user
// JWTs. Mirrors the check already proven in auto-release-payments.
// ─────────────────────────────────────────────────────────────────────────────
export async function hasServiceRole(
  authHeader: string | null,
  supabaseUrl: string,
): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const probe = createClient(supabaseUrl, authHeader.slice(7));
    const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

// Resolve the authenticated end-user behind a user JWT (null for service/anon).
export async function getBearerUser(
  authHeader: string | null,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ id: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const client = createClient(supabaseUrl, serviceKey);
    const { data, error } = await client.auth.getUser(authHeader.slice(7));
    if (error || !data.user) return null;
    return { id: data.user.id };
  } catch {
    return null;
  }
}
