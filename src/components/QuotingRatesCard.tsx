// ─────────────────────────────────────────────────────────────────────────────
// QuotingRatesCard — the charge-side defaults every new quote starts from,
// mounted in Settings → Professional above the cost basis card.
//
// The split between this card and CostBasisSettingsCard is the same one the cost
// model rests on: this is what the CLIENT PAYS, that is what the JOB COSTS. Only
// the second answers "does this quote clear my costs", so mixing them would blur
// the distinction MarginCheckPanel exists to show.
//
// The hourly rate is deliberately NOT here. It is advertised on the public tradie
// profile, so it is edited on My Profile with the other public fields — whereas a
// markup and a margin are nobody's business but the tradie's, which is why they
// live on the owner-only tradie_cost_settings table.
//
// Call-out fee is the exception on this card: it comes from profiles.call_out_fee
// rather than tradie_cost_settings, because a call-out fee can be shown to clients
// (profiles.show_callout_fee). This card is its ONLY editor — the professional
// settings form used to round-trip the value on save with no input to change it.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Receipt, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CostField, costFieldInputClass } from './CostBasisFields';
import {
  getQuotingDefaults, saveQuotingRates,
  DEFAULT_MARGIN_PCT, DEFAULT_MATERIALS_MARKUP_PCT,
} from '../lib/pricingHelper';

export default function QuotingRatesCard() {
  const { user, profile, refreshProfile } = useAuth();
  const [callOutFee, setCallOutFee] = useState('');
  const [marginPct, setMarginPct] = useState(String(DEFAULT_MARGIN_PCT));
  const [markupPct, setMarkupPct] = useState(String(DEFAULT_MATERIALS_MARKUP_PCT));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    getQuotingDefaults(user.id)
      .then(({ marginPct: m, materialsMarkupPct: mk }) => {
        if (!live) return;
        setMarginPct(String(m));
        setMarkupPct(String(mk));
        setLoading(false);
      })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user?.id]);

  // Call-out fee rides on the profile, which AuthContext already holds.
  useEffect(() => {
    setCallOutFee(profile?.call_out_fee != null ? String(profile.call_out_fee) : '');
  }, [profile?.call_out_fee]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');

    const rates = await saveQuotingRates(user.id, {
      marginPct: Number(marginPct),
      materialsMarkupPct: Number(markupPct),
    });

    // Two tables, so two writes. The fee is on profiles because it can be shown
    // to clients; the percentages are not, and are owner-only.
    const trimmed = callOutFee.trim();
    const feeValue = trimmed === '' ? null : Math.max(0, Math.round(Number(trimmed)));
    let feeOk = true;
    if (rates.ok && (feeValue === null || Number.isFinite(feeValue))) {
      const { error: feeErr } = await supabase
        .from('profiles')
        .update({ call_out_fee: feeValue })
        .eq('id', user.id);
      feeOk = !feeErr;
      if (feeOk) await refreshProfile();
    }

    setSaving(false);
    if (rates.ok && feeOk) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(rates.ok
        ? 'Your percentages saved, but the call-out fee did not. Try again.'
        : rates.error ?? 'Could not save your rates.');
    }
  };

  return (
    <div className="bg-ct-surface border border-ct-line rounded-ct-md overflow-hidden">
      <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-ct-line-soft bg-ct-surface-2/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center">
            <Receipt className="w-5 h-5 text-ct-mute-2" />
          </div>
          <div>
            <h3 className="font-semibold text-ct-paper">Quoting rates</h3>
            <p className="text-xs text-ct-mute">What every new quote starts with</p>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ct-mute">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your rates…
          </div>
        ) : (
          <>
            <p className="text-xs text-ct-mute-2 leading-relaxed">
              Starting points, not rules. Change any of them on a quote and that job uses the new
              figure — what you set here is only where each quote begins.
            </p>

            <CostField
              label="Call-out fee"
              suffix="$"
              hint="A flat fee added to every job, on top of the hours. We add $0.60 per km from your base to the client on top of it. Leave blank for no call-out fee."
            >
              <input
                type="number"
                min="0"
                step="5"
                inputMode="decimal"
                className={costFieldInputClass}
                placeholder="No call-out fee"
                value={callOutFee}
                onChange={(e) => setCallOutFee(e.target.value)}
              />
            </CostField>

            <CostField
              label="Materials markup"
              suffix="%"
              hint="Added to what the materials cost you. Covers your time sourcing, collecting and warranting them. Leave at 0 to pass materials through at cost."
            >
              <input
                type="number"
                min="0"
                max="200"
                step="1"
                inputMode="decimal"
                className={costFieldInputClass}
                value={markupPct}
                onChange={(e) => setMarkupPct(e.target.value)}
              />
            </CostField>

            <CostField
              label="Default margin"
              suffix="%"
              hint="Added on top of everything — hours, materials and call-out. This is the one that raises what the client pays; the profit figure on Your costs only sets the bar the margin check measures against. Leave at 0 if your hourly rate already carries your profit."
            >
              <input
                type="number"
                min="0"
                max="200"
                step="1"
                inputMode="decimal"
                className={costFieldInputClass}
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
              />
            </CostField>

            {error && (
              <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md">
                <p className="text-xs text-ct-rose">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:brightness-110 transition-colors disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save my rates
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ct-teal">
                  <Check className="w-3.5 h-3.5" /> Rates saved
                </span>
              )}
            </div>

            <p className="text-[0.6875rem] leading-snug text-ct-mute">
              Your hourly rate sits on My&nbsp;Profile, with the other details clients can see. Your
              markup and margin stay here — no client ever sees them.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
