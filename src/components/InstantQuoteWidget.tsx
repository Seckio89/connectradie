import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  Ruler,
  Tag,
  Calculator,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface StandardRate {
  id: string;
  tradie_id: string;
  service_name: string;
  description: string | null;
  rate_type: 'hourly' | 'fixed' | 'per_sqm';
  rate_amount: number;
  is_active: boolean;
  created_at: string;
}

interface InstantQuoteWidgetProps {
  tradieId: string;
  isOwner?: boolean;
  tradeCategory?: string;
  className?: string;
}

interface RateFormState {
  service_name: string;
  description: string;
  rate_type: 'hourly' | 'fixed' | 'per_sqm';
  rate_amount: string;
}

const EMPTY_FORM: RateFormState = {
  service_name: '',
  description: '',
  rate_type: 'hourly',
  rate_amount: '',
};

const SUGGESTED_SERVICES: Record<string, string[]> = {
  plumber: ['Tap replacement', 'Blocked drain', 'Hot water service', 'Leak repair', 'Toilet repair'],
  electrician: ['Power point install', 'Light fitting', 'Switchboard upgrade', 'Safety inspection', 'Fan install'],
  builder: ['Wall framing', 'Deck construction', 'Fence install', 'Renovation consult', 'Structural repair'],
  painter: ['Single room', 'Full house interior', 'Exterior paint', 'Fence staining', 'Touch-up service'],
  landscaper: ['Garden cleanup', 'Lawn mowing', 'Tree trimming', 'Retaining wall', 'Irrigation install'],
};

const RATE_TYPE_CONFIG = {
  hourly: { label: 'Hourly', icon: Clock, color: 'bg-blue-100 text-blue-700' },
  fixed: { label: 'Fixed', icon: Tag, color: 'bg-green-100 text-green-700' },
  per_sqm: { label: 'Per sqm', icon: Ruler, color: 'bg-purple-100 text-purple-700' },
};

function formatAUD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function RateTypeBadge({ type }: { type: 'hourly' | 'fixed' | 'per_sqm' }) {
  const config = RATE_TYPE_CONFIG[type];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export default function InstantQuoteWidget({
  tradieId,
  isOwner = false,
  tradeCategory,
  className = '',
}: InstantQuoteWidgetProps) {
  const [rates, setRates] = useState<StandardRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RateFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [estimateHours, setEstimateHours] = useState<string>('');
  const [selectedRateForEstimate, setSelectedRateForEstimate] = useState<string | null>(null);

  const suggestions = tradeCategory
    ? SUGGESTED_SERVICES[tradeCategory.toLowerCase()] || []
    : [];

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('standard_rates')
        .select('*')
        .eq('tradie_id', tradieId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setRates(data || []);
    } catch (err) {
      setError('Failed to load rates');
    } finally {
      setLoading(false);
    }
  }, [tradieId]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const handleSave = async () => {
    if (!form.service_name.trim() || !form.rate_amount) {
      setError('Service name and rate amount are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const rateData = {
        tradie_id: tradieId,
        service_name: form.service_name.trim(),
        description: form.description.trim() || null,
        rate_type: form.rate_type,
        rate_amount: parseFloat(form.rate_amount),
        is_active: true,
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('standard_rates')
          .update(rateData)
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('standard_rates')
          .insert(rateData);
        if (insertError) throw insertError;
      }

      setForm(EMPTY_FORM);
      setShowAddForm(false);
      setEditingId(null);
      await fetchRates();
    } catch (err) {
      setError('Failed to save rate');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (rate: StandardRate) => {
    setForm({
      service_name: rate.service_name,
      description: rate.description || '',
      rate_type: rate.rate_type,
      rate_amount: rate.rate_amount.toString(),
    });
    setEditingId(rate.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('standard_rates')
        .update({ is_active: false })
        .eq('id', id);
      if (deleteError) throw deleteError;
      await fetchRates();
    } catch (err) {
      setError('Failed to delete rate');
    }
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setShowAddForm(false);
    setEditingId(null);
    setError(null);
  };

  const handleSuggestionClick = (name: string) => {
    setForm((prev) => ({ ...prev, service_name: name }));
    setShowSuggestions(false);
  };

  const estimateTotal = (() => {
    if (!selectedRateForEstimate || !estimateHours) return null;
    const rate = rates.find((r) => r.id === selectedRateForEstimate);
    if (!rate) return null;
    const hours = parseFloat(estimateHours);
    if (isNaN(hours) || hours <= 0) return null;

    if (rate.rate_type === 'hourly') {
      return rate.rate_amount * hours;
    }
    return rate.rate_amount;
  })();

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Standard Rates</h3>
        </div>
        {isOwner && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Rate
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Add / Edit Form */}
      {isOwner && showAddForm && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="space-y-3">
            {/* Service name with suggestions */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-700 mb-1">Service Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.service_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, service_name: e.target.value }))}
                  placeholder="e.g. Tap replacement"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {suggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    className="px-2 py-2 border border-gray-300 rounded-md text-gray-500 hover:bg-gray-100"
                    title="Suggested services"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleSuggestionClick(name)}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the service"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Rate Type</label>
                <select
                  value={form.rate_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      rate_type: e.target.value as 'hourly' | 'fixed' | 'per_sqm',
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="hourly">Hourly</option>
                  <option value="fixed">Fixed Price</option>
                  <option value="per_sqm">Per Square Metre</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount (AUD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.rate_amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, rate_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editingId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 text-sm font-medium rounded-md hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rates list */}
      <div className="divide-y divide-gray-100">
        {rates.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {isOwner
              ? 'No standard rates yet. Add your first rate to help customers get instant quotes.'
              : 'No standard rates available.'}
          </div>
        )}

        {rates.map((rate) => (
          <div key={rate.id} className="px-4 py-3 flex items-center justify-between group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {rate.service_name}
                </span>
                <RateTypeBadge type={rate.rate_type} />
              </div>
              {rate.description && (
                <p className="text-xs text-gray-500 truncate">{rate.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 ml-3">
              <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                {formatAUD(rate.rate_amount)}
                {rate.rate_type === 'hourly' && <span className="text-xs font-normal text-gray-500">/hr</span>}
                {rate.rate_type === 'per_sqm' && <span className="text-xs font-normal text-gray-500">/sqm</span>}
              </span>
              {isOwner && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(rate)}
                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                    title="Edit rate"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(rate.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Delete rate"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Estimate calculator */}
      {rates.some((r) => r.rate_type === 'hourly') && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">Estimate Calculator</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedRateForEstimate || ''}
              onChange={(e) => setSelectedRateForEstimate(e.target.value || null)}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a service</option>
              {rates
                .filter((r) => r.rate_type === 'hourly')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.service_name} — {formatAUD(r.rate_amount)}/hr
                  </option>
                ))}
            </select>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={estimateHours}
              onChange={(e) => setEstimateHours(e.target.value)}
              placeholder="Hours"
              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {estimateTotal !== null && (
            <div className="mt-2 text-sm">
              <span className="text-gray-600">Estimated total: </span>
              <span className="font-semibold text-green-700">{formatAUD(estimateTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { RateTypeBadge, formatAUD };
export type { InstantQuoteWidgetProps, StandardRate };
