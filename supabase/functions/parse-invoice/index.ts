import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// --- Named constants ---
const MAX_BASE64_SIZE = 10 * 1024 * 1024;
const BASIC_EXTRACT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_BT_ET_BLOCK_SIZE = 10240;
const MIN_EXTRACTED_TEXT_LENGTH = 10;
const MAX_NAME_LENGTH = 80;
const MAX_INVOICE_NUMBER_LENGTH = 30;
const MAX_AMOUNT_VALUE = 1000000;
const PDF_PARSE_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { allowed } = checkRateLimit(`${user.id}-parse-invoice`, 15, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Role check — only tradies and admins can parse invoices
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!callerProfile || (callerProfile.role !== "tradie" && callerProfile.role !== "admin")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: only tradies can parse invoices" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { file_base64, file_type } = body as { file_base64?: string; file_type?: string };

    if (!file_base64) {
      return new Response(
        JSON.stringify({ error: "No file provided. Include file_base64 in the request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof file_base64 !== "string" || file_base64.length > MAX_BASE64_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large (max 10MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file_type !== "application/pdf") {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Only PDF is supported." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode base64 once — all extraction methods share this buffer
    const binary = atob(file_base64);
    const pdfBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pdfBytes[i] = binary.charCodeAt(i);
    }

    const extractedText = await extractPdfText(pdfBytes);

    if (!extractedText || !extractedText.trim()) {
      return new Response(
        JSON.stringify({ error: "Could not extract text from this PDF. The file may be image-based or corrupted." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const details = parseInvoiceDetails(extractedText);

    return new Response(
      JSON.stringify(details),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- PDF text extraction (3-method fallback chain) ---

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const methods = [
    () => extractWithUnpdf(pdfBytes),
    () => extractWithPdfParse(pdfBytes),
    () => Promise.resolve(basicPdfExtract(pdfBytes)),
  ];

  for (const method of methods) {
    try {
      const text = await method();
      if (text && text.trim().length > MIN_EXTRACTED_TEXT_LENGTH) return text;
    } catch {
      continue;
    }
  }

  return "";
}

async function extractWithUnpdf(pdfBytes: Uint8Array): Promise<string> {
  const { extractText } = await import("npm:unpdf@0.12.1");
  const { text } = await extractText(pdfBytes.buffer);
  return text || "";
}

async function extractWithPdfParse(pdfBytes: Uint8Array): Promise<string> {
  const pdfParse = (await import("npm:pdf-parse@1.1.1")).default;
  const { Buffer } = await import("node:buffer");
  const buffer = Buffer.from(pdfBytes);
  const data = await withTimeout(pdfParse(buffer), PDF_PARSE_TIMEOUT_MS);
  return data.text || "";
}

function basicPdfExtract(pdfBytes: Uint8Array): string {
  try {
    const bytesToDecode = pdfBytes.length > BASIC_EXTRACT_MAX_BYTES
      ? pdfBytes.slice(0, BASIC_EXTRACT_MAX_BYTES)
      : pdfBytes;
    const content = new TextDecoder("latin1").decode(bytesToDecode);
    const parts: string[] = [];

    const tjRegex = /\(([^)]{1,200})\)\s*T[jJ]/g;
    let m;
    while ((m = tjRegex.exec(content)) !== null) {
      const t = m[1].replace(/\\[()\\]/g, (x: string) => x[1]);
      if (t.trim()) parts.push(t);
    }

    const tjArrayRegex = /\[([^\]]{1,500})\]\s*TJ/g;
    while ((m = tjArrayRegex.exec(content)) !== null) {
      const stringParts = m[1].match(/\(([^)]*)\)/g);
      if (stringParts) {
        const combined = stringParts
          .map((s: string) =>
            s.slice(1, -1).replace(/\\[()\\]/g, (x: string) => x[1])
          )
          .join("");
        if (combined.trim()) parts.push(combined);
      }
    }

    // indexOf-based BT/ET scan (avoids ReDoS-prone regex on raw binary)
    let searchFrom = 0;
    while (searchFrom < content.length) {
      const btIdx = content.indexOf("BT", searchFrom);
      if (btIdx === -1) break;
      const etIdx = content.indexOf("ET", btIdx + 2);
      if (etIdx === -1) break;
      if (etIdx - btIdx <= MAX_BT_ET_BLOCK_SIZE) {
        const block = content.substring(btIdx + 2, etIdx);
        const textOps = block.match(/\(([^)]{1,200})\)\s*Tj/g);
        if (textOps) {
          for (const op of textOps) {
            const tm = op.match(/\(([^)]+)\)/);
            if (tm && tm[1].trim() && !parts.includes(tm[1].trim())) {
              parts.push(tm[1].trim());
            }
          }
        }
      }
      searchFrom = etIdx + 2;
    }

    return parts.join("\n");
  } catch {
    return "";
  }
}

// --- Invoice field extraction ---

function splitLines(text: string): string[] {
  return text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

function findTotalAmount(text: string): string {
  const lines = splitLines(text);

  interface AmountCandidate {
    value: number;
    valueStr: string;
    lineIndex: number;
    score: number;
  }

  const candidates: AmountCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const dollarMatches = [...lines[i].matchAll(/\$\s*([\d,]+\.\d{2})/g)];
    for (const m of dollarMatches) {
      const valStr = m[1].replace(/,/g, "");
      const val = parseFloat(valStr);
      const key = `${i}-${val}`;
      if (val > 0 && !seen.has(key)) {
        seen.add(key);
        candidates.push({ value: val, valueStr: valStr, lineIndex: i, score: 0 });
      }
    }
    const dollarInt = [...lines[i].matchAll(/\$\s*([\d,]+)(?!\.\d)/g)];
    for (const m of dollarInt) {
      const valStr = m[1].replace(/,/g, "");
      const val = parseFloat(valStr);
      const key = `${i}-${val}`;
      if (val > 0 && !seen.has(key)) {
        seen.add(key);
        candidates.push({ value: val, valueStr: valStr, lineIndex: i, score: 0 });
      }
    }
    const decimalMatches = [...lines[i].matchAll(/(?<!\$\s?)\b([\d,]+\.\d{2})\b/g)];
    for (const m of decimalMatches) {
      const valStr = m[1].replace(/,/g, "");
      const val = parseFloat(valStr);
      const key = `${i}-${val}`;
      if (val > 0 && val < MAX_AMOUNT_VALUE && !seen.has(key)) {
        seen.add(key);
        candidates.push({ value: val, valueStr: valStr, lineIndex: i, score: -5 });
      }
    }
  }

  if (candidates.length === 0) return "";

  const contextRadius = 4;

  for (const c of candidates) {
    const start = Math.max(0, c.lineIndex - contextRadius);
    const end = Math.min(lines.length, c.lineIndex + contextRadius + 1);
    const ctx = lines.slice(start, end).join(" ").toLowerCase();
    const sameLine = lines[c.lineIndex].toLowerCase();

    if (/balance\s*due/.test(ctx)) c.score += 120;
    if (/balance\s*due/.test(sameLine)) c.score += 30;
    if (/total\s*money\s*(owed|due|owing)/.test(ctx)) c.score += 110;
    if (/amount\s*(due|payable|owing)/.test(ctx)) c.score += 100;
    if (/total\s*(due|payable|owing|owed)/.test(ctx)) c.score += 100;
    if (/total.*(?:inc|gst|tax)/.test(ctx) && !/sub\s*-?\s*total/.test(ctx)) c.score += 90;
    if (/(grand|final|gross)\s*total/.test(ctx)) c.score += 85;
    if (/invoice\s*(total|amount)/.test(ctx)) c.score += 80;
    if (/payment\s*total|total\s*payment/.test(ctx)) c.score += 80;
    if (/net\s*(amount|total|payable)/.test(ctx)) c.score += 75;
    if (/total\s*(amount|price|cost|charge|fee|value|sum)/.test(ctx)) c.score += 70;
    if (/total\s*to\s*pay/.test(ctx)) c.score += 70;
    if (/please\s*pay|you\s*owe|pay\s*this/.test(ctx)) c.score += 70;
    if (/\btotal\b/.test(sameLine) && !/sub\s*-?\s*total/.test(sameLine)) c.score += 50;
    if (/\b(due|payable|pay|owing|owed)\b/.test(sameLine)) c.score += 40;
    if (/\binvoice\b/.test(sameLine)) c.score += 20;
    if (/sub\s*-?\s*total/.test(sameLine)) c.score -= 60;
    if (/\bgst\b/.test(sameLine) && !/total/.test(sameLine) && !/balance/.test(sameLine) && !/due/.test(sameLine)) c.score -= 50;
    if (/\btax\b/.test(sameLine) && !/total/.test(sameLine) && !/balance/.test(sameLine) && !/due/.test(sameLine)) c.score -= 40;
    if (/\b(rate|hour|hrs|qty|quantity|unit)\b/.test(sameLine)) c.score -= 30;
    if (/\b(weekly|daily|monthly)\b/.test(sameLine)) c.score -= 20;
    c.score += (c.lineIndex / lines.length) * 15;
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.lineIndex - a.lineIndex;
  });

  if (candidates[0].score > 0) {
    return candidates[0].valueStr;
  }

  const amounts = candidates.map((c) => c.value);
  for (const a of amounts) {
    const expectedTotal = a * 1.1;
    const match = amounts.find((b) => Math.abs(b - expectedTotal) < 0.05 && b !== a);
    if (match) return String(match);
  }

  const lastDollar = [...candidates]
    .filter((c) => c.score >= -5)
    .sort((a, b) => b.lineIndex - a.lineIndex);
  if (lastDollar.length > 0) {
    return lastDollar[0].valueStr;
  }

  return "";
}

function findBusinessName(text: string): string {
  const lines = splitLines(text);

  const entitySuffixes =
    /(?:Pty\.?\s*Ltd\.?|P\/L|LLC|Inc\.?|Ltd\.?|Co\.\s|Corporation|Corp\.?|Group|Holdings|Enterprises|Trading|Industries|International)/i;

  const tradeSuffixes =
    /(?:Electrical|Plumbing|Construction|Building|Maintenance|Contracting|Carpentry|Landscaping|Painting|Roofing|Tiling|Fencing|Flooring|Cleaning|Renovations?|Concreting|Demolition|Excavation|Plastering|Glazing|Welding|Joinery|Cabinetry|Air\s*Conditioning|HVAC|Refrigeration|Fire\s*Protection|Security|Scaffolding|Crane|Transport|Logistics|Engineering|Design|Consulting|Advisory|Management|Property|Real\s*Estate|Hospitality|Catering|Events?)(?:\s+(?:Services?|Solutions?|Specialists?|Experts?|Pros?|Team|Works?|Projects?))?/i;

  const SKIP_PATTERNS = [
    /^(tax\s+)?invoice/i,
    /^(credit\s+note|receipt|statement|quote|estimate)/i,
    /^date/i, /^due/i, /^phone/i, /^fax/i, /^email/i, /^address/i,
    /^to\b/i, /^from\b/i, /^bill/i, /^ship/i,
    /^abn/i, /^acn/i, /^gst/i, /^page/i,
    /^total/i, /^subtotal/i, /^sub\s*total/i,
    /^payment/i, /^bank/i, /^bsb/i, /^account/i,
    /^description/i, /^qty/i, /^quantity/i, /^amount/i,
    /^unit/i, /^rate/i, /^item/i,
    /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/,
    /^\d+$/, /^\$[\d,.]+$/,
    /^www\./i, /^http/i, /[@]/,
    /^\+?\d[\d\s()-]{6,}$/,
  ];

  function isSkip(line: string): boolean {
    return SKIP_PATTERNS.some((p) => p.test(line.trim()));
  }

  function isTableHeader(line: string): boolean {
    const lower = line.toLowerCase();
    const words = ["rate", "hours", "qty", "quantity", "description", "unit", "price", "amount"];
    return words.filter((w) => lower.includes(w)).length >= 2;
  }

  function isValidName(name: string): boolean {
    return name.length >= 3 && name.length < MAX_NAME_LENGTH;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (entitySuffixes.test(trimmed) && !isTableHeader(trimmed) && !isSkip(trimmed)) {
      let name = trimmed.replace(/\s*[-|:]\s*(?:tax\s+)?invoice.*$/i, "").trim();
      name = name.replace(/^(from|by|billed?\s*by|company)[\s:]+/i, "").trim();
      if (isValidName(name)) return name;
    }
  }

  const abnIndex = lines.findIndex((l) => /\babn\b/i.test(l));
  if (abnIndex > 0) {
    for (let i = abnIndex - 1; i >= Math.max(0, abnIndex - 3); i--) {
      const candidate = lines[i].trim();
      if (
        isValidName(candidate) &&
        !isSkip(candidate) && !isTableHeader(candidate) &&
        !/^\d/.test(candidate) && !/^\$/.test(candidate)
      ) {
        return candidate;
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (tradeSuffixes.test(trimmed) && !isTableHeader(trimmed) && !isSkip(trimmed)) {
      let name = trimmed.replace(/\s*[-|:]\s*(?:tax\s+)?invoice.*$/i, "").trim();
      name = name.replace(/^(from|by|billed?\s*by|company)[\s:]+/i, "").trim();
      if (isValidName(name)) return name;
    }
  }

  const fromPatterns = [
    /(?:from|billed?\s*by|issued\s*by|supplier|vendor|contractor|company)[\s:]+(.+)/i,
  ];
  for (const pattern of fromPatterns) {
    const match = text.match(pattern);
    if (match) {
      const candidate = match[1].trim().split(/\n/)[0].trim();
      if (isValidName(candidate) && !isSkip(candidate) && !isTableHeader(candidate)) {
        return candidate;
      }
    }
  }

  const invoiceLineIndex = lines.findIndex((l) => /^(tax\s+)?invoice/i.test(l.trim()));
  const searchLines = invoiceLineIndex > 0 ? lines.slice(0, invoiceLineIndex) : lines.slice(0, 10);

  for (const line of searchLines) {
    const trimmed = line.trim();
    if (
      isValidName(trimmed) &&
      !isSkip(trimmed) && !isTableHeader(trimmed) &&
      !/^\d/.test(trimmed) && !/^\$/.test(trimmed)
    ) {
      return trimmed;
    }
  }

  return "";
}

function findInvoiceNumber(text: string): string {
  const lines = splitLines(text);

  const invPatterns = [
    /(?:invoice|inv)\s*(?:#|no\.?|number|num)?[\s:.-]*([A-Z0-9][\w/-]*\d[\w/-]*)/i,
    /(?:invoice|inv)\s*(?:#|no\.?|number|num)?[\s:.-]*(\d+)/i,
    /(?:tax\s*invoice)\s*(?:#|no\.?|number)?[\s:.-]*([A-Z0-9][\w/-]*\d[\w/-]*)/i,
    /(?:reference|ref)\s*(?:#|no\.?|number)?[\s:.-]*([A-Z0-9][\w/-]*\d[\w/-]*)/i,
    /(?:receipt)\s*(?:#|no\.?|number)?[\s:.-]*([A-Z0-9][\w/-]*\d[\w/-]*)/i,
    /(?:order)\s*(?:#|no\.?|number)?[\s:.-]*([A-Z0-9][\w/-]*\d[\w/-]*)/i,
    /#\s*([A-Z0-9][\w/-]*\d[\w/-]*)/i,
    /INV[\s-]?(\d[\w-]*)/i,
  ];

  for (const line of lines) {
    for (const pattern of invPatterns) {
      const match = line.match(pattern);
      if (match && match[1].trim().length <= MAX_INVOICE_NUMBER_LENGTH) {
        return match[1].trim();
      }
    }
  }

  for (const pattern of invPatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length <= MAX_INVOICE_NUMBER_LENGTH) {
      return match[1].trim();
    }
  }

  return "";
}

function findGstAmount(text: string): string {
  const lines = splitLines(text);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const isGstLine = /\bgst\b/.test(line) && !/total/.test(line) && !/balance/.test(line) && !/sub\s*-?\s*total/.test(line);
    if (!isGstLine) continue;

    const m1 = lines[i].match(/\$\s*([\d,]+\.\d{2})/);
    if (m1) {
      const val = m1[1].replace(/,/g, "");
      if (parseFloat(val) > 0) return val;
    }
    const m2 = lines[i].match(/\$\s*([\d,]+)/);
    if (m2) {
      const val = m2[1].replace(/,/g, "");
      if (parseFloat(val) > 0) return val;
    }
    const m3 = lines[i].match(/([\d,]+\.\d{2})\b/);
    if (m3) {
      const val = m3[1].replace(/,/g, "");
      if (parseFloat(val) > 0) return val;
    }
    if (i + 1 < lines.length) {
      const next = lines[i + 1];
      const n1 = next.match(/\$\s*([\d,]+\.?\d*)/);
      if (n1) {
        const val = n1[1].replace(/,/g, "");
        if (parseFloat(val) > 0) return val;
      }
      const n2 = next.match(/([\d,]+\.\d{2})\b/);
      if (n2) {
        const val = n2[1].replace(/,/g, "");
        if (parseFloat(val) > 0) return val;
      }
    }
  }

  return "";
}

function findDueDate(text: string): string {
  const lines = splitLines(text);

  const monthMap: Record<string, string> = {
    jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
    apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
    aug: "08", august: "08", sep: "09", september: "09", oct: "10", october: "10",
    nov: "11", november: "11", dec: "12", december: "12",
  };

  const parseDate = (line: string): string | null => {
    // Australian format: DD/MM/YYYY. If one value is >12 it must be the day;
    // when ambiguous (both ≤12), default to AU convention (first = day).
    const m1 = line.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m1) {
      const [, a, b, y] = m1;
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      const day = aNum > 12 ? a : (bNum > 12 ? b : a);
      const month = day === a ? b : a;
      if (parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
        return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
    const m2 = line.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})/);
    if (m2) {
      const [, a, b, yy] = m2;
      const y = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      const day = aNum > 12 ? a : (bNum > 12 ? b : a);
      const month = day === a ? b : a;
      if (parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
        return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
    const m3 = line.match(/(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i);
    if (m3) {
      const [, d, mon, y] = m3;
      const month = monthMap[mon.toLowerCase().substring(0, 3)];
      return `${y}-${month}-${d.padStart(2, "0")}`;
    }
    const m4 = line.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (m4) {
      const [, mon, d, y] = m4;
      const month = monthMap[mon.toLowerCase().substring(0, 3)];
      return `${y}-${month}-${d.padStart(2, "0")}`;
    }
    return null;
  };

  const dueKeywords = [
    /(?:payment\s*)?due\s*(?:date|by)?/i,
    /pay(?:ment)?\s*(?:due|by|before|on)/i,
    /due\s*for\s*payment/i,
    /payable\s*(?:by|on|before)/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (dueKeywords.some((kw) => kw.test(line))) {
      const date = parseDate(line);
      if (date) return date;
      if (i + 1 < lines.length) {
        const nextDate = parseDate(lines[i + 1]);
        if (nextDate) return nextDate;
      }
      if (i + 2 < lines.length) {
        const nextDate = parseDate(lines[i + 2]);
        if (nextDate) return nextDate;
      }
    }
  }

  return "";
}

function parseInvoiceDetails(text: string): {
  business_name: string;
  invoice_number: string;
  amount: string;
  gst: string;
  due_date: string;
} {
  if (!text.trim()) {
    return { business_name: "", invoice_number: "", amount: "", gst: "", due_date: "" };
  }

  return {
    business_name: findBusinessName(text),
    invoice_number: findInvoiceNumber(text),
    amount: findTotalAmount(text),
    gst: findGstAmount(text),
    due_date: findDueDate(text),
  };
}
