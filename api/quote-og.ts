// ─────────────────────────────────────────────────────────────────────────────
// Vercel Edge Function — server-rendered Open Graph tags for shared quote links.
//
// Social / SMS / RCS crawlers don't run the SPA's JavaScript, so a shared
// connectradie.com/quote/<token> link would otherwise inherit the landing page's
// OG tags (the hero cartoon + "Find Licensed Tradies…"). This proxies the REAL
// app shell (index.html) and swaps in per-quote title/description/image, so:
//   • crawlers read the correct preview (business + job + price + logo)
//   • real users still get the full working SPA (no redirect, no flash)
//
// Safe by design: if the quote lookup fails we return the unmodified shell
// (default OG — same as before). If even the shell fetch fails we 302 to
// ?raw=1, which the vercel.json rewrite lets through to the plain SPA.
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://uoqygmizupdpanplpvor.supabase.co';
// Public anon key — the same one that ships in the web bundle. Only used to pass
// the Supabase gateway for the token-gated, READ-ONLY public-quote function.
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcXlnbWl6dXBkcGFucGxwdm9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMzU3MjcsImV4cCI6MjA4MzYxMTcyN30.IADcyqY-rAAGUqcuf-XAmMYVQ0uQTa_Ptg3k8UgFcGk';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const token = (url.searchParams.get('token') || url.pathname.split('/').pop() || '').trim();

  // Always serve the real SPA shell so the interactive page keeps working.
  let html: string;
  try {
    const shell = await fetch(`${origin}/index.html`);
    if (!shell.ok) throw new Error('shell fetch failed');
    html = await shell.text();
  } catch {
    // Last resort — hand off to the plain SPA (rewrite lets ?raw=1 through).
    return Response.redirect(`${origin}/quote/${encodeURIComponent(token)}?raw=1`, 302);
  }

  try {
    if (token) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/public-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, action: 'view' }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d && !d.error) {
          const business = String(d.tradie?.business || d.tradie?.name || 'a local tradie');
          const jobTitle = d.job?.title ? cap(String(d.job.title)) : 'Your quote';
          const price = d.quote?.firmPrice ?? d.quote?.priceMax ?? d.quote?.priceMin;
          const priceStr = price != null ? ` — $${Number(price).toLocaleString('en-AU')}` : '';
          html = injectMeta(html, {
            title: `Quote from ${business} — ConnecTradie`,
            desc: `${jobTitle}${priceStr}`,
            image: `${origin}/brand/connectradie-icon-1024.png`,
            url: `${origin}/quote/${encodeURIComponent(token)}`,
          });
        }
      }
    }
  } catch {
    /* leave the default shell OG in place */
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

function injectMeta(html: string, m: { title: string; desc: string; image: string; url: string }): string {
  const T = esc(m.title), D = esc(m.desc), I = esc(m.image), U = esc(m.url);
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${T}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${D}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${T}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${D}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${I}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${U}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${T}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${D}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${I}$2`);
}
