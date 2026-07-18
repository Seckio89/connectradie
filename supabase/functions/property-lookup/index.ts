// ─────────────────────────────────────────────────────────────────────────────
// property-lookup — returns a Street View photo (+ formatted address) for a
// client's property, so the quoting UI can show the building. Accepts either
// coordinates (preferred — the contact already has lat/lng) or a raw address.
//
// The Google API key NEVER reaches the browser: this function fetches the image
// server-side and returns it as a base64 data URI.
//
// Security (ConnecTradie audit checklist):
//   - Bearer token verified via supabase.auth.getUser()          [CRITICAL]
//   - CORS from an allow-list, not wildcard                       [MAJOR]
//   - Input validation                                            [CRITICAL]
//   - Structured JSON errors                                      [MINOR]
//   - No hardcoded secrets — key + origins from env              [CRITICAL]
//
// Secrets to set:
//   supabase secrets set GOOGLE_MAPS_API_KEY=...      (Geocoding + Street View Static enabled)
//   supabase secrets set ALLOWED_ORIGINS=https://app.connectradie.com,http://localhost:5173
//
// NOTE ON floorAreaEstimateM2: there is no free source that returns exact
// internal floor area for an arbitrary AU address. It is returned as null here.
// To populate it, wire a paid provider (CoreLogic / Domain / Pricefinder) where
// the TODO is marked, then the UI's "Use ≈ X m²" button lights up automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LookupBody {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

interface LookupResult {
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  photoDataUri: string | null;
  floorAreaEstimateM2: number | null;
}

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))
      ? origin
      : ALLOWED_ORIGINS[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function streetViewDataUri(lat: number, lng: number, apiKey: string): Promise<string | null> {
  const url =
    'https://maps.googleapis.com/maps/api/streetview?size=640x360&location=' +
    `${lat},${lng}&fov=80&pitch=5&return_error_code=true&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null; // 404 when no imagery exists for the location
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  // --- Auth ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401, origin);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401, origin);

  // --- Input ---
  let body: LookupBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const hasCoords =
    typeof body.lat === 'number' && typeof body.lng === 'number' &&
    Math.abs(body.lat) <= 90 && Math.abs(body.lng) <= 180;
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!hasCoords && (address.length < 5 || address.length > 250)) {
    return json({ error: 'Provide coordinates or a valid address (5–250 chars)' }, 400, origin);
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return json({ error: 'Lookup is not configured' }, 500, origin);

  try {
    let lat = hasCoords ? (body.lat as number) : null;
    let lng = hasCoords ? (body.lng as number) : null;
    let formattedAddress: string | null = address || null;

    // Geocode only when we don't already have coordinates.
    if (!hasCoords) {
      const geoUrl =
        'https://maps.googleapis.com/maps/api/geocode/json?address=' +
        encodeURIComponent(address) + '&region=au&key=' + apiKey;
      const geo = await (await fetch(geoUrl)).json();
      if (geo.status !== 'OK' || !geo.results?.length) {
        return json({ error: 'Address not found' }, 404, origin);
      }
      lat = geo.results[0].geometry.location.lat;
      lng = geo.results[0].geometry.location.lng;
      formattedAddress = geo.results[0].formatted_address;
    }

    const photoDataUri = await streetViewDataUri(lat as number, lng as number, apiKey);

    // TODO: wire a paid property-data provider here to populate floor area.
    const result: LookupResult = {
      formattedAddress,
      lat,
      lng,
      photoDataUri,
      floorAreaEstimateM2: null,
    };
    return json(result, 200, origin);
  } catch (_err) {
    return json({ error: 'Lookup failed' }, 502, origin);
  }
});
