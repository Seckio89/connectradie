// ─────────────────────────────────────────────────────────────────────────────
// OnboardingWelcome — Stage 1. A clean, single-screen welcome shown to a brand
// new user instead of the full dashboard. No sidebar, no bottom tabs, no nav —
// just a few essentials and one big Continue. On submit it saves and advances to
// stage 2. A "Skip setup" link jumps straight to the full dashboard (stage 4).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AddressAutocomplete from '../AddressAutocomplete';

export default function OnboardingWelcome() {
  const { profile, updateProfile } = useAuth();
  const isTradie = profile?.role === 'tradie';
  const firstName = (profile?.full_name || '').split(' ')[0];

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [trade, setTrade] = useState(profile?.declared_trades?.[0] ?? '');
  const [abn, setAbn] = useState(profile?.abn_number ?? '');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [addr, setAddr] = useState<{ suburb?: string; postcode?: string; state?: string; lat?: number; lng?: number }>({});
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState('');

  const canContinue = fullName.trim() && (isTradie ? trade.trim() : address.trim());

  const handleContinue = async () => {
    if (!canContinue) {
      setError(isTradie ? 'Add your name and trade to continue.' : 'Add your name and location to continue.');
      return;
    }
    setSaving(true);
    setError('');
    const updates = isTradie
      ? {
          full_name: fullName.trim(),
          declared_trades: [trade.trim()],
          abn_number: abn.trim() || null,
          onboarding_stage: 2,
        }
      : {
          full_name: fullName.trim(),
          address: address.trim() || null,
          suburb: addr.suburb ?? null,
          postcode: addr.postcode ?? null,
          base_latitude: addr.lat ?? null,
          base_longitude: addr.lng ?? null,
          onboarding_stage: 2,
        };
    const { error: err } = await updateProfile(updates);
    if (err) {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
    // On success the auth profile refreshes and the dashboard gate advances us.
  };

  const handleSkip = async () => {
    setSkipping(true);
    const { error: err } = await updateProfile({ onboarding_stage: 4 });
    if (err) setSkipping(false);
  };

  const inputCls =
    'w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block text-2xl font-extrabold tracking-tight text-navy-900 mb-4">
            Connec<span className="text-warm-500">Tradie</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
          </h1>
          <p className="text-sm text-gray-600 mt-1.5">
            {isTradie
              ? 'A couple of quick details and you’re ready to go.'
              : 'Just a couple of details to get you started.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sam Taylor"
              className={inputCls}
            />
          </div>

          {isTradie ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your trade or service</label>
                <input
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  placeholder="e.g. Electrician, Cleaner, Plumber"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Your ABN <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  placeholder="11 digit ABN"
                  inputMode="numeric"
                  className={`${inputCls} tabular-nums`}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your location</label>
              <AddressAutocomplete
                value={address}
                onChange={(value, coords, details) => {
                  setAddress(value);
                  setAddr({
                    suburb: details?.suburb,
                    postcode: details?.postcode,
                    state: details?.state,
                    lat: coords?.lat,
                    lng: coords?.lng,
                  });
                }}
                placeholder="Suburb or address"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleContinue}
            disabled={saving || skipping}
            className="w-full inline-flex items-center justify-center gap-2 bg-warm-500 hover:bg-warm-600 text-white px-5 py-3 rounded-xl font-semibold disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>

        <div className="text-center mt-5">
          <button
            onClick={handleSkip}
            disabled={saving || skipping}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium inline-flex items-center gap-1 disabled:opacity-60"
          >
            {skipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Skip setup, go to dashboard <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
