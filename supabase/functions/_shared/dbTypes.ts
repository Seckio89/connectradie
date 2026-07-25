// ---------------------------------------------------------------------------
// Write-payload types for edge functions.
//
// Sourced from the SAME generated schema the frontend uses
// (src/types/supabase.ts). That file is pure type declarations with zero
// imports, so Deno can type-only-import it directly — no bundling, no runtime
// cost, and it can never drift from the client's view of the schema.
// Regenerate it after every migration; never hand-edit it.
//
// ANNOTATE EVERY write payload variable with `Insert<'…'>` / `Update<'…'>`.
// The Supabase client in these functions is created WITHOUT the `Database`
// generic, and postgrest-js binds the `.insert()`/`.update()` argument to a
// naked generic anyway — so the payload is never checked at the call site.
// An annotated variable DECLARATION, however, is a plain assignment, so
// excess-property checking fires there and a later `payload.bogus = 1` fails
// too. That is what makes an edge-function write column-checked.
// ---------------------------------------------------------------------------
import type { Database, Json } from "../../../src/types/supabase.ts";

/** The generated `jsonb` column type. Re-exported so payload-shaping types in
 *  edge functions can declare jsonb fields with the real column type. */
export type { Json };

/**
 * The full generated schema. Pass it to `createClient<Database>(...)` so the
 * client knows the real column types AND embed cardinality.
 *
 * Worth doing on any function that reads a joined embed: an UNTYPED client can't
 * resolve a relationship, so postgrest-js falls back to typing every embed as an
 * array. That has led to hand-written casts of the shape
 * `session.recurring_job as { client_id: string; ... }` — which fix the
 * array-vs-object complaint but quietly assert non-null on nullable columns.
 * Two live bugs came from exactly that.
 */
export type { Database };

/** Insert payload for a table, straight from the GENERATED types. */
export type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Update payload for a table, straight from the GENERATED types. */
export type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
