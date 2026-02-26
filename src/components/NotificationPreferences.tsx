import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NotificationPreferencesProps {
  userId: string;
  className?: string;
}

interface PreferenceCategory {
  key: string;
  label: string;
  description: string;
}

const CATEGORIES: PreferenceCategory[] = [
  { key: 'job_updates', label: 'Job Updates', description: 'New applications, status changes, completions' },
  { key: 'quotes', label: 'Quotes', description: 'New quotes received, quote accepted/declined' },
  { key: 'messages', label: 'Messages', description: 'New message notifications' },
  { key: 'payments', label: 'Payments', description: 'Payment confirmations, refunds, escrow releases' },
  { key: 'reviews', label: 'Reviews', description: 'New review received, review reminders' },
  { key: 'marketing', label: 'Marketing', description: 'Tips, promotions, and platform news' },
  { key: 'account', label: 'Account', description: 'Security alerts, verification updates' },
  { key: 'reminders', label: 'Reminders', description: 'Recurring job reminders, license expiry alerts' },
];

export default function NotificationPreferences({
  userId,
  className = '',
}: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_preferences')
        .select('category, enabled')
        .eq('user_id', userId);

      if (error) throw error;

      const prefs: Record<string, boolean> = {};
      CATEGORIES.forEach((cat) => {
        prefs[cat.key] = true; // default to enabled
      });
      (data || []).forEach((row: { category: string; enabled: boolean }) => {
        prefs[row.category] = row.enabled;
      });

      setPreferences(prefs);
    } catch (err) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const savePreference = useCallback(
    async (category: string, enabled: boolean) => {
      setSaving(true);
      try {
        const { data: existing } = await supabase
          .from('email_preferences')
          .select('id')
          .eq('user_id', userId)
          .eq('category', category)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('email_preferences')
            .update({ enabled })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('email_preferences')
            .insert({ user_id: userId, category, enabled });
        }
      } catch (err) {
        // save error handled silently
      } finally {
        setSaving(false);
      }
    },
    [userId]
  );

  const handleToggle = (category: string) => {
    const newValue = !preferences[category];
    setPreferences((prev) => ({ ...prev, [category]: newValue }));

    // Debounce the save
    if (debounceTimers.current[category]) {
      clearTimeout(debounceTimers.current[category]);
    }
    debounceTimers.current[category] = setTimeout(() => {
      savePreference(category, newValue);
    }, 500);
  };

  const handleEnableAll = async () => {
    const updated: Record<string, boolean> = {};
    CATEGORIES.forEach((cat) => {
      updated[cat.key] = true;
    });
    setPreferences(updated);

    setSaving(true);
    try {
      await Promise.all(
        CATEGORIES.map((cat) => savePreference(cat.key, true))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisableAll = async () => {
    const updated: Record<string, boolean> = {};
    CATEGORIES.forEach((cat) => {
      updated[cat.key] = false;
    });
    setPreferences(updated);

    setSaving(true);
    try {
      await Promise.all(
        CATEGORIES.map((cat) => savePreference(cat.key, false))
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-gray-200 rounded" />
            <div className="h-5 bg-gray-200 rounded w-40" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-4 bg-gray-200 rounded w-28" />
                <div className="h-3 bg-gray-200 rounded w-48" />
              </div>
              <div className="w-10 h-5 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Email Notifications</h3>
          {saving && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnableAll}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Enable All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleDisableAll}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Disable All
          </button>
        </div>
      </div>

      {/* Preference toggles */}
      <div className="divide-y divide-gray-100">
        {CATEGORIES.map((category) => (
          <div
            key={category.key}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="min-w-0 flex-1 mr-4">
              <p className="text-sm font-medium text-gray-900">{category.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{category.description}</p>
            </div>
            <button
              role="switch"
              aria-checked={preferences[category.key] ?? true}
              onClick={() => handleToggle(category.key)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                preferences[category.key] ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  preferences[category.key] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { NotificationPreferencesProps, PreferenceCategory };
