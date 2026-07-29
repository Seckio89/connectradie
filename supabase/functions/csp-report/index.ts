// CSP violation collector.
//
// The Content-Security-Policy has been served in REPORT-ONLY mode since
// 2026-07-12 with no `report-uri` — so it has been reporting to nobody. The plan
// was "monitor for 1-2 weeks, then enforce", but there was nothing to monitor:
// violations only ever appeared in whichever user's console happened to be open.
// Flipping to enforce off the back of that would have been a guess.
//
// This gives report-only somewhere to send them. Once real traffic has run
// through it and the log is quiet, the header can be flipped to enforcing on
// evidence instead.
//
// DESIGN — this is a PUBLIC, UNAUTHENTICATED endpoint. Browsers cannot attach a
// JWT to a violation report, so it must accept anonymous POSTs, which means
// anyone can post to it. Therefore:
//
//   • It writes NOTHING to the database. Logging only, so it cannot be used to
//     fill a table.
//   • The body is size-capped before parsing.
//   • Only a fixed set of known fields is logged, each truncated. Nothing from
//     the request is echoed back in the response.
//   • It always answers 204 with no body — no parse errors surfaced, nothing to
//     probe for.
//
// Reports land in the function logs:
//   supabase functions logs csp-report --project-ref <ref>

// A violation report is small. Anything larger is not a browser.
const MAX_BODY_BYTES = 8_192;
const MAX_FIELD_LEN = 300;

const clip = (v: unknown): string | undefined => {
  if (typeof v !== "string" || v.length === 0) return undefined;
  return v.length > MAX_FIELD_LEN ? `${v.slice(0, MAX_FIELD_LEN)}…` : v;
};

/** 204, always. Callers get no signal either way. */
const noContent = () => new Response(null, { status: 204 });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return noContent();
  if (req.method !== "POST") return new Response(null, { status: 405 });

  try {
    const raw = await req.text();
    if (raw.length === 0 || raw.length > MAX_BODY_BYTES) return noContent();

    const parsed = JSON.parse(raw);

    // Two wire formats reach here:
    //   report-uri → { "csp-report": {...} }          (Content-Type: application/csp-report)
    //   report-to  → [ { type, body: {...} }, ... ]   (Content-Type: application/reports+json)
    const reports: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed.map((r) => (r?.body ?? r) as Record<string, unknown>)
      : [(parsed["csp-report"] ?? parsed) as Record<string, unknown>];

    for (const r of reports.slice(0, 10)) {
      // Hyphenated keys are the report-uri format, camelCase the report-to one.
      const directive = clip(r["effective-directive"] ?? r["effectiveDirective"] ??
        r["violated-directive"] ?? r["violatedDirective"]);
      const blocked = clip(r["blocked-uri"] ?? r["blockedURL"] ?? r["blockedURI"]);
      const document = clip(r["document-uri"] ?? r["documentURL"] ?? r["documentURI"]);
      const disposition = clip(r["disposition"]);

      // Nothing useful in the report — probably not a real violation. Skip
      // rather than log an empty line for every stray POST.
      if (!directive && !blocked) continue;

      console.warn(
        `CSP violation: directive=${directive ?? "?"} blocked=${blocked ?? "?"} ` +
          `on=${document ?? "?"} disposition=${disposition ?? "report"}`,
      );
    }
  } catch {
    // Malformed body. Deliberately silent: this endpoint is open, and logging
    // every junk POST would turn the log into the noise it exists to remove.
  }

  return noContent();
});
