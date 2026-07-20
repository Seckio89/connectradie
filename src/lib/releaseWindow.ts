// ─────────────────────────────────────────────────────────────────────────────
// Client review window — how long after job completion the client has to raise
// an issue before escrow auto-releases to the tradie. Must match the cutoff in
// supabase/functions/auto-release-payments (RELEASE_WINDOW_HOURS there).
// ─────────────────────────────────────────────────────────────────────────────

export const RELEASE_WINDOW_HOURS = 5;
export const RELEASE_WINDOW_MS = RELEASE_WINDOW_HOURS * 60 * 60 * 1000;
export const RELEASE_WINDOW_LABEL = `${RELEASE_WINDOW_HOURS} hours`;
