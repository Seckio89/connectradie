import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeoPosition {
  lat: number;
  lng: number;
}

export interface GeolocationState {
  coords: GeoPosition | null;
  loading: boolean;
  error: string | null;
}

export interface GeocodedAddress {
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Coordinates for Australian state/territory capital cities [lat, lng]. */
export const AU_CAPITAL_COORDS: Record<string, [number, number]> = {
  sydney: [-33.8688, 151.2093],
  melbourne: [-37.8136, 144.9631],
  brisbane: [-27.4705, 153.0260],
  perth: [-31.9505, 115.8605],
  adelaide: [-34.9285, 138.6007],
  canberra: [-35.2809, 149.1300],
  hobart: [-42.8821, 147.3272],
  darwin: [-12.4634, 130.8456],
};

const CACHE_KEY = 'connectradie_geo_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the distance between two geographic points using the Haversine
 * formula.
 *
 * @returns Distance in kilometres.
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * One-shot current position that bypasses the sessionStorage cache — for
 * point-in-time checks like "is the worker at the job site right now?".
 * Resolves null on denial / unavailability / timeout (never throws) so callers
 * can fail open rather than blocking the user.
 */
export function getCurrentPositionOnce(timeoutMs = 8000): Promise<GeoPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/**
 * Sort an array of items that have `lat` and `lng` properties by distance
 * from the given user coordinates (nearest first).
 */
export function sortByDistance<T extends { lat: number; lng: number }>(
  items: T[],
  userLat: number,
  userLng: number,
): T[] {
  return [...items].sort((a, b) => {
    const distA = calculateDistance(userLat, userLng, a.lat, a.lng);
    const distB = calculateDistance(userLat, userLng, b.lat, b.lng);
    return distA - distB;
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGeolocation() {
  const [coords, setCoords] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // ---- getPosition --------------------------------------------------

  const getPosition = useCallback((): Promise<GeoPosition> => {
    // Check sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { pos: GeoPosition; ts: number };
        if (Date.now() - parsed.ts < CACHE_TTL_MS) {
          setCoords(parsed.pos);
          return Promise.resolve(parsed.pos);
        }
        sessionStorage.removeItem(CACHE_KEY);
      }
    } catch {
      // Ignore corrupt cache
    }

    setLoading(true);
    setError(null);
    abortRef.current = false;

    return new Promise<GeoPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'Geolocation is not supported by this browser';
        setError(msg);
        setLoading(false);
        reject(new Error(msg));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (abortRef.current) return;
          const pos: GeoPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCoords(pos);
          setLoading(false);

          // Cache in sessionStorage
          try {
            sessionStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ pos, ts: Date.now() }),
            );
          } catch {
            // Storage full — ignore
          }

          resolve(pos);
        },
        (err) => {
          if (abortRef.current) return;
          const msg = err.message || 'Failed to get location';
          setError(msg);
          setLoading(false);
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }, []);

  // ---- reverseGeocode -----------------------------------------------

  const reverseGeocode = useCallback(
    async (lat: number, lng: number): Promise<GeocodedAddress> => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      });

      if (!res.ok) {
        throw new Error(`Reverse geocode failed: ${res.status}`);
      }

      const data = await res.json();
      const addr = data.address ?? {};

      return {
        suburb: addr.suburb ?? addr.town ?? addr.village ?? null,
        city: addr.city ?? addr.town ?? null,
        state: addr.state ?? null,
        postcode: addr.postcode ?? null,
        country: addr.country ?? null,
        displayName: data.display_name ?? '',
      };
    },
    [],
  );

  // ---- return -------------------------------------------------------

  return {
    coords,
    loading,
    error,
    getPosition,
    reverseGeocode,
    calculateDistance,
    sortByDistance,
  };
}
