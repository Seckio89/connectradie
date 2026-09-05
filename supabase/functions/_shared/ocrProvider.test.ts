// Deno tests for the OCR provider seam — the mocked-provider cases the brief
// asks for (success, low confidence, provider timeout), run through the same
// parse + pre-check pipeline extract-licence uses.
//
//   deno test --allow-env supabase/functions/_shared/ocrProvider.test.ts

import { ok as assert, deepStrictEqual as assertEquals, rejects as assertRejects } from "node:assert/strict";
import {
  HuggingFaceOcrProvider,
  OcrProviderError,
  type OcrProvider,
  type OcrResult,
  SelfHostedOcrProvider,
  selectOcrProvider,
} from "./ocrProvider.ts";
import { parseLicenceText, runPrechecks } from "./licenceParsing.ts";

const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes, enough for a mock

/** A provider that answers with a canned transcription (or fails). */
function fakeProvider(result: OcrResult | Error, delayMs = 0): OcrProvider {
  return {
    id: "fake:test",
    extractText: (_img, _mime, signal) =>
      new Promise<OcrResult>((resolve, reject) => {
        const t = setTimeout(() => (result instanceof Error ? reject(result) : resolve(result)), delayMs);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      }),
  };
}

Deno.test("mocked provider: success — transcription parses to all four fields and pre-checks pass", async () => {
  const provider = fakeProvider({
    text: "Licence No: 123456C\nName: JOHN SMITH\nCategories: Plumber, Drainer\nExpires: 14/03/2027",
    confidence: 0.93,
  });
  const ocr = await provider.extractText(IMAGE, "image/jpeg", new AbortController().signal);
  const parsed = parseLicenceText("NSW", ocr.text);
  assertEquals(parsed.licence_number, "123456C");
  assertEquals(parsed.expiry_date, "2027-03-14");
  const checks = runPrechecks({
    ...parsed,
    candidate_names: ["John Smith"],
    trade_category: "plumber",
    today: "2026-09-04",
  });
  assertEquals(checks, { precheck_expiry_ok: true, precheck_name_match: true, precheck_class_match: true });
});

Deno.test("mocked provider: low confidence — partial transcription yields partial fields, ratio < 1, no throw", async () => {
  const provider = fakeProvider({ text: "Lic No 98765\n~~ smudge ~~", confidence: 0.31 });
  const ocr = await provider.extractText(IMAGE, "image/jpeg", new AbortController().signal);
  const parsed = parseLicenceText("QLD", ocr.text);
  assertEquals(parsed.licence_number, "98765");
  assertEquals(parsed.expiry_date, null);
  assert(parsed.fields_found_ratio < 1);
  const checks = runPrechecks({ ...parsed, candidate_names: ["John Smith"], trade_category: "plumber" });
  // Nothing to check is null, never a false negative that would look like a failed licence.
  assertEquals(checks.precheck_expiry_ok, null);
  assertEquals(checks.precheck_name_match, null);
});

Deno.test("mocked provider: timeout — the abort signal rejects and the caller gets an AbortError", async () => {
  const provider = fakeProvider({ text: "never", confidence: null }, 10_000);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assertRejects(
    () => provider.extractText(IMAGE, "image/jpeg", controller.signal),
    (err: Error) => err.name === "AbortError",
  );
});

Deno.test("HuggingFaceOcrProvider: parses a chat-completion payload and records its model id", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchStub: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "Licence No: 1234567\nRenewal Due: 30 Jun 2027" } }],
    }), { status: 200 }));
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    const provider = new HuggingFaceOcrProvider("hf_test", "Qwen/Qwen2.5-VL-7B-Instruct");
    assertEquals(provider.id, "huggingface:Qwen/Qwen2.5-VL-7B-Instruct");
    const out = await provider.extractText(IMAGE, "image/jpeg", new AbortController().signal);
    assert(out.text.includes("1234567"));
    assertEquals(out.confidence, null);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].body.model, "Qwen/Qwen2.5-VL-7B-Instruct");
    // The image travels as a data URL; nothing about the user does.
    const content = (calls[0].body.messages as Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>)[0].content;
    assert(content.some((c) => c.type === "image_url" && c.image_url?.url.startsWith("data:image/jpeg;base64,")));
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("HuggingFaceOcrProvider: non-200 becomes an OcrProviderError with the status", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("rate limited", { status: 429 }));
  try {
    const provider = new HuggingFaceOcrProvider("hf_test");
    await assertRejects(
      () => provider.extractText(IMAGE, "image/jpeg", new AbortController().signal),
      (err: OcrProviderError) => err instanceof OcrProviderError && err.status === 429,
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("SelfHostedOcrProvider: posts raw bytes and reads {text, confidence}", async () => {
  const origFetch = globalThis.fetch;
  let seenAuth = "";
  globalThis.fetch = (_input, init) => {
    seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    return Promise.resolve(new Response(JSON.stringify({ text: "Licence No: 1", confidence: 0.5 }), { status: 200 }));
  };
  try {
    const provider = new SelfHostedOcrProvider("https://ocr.internal/extract", "tok");
    const out = await provider.extractText(IMAGE, "image/png", new AbortController().signal);
    assertEquals(out, { text: "Licence No: 1", confidence: 0.5 });
    assertEquals(seenAuth, "Bearer tok");
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("selectOcrProvider: env-driven, fails loudly when unconfigured", () => {
  const env = (vars: Record<string, string>) => (k: string) => vars[k];
  assertEquals(selectOcrProvider(env({ HF_API_TOKEN: "x" })).id, "huggingface:Qwen/Qwen2.5-VL-7B-Instruct");
  assertEquals(selectOcrProvider(env({ HF_API_TOKEN: "x", HF_OCR_MODEL: "org/model" })).id, "huggingface:org/model");
  assertEquals(selectOcrProvider(env({ OCR_PROVIDER: "self-hosted", OCR_ENDPOINT_URL: "https://x" })).id, "self-hosted");
  let threw = false;
  try { selectOcrProvider(env({})); } catch (e) { threw = e instanceof OcrProviderError; }
  assert(threw);
  threw = false;
  try { selectOcrProvider(env({ OCR_PROVIDER: "self-hosted" })); } catch (e) { threw = e instanceof OcrProviderError; }
  assert(threw);
});
