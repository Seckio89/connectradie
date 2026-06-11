import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Stop-words to exclude from keyword extraction
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "not", "no", "all", "each", "every", "any", "few", "more", "most",
  "other", "some", "such", "than", "too", "very", "just", "also",
  "if", "then", "so", "that", "this", "these", "those", "what", "which",
  "who", "whom", "how", "when", "where", "why", "up", "out", "off",
  "over", "under", "again", "further", "once", "here", "there", "about",
  "above", "below", "between", "both", "during", "before", "after",
  "into", "through", "its", "our", "your", "my", "his", "her", "their",
  "we", "you", "he", "she", "they", "i", "me", "him", "us", "them",
  "etc", "per", "via",
]);

// Minimum keyword length
const MIN_KEYWORD_LENGTH = 3;

/**
 * Extract meaningful keywords from a description.
 * Returns an array of lowercase keyword strings.
 */
function extractKeywords(description: string): string[] {
  // Split on non-alphanumeric, filter stop-words and short tokens
  const tokens = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(word),
    );

  // Also extract two-word phrases (bigrams)
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    // Only keep bigrams where both words are meaningful
    if (
      words[i].length >= MIN_KEYWORD_LENGTH &&
      words[i + 1].length >= MIN_KEYWORD_LENGTH &&
      !STOP_WORDS.has(words[i]) &&
      !STOP_WORDS.has(words[i + 1])
    ) {
      bigrams.push(phrase);
    }
  }

  // Deduplicate
  return [...new Set([...tokens, ...bigrams])];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    let supabaseUrl: string, supabaseServiceKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    } catch (e) {
      console.error(e);
      return errorJson("Server configuration error", 500);
    }

    // Service role auth only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);
    if (token !== supabaseServiceKey) {
      return errorJson("Forbidden — service role only", 403);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch unprocessed raw descriptions (those not yet analysed)
    // We process in batches — grab the oldest 100 unprocessed rows
    const { data: rawRows, error: fetchError } = await supabase
      .from("service_description_raw")
      .select("id, service_type, description")
      .order("created_at", { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error("Failed to fetch raw descriptions:", fetchError);
      return errorJson("Failed to fetch raw descriptions", 500);
    }

    if (!rawRows || rawRows.length === 0) {
      return jsonResponse({ processed: 0, keywords_upserted: 0 });
    }

    let keywordsUpserted = 0;
    const errors: string[] = [];

    // Aggregate keywords across all rows, grouped by service_type
    const keywordMap: Record<string, Record<string, number>> = {};

    for (const row of rawRows) {
      const keywords = extractKeywords(row.description);
      if (!keywordMap[row.service_type]) {
        keywordMap[row.service_type] = {};
      }
      for (const kw of keywords) {
        keywordMap[row.service_type][kw] =
          (keywordMap[row.service_type][kw] || 0) + 1;
      }
    }

    // Upsert keywords into service_description_keywords
    for (const [serviceType, keywords] of Object.entries(keywordMap)) {
      for (const [keyword, count] of Object.entries(keywords)) {
        const { error: upsertError } = await supabase
          .from("service_description_keywords")
          .upsert(
            {
              service_type: serviceType,
              keyword,
              frequency: count,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "service_type,keyword" },
          );

        if (upsertError) {
          errors.push(
            `Failed to upsert keyword "${keyword}" for ${serviceType}: ${upsertError.message}`,
          );
        } else {
          keywordsUpserted++;
        }
      }
    }

    // Delete processed raw rows
    const processedIds = rawRows.map((r) => r.id);
    const { error: deleteError } = await supabase
      .from("service_description_raw")
      .delete()
      .in("id", processedIds);

    if (deleteError) {
      errors.push(`Failed to clean up processed rows: ${deleteError.message}`);
    }

    return jsonResponse({
      processed: rawRows.length,
      keywords_upserted: keywordsUpserted,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("analyse-description-keywords error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
