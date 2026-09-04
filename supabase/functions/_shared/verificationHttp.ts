// HTTP plumbing shared by the tradie-verification functions (verify-abn,
// extract-licence, submit-licence, review-licence, expire-licences): CORS,
// JSON responses, and caller resolution against the SAME admin rule the
// database uses (profiles.role = 'admin' OR profiles.is_admin), so a decision
// the edge function accepts is one RLS would also have accepted.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import type { Database } from "./dbTypes.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
    "Vary": "Origin",
  };
}

export function jsonResponder(cors: Record<string, string>) {
  return (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
}

export interface ServiceEnv {
  supabaseUrl: string;
  serviceKey: string;
}

export function readServiceEnv(): ServiceEnv | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl, serviceKey };
}

export type Caller = { id: string; isAdmin: boolean; fullName: string | null };

/**
 * Resolve the signed-in user behind a Bearer JWT and whether they are a platform
 * admin. Returns null for a missing/invalid token (and for the service-role key:
 * these functions act on behalf of a person, not a cron).
 */
export async function resolveCaller(
  authHeader: string | null,
  admin: SupabaseClient<Database>,
): Promise<Caller | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const { data, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !data.user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_admin, full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    isAdmin: profile?.role === "admin" || profile?.is_admin === true,
    fullName: profile?.full_name ?? null,
  };
}

export function serviceClient(env: ServiceEnv): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
