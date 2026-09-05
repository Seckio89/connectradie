// OCR behind an interface, so the hosted provider can be swapped for a
// self-hosted one by changing OCR_PROVIDER — no code change, no new privacy
// disclosure to re-file for the swap direction that removes a third party.
//
//   OCR_PROVIDER=huggingface  (default)  HuggingFaceOcrProvider
//   OCR_PROVIDER=self-hosted             SelfHostedOcrProvider (stub, v1 not wired)
//
// Neither provider ever sees who the tradie is: it receives image bytes and
// returns text. The caller (extract-licence) is the only thing that knows which
// user the image belongs to.

export interface OcrResult {
  /** Full transcription, line-broken where the model saw line breaks. */
  text: string;
  /** 0..1 when the provider reports one; null when it does not. */
  confidence: number | null;
}

export interface OcrProvider {
  /** Recorded in licence_verifications.ocr_provider, e.g. 'huggingface:Qwen/Qwen2.5-VL-7B-Instruct'. */
  readonly id: string;
  extractText(image: Uint8Array, mimeType: string, signal: AbortSignal): Promise<OcrResult>;
}

export class OcrProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OcrProviderError";
  }
}

const TRANSCRIBE_PROMPT =
  "This is a photo of an Australian trade licence card. Transcribe every piece of printed text on it exactly as printed, " +
  "one field per line, keeping each label with its value (for example 'Licence No: 123456C', 'Expiry: 31/12/2027', " +
  "'Name: JOHN SMITH', 'Class: Plumber, Drainer'). Do not add commentary, do not guess values you cannot read.";

/** Base64 without the 64 KB call-stack ceiling of String.fromCharCode(...bytes). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Hugging Face hosted inference, via the OpenAI-compatible router. A
 * vision-language model is used rather than a line-level OCR model (TrOCR)
 * because a licence card is several labelled fields, not one text line, and a
 * VLM returns the whole card in one call with the labels intact — which is what
 * the per-state parsers key on.
 *
 * Env: HF_API_TOKEN (required), HF_OCR_MODEL (default Qwen/Qwen2.5-VL-7B-Instruct).
 */
export class HuggingFaceOcrProvider implements OcrProvider {
  readonly id: string;
  private readonly endpoint: string;

  constructor(
    private readonly token: string,
    private readonly model: string = "Qwen/Qwen2.5-VL-7B-Instruct",
    endpoint = "https://router.huggingface.co/v1/chat/completions",
  ) {
    this.id = `huggingface:${model}`;
    this.endpoint = endpoint;
  }

  async extractText(image: Uint8Array, mimeType: string, signal: AbortSignal): Promise<OcrResult> {
    const dataUrl = `data:${mimeType};base64,${toBase64(image)}`;
    const res = await fetch(this.endpoint, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: TRANSCRIBE_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OcrProviderError(`Hugging Face returned ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content) ? content.map((c) => c.text ?? "").join("\n") : "";
    if (!text.trim()) throw new OcrProviderError("Hugging Face returned an empty transcription");
    return { text, confidence: null };
  }
}

/**
 * Stub for a later self-hosted deployment. Contract: POST the raw image to
 * OCR_ENDPOINT_URL with Content-Type = the image mime type and, when set,
 * Authorization: Bearer OCR_ENDPOINT_TOKEN; expect JSON { text, confidence? }.
 * Not wired in v1 — interface only.
 */
export class SelfHostedOcrProvider implements OcrProvider {
  readonly id = "self-hosted";

  constructor(private readonly endpointUrl: string, private readonly token?: string) {}

  async extractText(image: Uint8Array, mimeType: string, signal: AbortSignal): Promise<OcrResult> {
    const headers: Record<string, string> = { "Content-Type": mimeType };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    // Copy into a plain ArrayBuffer: fetch's BodyInit wants ArrayBuffer-backed
    // bytes, and a Uint8Array view over a shared/resizable buffer is not that.
    const body = new Blob([image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer], { type: mimeType });
    const res = await fetch(this.endpointUrl, { method: "POST", signal, headers, body });
    if (!res.ok) throw new OcrProviderError(`OCR endpoint returned ${res.status}`, res.status);
    const data = await res.json() as { text?: string; confidence?: number };
    if (typeof data.text !== "string" || !data.text.trim()) throw new OcrProviderError("OCR endpoint returned no text");
    const confidence = typeof data.confidence === "number" && data.confidence >= 0 && data.confidence <= 1
      ? data.confidence
      : null;
    return { text: data.text, confidence };
  }
}

/** Pick the provider from the environment. Throws when the chosen one is unconfigured. */
export function selectOcrProvider(env: (k: string) => string | undefined): OcrProvider {
  const which = (env("OCR_PROVIDER") ?? "huggingface").toLowerCase();
  if (which === "self-hosted" || which === "selfhosted") {
    const url = env("OCR_ENDPOINT_URL");
    if (!url) throw new OcrProviderError("OCR_PROVIDER=self-hosted but OCR_ENDPOINT_URL is not set");
    return new SelfHostedOcrProvider(url, env("OCR_ENDPOINT_TOKEN"));
  }
  const token = env("HF_API_TOKEN");
  if (!token) throw new OcrProviderError("HF_API_TOKEN is not set");
  return new HuggingFaceOcrProvider(token, env("HF_OCR_MODEL") || undefined);
}
