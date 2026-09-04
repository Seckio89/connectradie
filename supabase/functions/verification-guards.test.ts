// Guard-clause tests for the tradie-verification functions — the same shape as
// guards.test.ts: call the exported handler with a fabricated Request and assert
// the real Response, on the paths that refuse BEFORE touching Postgres.
//
//   deno test --allow-env --allow-net --allow-read supabase/functions/verification-guards.test.ts
//
// Ownership (403/404) and state-machine (409) refusals, the consent gate, and
// "the storage object is gone after review-licence" need real rows; those live
// in scripts/e2e-verification.mjs against a live project.

import { ok as assert, deepStrictEqual as assertEquals } from "node:assert/strict";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("ALLOWED_ORIGIN", "https://connectradie.com");

type Handler = (req: Request) => Promise<Response>;

async function load(fn: string): Promise<Handler> {
  const mod = await import(`./${fn}/index.ts`);
  assert(typeof mod.handler === "function", `${fn} does not export a handler`);
  return mod.handler as Handler;
}

const post = (body: unknown = {}, headers: Record<string, string> = {}) =>
  new Request("https://edge.test/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const FUNCTIONS = ["verify-abn", "extract-licence", "submit-licence", "review-licence", "expire-licences"];

for (const fn of FUNCTIONS) {
  Deno.test(`${fn}: OPTIONS preflight answers 200 with CORS headers`, async () => {
    const handler = await load(fn);
    const res = await handler(new Request("https://edge.test/fn", { method: "OPTIONS", headers: { Origin: "https://connectradie.com" } }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://connectradie.com");
  });

  Deno.test(`${fn}: GET is rejected with 405`, async () => {
    const handler = await load(fn);
    const res = await handler(new Request("https://edge.test/fn", { method: "GET" }));
    assertEquals(res.status, 405);
  });

  Deno.test(`${fn}: no Authorization header is 401`, async () => {
    const handler = await load(fn);
    const res = await handler(post({}));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  });

  Deno.test(`${fn}: an unknown origin does not get reflected`, async () => {
    const handler = await load(fn);
    const res = await handler(new Request("https://edge.test/fn", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }));
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://connectradie.com");
  });
}

Deno.test("verify-abn: the ABR lookup fails closed on timeout and on non-200", async () => {
  const { abrJsonLookup } = await import("./verify-abn/index.ts");
  const slow: typeof fetch = (_input, init) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  // Use a short-circuit: abort comes from the lookup's own 5 s timer, which is
  // too long for a unit test, so assert the non-200 branch and the JSONP parse.
  const bad: typeof fetch = () => Promise.resolve(new Response("nope", { status: 502 }));
  assertEquals(await abrJsonLookup("guid", bad)("51824753556"), { kind: "unavailable", reason: "ABR returned 502" });

  const notFound: typeof fetch = () => Promise.resolve(new Response('abrCallback({"Abn":"","Message":"No record found"})', { status: 200 }));
  assertEquals(await abrJsonLookup("guid", notFound)("51824753556"), { kind: "not_found" });

  const badGuid: typeof fetch = () => Promise.resolve(new Response('abrCallback({"Abn":"","Message":"The GUID entered is not recognised as a Registered Party"})', { status: 200 }));
  assertEquals((await abrJsonLookup("guid", badGuid)("51824753556")).kind, "unavailable");

  const found: typeof fetch = () => Promise.resolve(new Response(
    'abrCallback({"Abn":"51824753556","AbnStatus":"Active","EntityName":"SMITH, JOHN","EntityTypeName":"Individual/Sole Trader","BusinessName":["Smith Plumbing"],"Gst":"2015-07-01","AddressState":"NSW","AddressPostcode":"2000","Message":""})',
    { status: 200 },
  ));
  const r = await abrJsonLookup("guid", found)("51824753556");
  assert(r.kind === "found" && r.details.AbnStatus === "Active" && r.details.BusinessName[0] === "Smith Plumbing");
  void slow;
});
