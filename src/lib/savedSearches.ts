import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFilters {
  trade_category?: string;
  postcode?: string;
  radius_km?: number;
  min_rating?: number;
  verified_only?: boolean;
  insured_only?: boolean;
  emergency_available?: boolean;
  sort_by?: 'rating' | 'distance' | 'price' | 'reviews';
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  filters: SearchFilters;
  alerts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_SEARCHES_KEY = 'connectradie_recent_searches';
const MAX_RECENT_SEARCHES = 10;

// ---------------------------------------------------------------------------
// Saved searches (database-backed)
// ---------------------------------------------------------------------------

/**
 * Save a new search to the database.
 */
export async function saveSearch(
  name: string,
  filters: SearchFilters,
): Promise<SavedSearch> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: user.id,
      name,
      filters: filters as unknown as Record<string, unknown>,
      alerts_enabled: false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as unknown as SavedSearch;
}

/**
 * Fetch all saved searches for a user.
 */
export async function getSavedSearches(userId?: string): Promise<SavedSearch[]> {
  let uid = userId;

  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    uid = user.id;
  }

  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data as unknown as SavedSearch[]) ?? [];
}

/**
 * Delete a saved search.
 */
export async function deleteSavedSearch(searchId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_searches')
    .delete()
    .eq('id', searchId);

  if (error) throw new Error(error.message);
}

/**
 * Toggle email alerts for a saved search.
 */
export async function toggleSearchAlerts(
  searchId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('saved_searches')
    .update({ alerts_enabled: enabled })
    .eq('id', searchId);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Filter query builder
// ---------------------------------------------------------------------------

/**
 * Build a Supabase PostgREST query from a {@link SearchFilters} object.
 * Returns a query builder that can be further chained or executed.
 */
export function buildFilterQuery(filters: SearchFilters) {
  let query = supabase
    .from('profiles')
    .select('*')
    .eq('role', 'tradie');

  if (filters.trade_category) {
    query = query.contains('trade_categories', [filters.trade_category]);
  }

  if (filters.postcode) {
    query = query.eq('postcode', filters.postcode);
  }

  if (filters.min_rating) {
    query = query.gte('average_rating', filters.min_rating);
  }

  if (filters.verified_only) {
    query = query.eq('verification_status', 'verified');
  }

  if (filters.insured_only) {
    query = query.not('insurance_policy', 'is', null);
  }

  if (filters.emergency_available) {
    query = query.eq('is_emergency_available', true);
  }

  // Apply sort
  switch (filters.sort_by) {
    case 'rating':
      query = query.order('average_rating', { ascending: false });
      break;
    case 'reviews':
      query = query.order('total_reviews', { ascending: false });
      break;
    case 'price':
      query = query.order('hourly_rate', { ascending: true });
      break;
    case 'distance':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  return query;
}

// ---------------------------------------------------------------------------
// Recent searches (localStorage-backed)
// ---------------------------------------------------------------------------

/**
 * Add a search query to the recent searches list.
 * Deduplicates and caps at {@link MAX_RECENT_SEARCHES}.
 */
export function addRecentSearch(query: string): void {
  if (!query.trim()) return;

  const searches = getRecentSearches();
  const filtered = searches.filter(
    (s) => s.toLowerCase() !== query.trim().toLowerCase(),
  );
  filtered.unshift(query.trim());

  const capped = filtered.slice(0, MAX_RECENT_SEARCHES);

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(capped));
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
}

/**
 * Retrieve recent searches from localStorage.
 */
export function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Clear all recent searches from localStorage.
 */
export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // silently ignore
  }
}
