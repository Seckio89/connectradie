import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { TradeCategory } from '../types/database';

interface TradeCategoryOption {
  value: string;
  label: string;
}

// Fallback categories used while DB loads or if fetch fails.
// Once DB is the source of truth, this can be removed.
const FALLBACK_CATEGORIES: TradeCategoryOption[] = [
  { value: '', label: 'All Trades' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'builder', label: 'Builder' },
  { value: 'painter', label: 'Painter' },
  { value: 'landscaper', label: 'Landscaper' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'roofer', label: 'Roofer' },
  { value: 'tiler', label: 'Tiler' },
];

// Module-level cache so multiple components share one fetch
let cachedCategories: TradeCategoryOption[] | null = null;
let fetchPromise: Promise<TradeCategoryOption[]> | null = null;

async function loadCategories(): Promise<TradeCategoryOption[]> {
  const { data, error } = await supabase
    .from('trade_categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    return FALLBACK_CATEGORIES;
  }

  const options: TradeCategoryOption[] = [
    { value: '', label: 'All Trades' },
    ...data.map((cat: TradeCategory) => ({
      value: cat.name.toLowerCase().replace(/\s+/g, '-'),
      label: cat.name,
    })),
  ];

  cachedCategories = options;
  return options;
}

export function useTradeCategories(): { categories: TradeCategoryOption[]; loading: boolean } {
  const [categories, setCategories] = useState<TradeCategoryOption[]>(cachedCategories || FALLBACK_CATEGORIES);
  const [loading, setLoading] = useState(!cachedCategories);

  useEffect(() => {
    if (cachedCategories) {
      setCategories(cachedCategories);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = loadCategories();
    }

    fetchPromise.then((result) => {
      setCategories(result);
      setLoading(false);
    });
  }, []);

  return { categories, loading };
}
