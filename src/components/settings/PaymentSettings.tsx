import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Wallet, CalendarClock, Loader2, AlertCircle, ExternalLink, CheckCircle2, ArrowRight, Save } from 'lucide-react';
import {
  getConnectAccountDetails,
  createConnectOnboardingSession,
  createBankUpdateLink,
  type ConnectAccountDetails,
} from '../../lib/stripe';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// Bank details printed on invoices to clients who pay by bank transfer (the
// "external" payment method). Separate from the Stripe payout bank account —
// this is what the tradie's off-app clients transfer to directly. Always shown,
// so a tradie who only invoices externally (no Stripe) can still set it.
function ExternalBankDetails() {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [accountName, setAccountName] = useState(profile?.bank_account_name ?? '');
  const [bsb, setBsb] = useState(profile?.bank_bsb ?? '');
  const [accountNumber, setAccountNumber] = useState(profile?.bank_account_number ?? '');
  const [bankName, setBankName] = useState(profile?.bank_name ?? '');
  const [saving, setSaving] = useState(false);

  const dirty =
    accountName !== (profile?.bank_account_name ?? '') ||
    bsb !== (profile?.bank_bsb ?? '') ||
    accountNumber !== (profile?.bank_account_number ?? '') ||
    bankName !== (profile?.bank_name ?? '');

  const handleSave = async () => {
    if (!user) return;
    if (bsb.trim() && !/^\d{3}-?\d{3}$/.test(bsb.trim())) {
      showToast('BSB should be 6 digits, e.g. 062-000.', true);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          bank_account_name: accountName.trim() || null,
          bank_bsb: bsb.trim() || null,
          bank_account_number: accountNumber.trim() || null,
          bank_name: bankName.trim() || null,
        })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      showToast('Bank details saved');
    } catch {
      showToast('Could not save your bank details. Please try again.', true);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Landmark className="w-3.5 h-3.5" /> Bank details for invoices
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Printed on invoices for clients who pay by bank transfer, so they know where to send it.
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Account name</label>
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Bright Spark Electrical Pty Ltd" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">BSB</label>
          <input value={bsb} onChange={(e) => setBsb(e.target.value)} placeholder="062-000" inputMode="numeric" className={`${inputCls} tabular-nums`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Account number</label>
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345678" inputMode="numeric" className={`${inputCls} tabular-nums`} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Bank name <span className="font-normal normal-case text-gray-400">(optional)</span></label>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Commonwealth Bank" className={inputCls} />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-4 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save bank details
      </button>
    </div>
  );
}

const fmtAud = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentSettings() {
  const { showToast } = useToast();
  const [details, setDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bankLoading, setBankLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetails(await getConnectAccountDetails());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Show a confirmation if the user just returned from the hosted bank-update form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('bank') === 'updated') showToast('Bank details updated');
  }, [showToast]);

  const handleUpdateBank = async () => {
    setBankLoading(true);
    try {
      window.location.href = await createBankUpdateLink();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open the bank update form', true);
      setBankLoading(false);
    }
  };

  const handleSetup = async () => {
    setSetupLoading(true);
    try {
      await createConnectOnboardingSession();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start payout setup', true);
      setSetupLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={load} className="mt-2 text-sm font-medium text-red-700 underline">Try again</button>
        </div>
      </div>
    );
  }

  // Not connected yet → guide to onboarding, but still let them set bank details
  // for external (bank-transfer) invoices — those don't need Stripe.
  if (!details?.connected) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <Landmark className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Set up payouts</h3>
          <p className="text-sm text-gray-600 mt-1 mb-4">
            Connect your bank account to receive card payments from jobs and pay links — securely via Stripe.
          </p>
          <button
            onClick={handleSetup}
            disabled={setupLoading}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
          >
            {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Set up payouts
          </button>
        </div>
        <ExternalBankDetails />
      </div>
    );
  }

  const bank = details.bankAccount;
  const needsAttention = (details.account?.requirements?.currentlyDue?.length ?? 0) > 0
    || (details.account?.requirements?.pastDue?.length ?? 0) > 0;

  return (
    <div className="space-y-6 max-w-2xl">
      {needsAttention && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Stripe needs more information before payouts can run. Use <strong>Update Bank Details</strong> below to finish.
          </p>
        </div>
      )}

      {/* Bank account */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" /> Bank account
            </p>
            {bank?.last4 ? (
              <p className="mt-2 text-base font-semibold text-gray-900 tabular-nums">
                •••• {bank.last4}
                {bank.bankName && <span className="ml-2 text-sm font-normal text-gray-500">{bank.bankName}</span>}
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No bank account on file yet.</p>
            )}
          </div>
          {details.account?.payoutsEnabled && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active
            </span>
          )}
        </div>
        <button
          onClick={handleUpdateBank}
          disabled={bankLoading}
          className="mt-4 inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {bankLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          Update Bank Details
        </button>
      </div>

      {/* Bank details for external (bank-transfer) invoices */}
      <ExternalBankDetails />

      {/* Balance */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5" /> Stripe balance
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-lg font-bold text-gray-900">{fmtAud(details.balance?.available ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Available</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-lg font-bold text-gray-900">{fmtAud(details.balance?.pending ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Pending (clearing)</p>
          </div>
        </div>
      </div>

      {/* Payouts — managed by the platform (escrow model), not a user-set schedule */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" /> Payouts
        </p>
        <p className="mt-2 text-sm text-gray-700">
          ConnecTradie releases your money to your bank automatically — for each job when
          the client approves the work, and for recurring services when each invoice is paid.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Funds are held securely until work is approved, so payout timing is managed for you
          rather than set to a fixed daily or weekly schedule.
        </p>
      </div>

      <Link to="/payouts" className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary-600 hover:text-secondary-700">
        View full payout history <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
