// ─────────────────────────────────────────────────────────────────────────────
// CostBasisSettingsCard — the canonical editor for the tradie's cost basis,
// mounted in Settings → Professional. The same fields also appear inline in the
// estimator's rates panel, so they can be filled in at the point of use; this is
// where they live for anyone who prefers to set them up once.
//
// Entirely optional. Nothing on this card is required to quote, nothing is
// validated against an award or statutory rate, and leaving it blank simply
// means no margin verdict appears anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Calculator, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import CostBasisFields, { CostField, costFieldInputClass } from './CostBasisFields';
import { COST_BASIS_DEFAULTS } from '../lib/costModel';
import type { CostBasis } from '../lib/costModel';
import { getQuotingDefaults, saveCostBasis, saveDefaultMarginPct, DEFAULT_MARGIN_PCT } from '../lib/pricingHelper';

export default function CostBasisSettingsCard() {
  const { user } = useAuth();
  const [basis, setBasis] = useState<CostBasis>(COST_BASIS_DEFAULTS);
  // Charge-side, so it is not part of CostBasis — see the note in pricingHelper.
  const [marginPct, setMarginPct] = useState(String(DEFAULT_MARGIN_PCT));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    getQuotingDefaults(user.id)
      .then(({ basis: b, marginPct: m }) => {
        if (!live) return;
        setBasis(b);
        setMarginPct(String(m));
        setLoading(false);
      })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');
    // Two writes to the same row rather than one: saveCostBasis takes a CostBasis,
    // and widening it to carry a charge-side number would undo the separation the
    // cost model depends on. Sequential, so they cannot race each other.
    const res = await saveCostBasis(user.id, basis);
    const marginRes = res.ok
      ? await saveDefaultMarginPct(user.id, Number(marginPct))
      : { ok: false };
    setSaving(false);
    if (res.ok && marginRes.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(res.ok
        ? 'Your costs saved, but the default margin did not. Try again.'
        : res.error ?? 'Could not save your cost basis.');
    }
  };

  return (
    <div className="bg-ct-surface border border-ct-line rounded-ct-md overflow-hidden">
      <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-ct-line-soft bg-ct-surface-2/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center">
            <Calculator className="w-5 h-5 text-ct-mute-2" />
          </div>
          <div>
            <h3 className="font-semibold text-ct-paper">Your costs</h3>
            <p className="text-xs text-ct-mute">What a job costs you, and the margin you quote on top</p>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ct-mute">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your figures…
          </div>
        ) : (
          <>
            <CostBasisFields value={basis} onChange={setBasis} />

            {/* Charge-side, and the only field here that changes what a client
                pays — so it sits below a rule rather than among the cost fields. */}
            <div className="pt-4 border-t border-ct-line-soft">
              <CostField
                label="Default margin"
                suffix="%"
                hint="What every new quote starts with, added on top of hours, materials and call-out. Change it on a quote and that job uses the new figure; this stays your starting point. Leave at 0 if your hourly rate already carries your profit."
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
            </div>

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
                Save my figures
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ct-teal">
                  <Check className="w-3.5 h-3.5" /> Figures saved
                </span>
              )}
            </div>

            <p className="text-[0.6875rem] leading-snug text-ct-mute">
              These figures are yours alone. They never appear on your public profile, and no client
              ever sees them or the verdict they produce.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
