import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock import.meta.env
// ---------------------------------------------------------------------------

// @ts-expect-error -- vitest allows stubbing import.meta.env
import.meta.env.VITE_SUPABASE_URL = 'https://test-project.supabase.co';
// @ts-expect-error
import.meta.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key-1234567890';

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js
// ---------------------------------------------------------------------------

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/test.jpg' } })),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock navigator.geolocation
// ---------------------------------------------------------------------------

const mockGeolocation: Geolocation = {
  getCurrentPosition: vi.fn((success: PositionCallback) => {
    success({
      coords: {
        latitude: -33.8688,
        longitude: 151.2093,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as GeolocationPosition);
  }),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

Object.defineProperty(navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true,
});

// ---------------------------------------------------------------------------
// Mock localStorage & sessionStorage
// ---------------------------------------------------------------------------

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
}

Object.defineProperty(window, 'localStorage', { value: createMockStorage(), writable: true });
Object.defineProperty(window, 'sessionStorage', { value: createMockStorage(), writable: true });

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  blob: vi.fn().mockResolvedValue(new Blob()),
});
