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

/** Insert payload for a table, straight from the GENERATED types. */
export type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Update payload for a table, straight from the GENERATED types. */
export type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
