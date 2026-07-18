// ─────────────────────────────────────────────────────────────────────────────
// Quick Quote presets — one-tap full quotes for common job types. Keyed by the
// tradie's trade_category (case-insensitive). Each preset pre-fills the title,
// a starter scope (tasks → description lines) and a ballpark price the tradie
// adjusts before sending. Cleaning is the primary focus; extend per trade.
// ─────────────────────────────────────────────────────────────────────────────

export interface QuickQuotePreset {
  label: string;
  title: string;
  tasks: string[];
  price: number;
}

const QUICK_QUOTE_PRESETS: Record<string, QuickQuotePreset[]> = {
  cleaner: [
    {
      label: 'Standard house clean',
      title: 'Standard house clean',
      tasks: ['Mop floors', 'Vacuum carpets', 'Bathroom clean', 'Kitchen clean', 'Dust and polish'],
      price: 200,
    },
    {
      label: 'Office clean',
      title: 'Office clean',
      tasks: ['Vacuum carpets', 'Empty bins', 'Wipe down surfaces', 'Bathroom clean', 'Kitchen clean'],
      price: 250,
    },
    {
      label: 'End of lease clean',
      title: 'End of lease clean',
      tasks: ['Oven and rangehood', 'Bathroom deep clean', 'Kitchen deep clean', 'Window cleaning', 'Steam clean carpets', 'Skirting boards and walls'],
      price: 350,
    },
  ],
};

/** Quick Quote presets for a trade (case-insensitive). Empty if none defined. */
export function getQuickQuotePresets(category: string | null | undefined): QuickQuotePreset[] {
  if (!category) return [];
  const key = category.toLowerCase();
  if (QUICK_QUOTE_PRESETS[key]) return QUICK_QUOTE_PRESETS[key];
  const match = Object.keys(QUICK_QUOTE_PRESETS).find((k) => k === key || key.includes(k));
  return match ? QUICK_QUOTE_PRESETS[match] : [];
}
