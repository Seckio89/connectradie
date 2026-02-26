import { useState, useRef, useEffect } from 'react';
import {
  BadgeCheck,
  Shield,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Hash,
  Calendar,
  User,
  ChevronRight,
  Clock,
  Award,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import LicenseCard from './LicenseCard';
import LicenseCertificate from './LicenseCertificate';

type StepStatus = 'incomplete' | 'checking' | 'valid' | 'invalid';

interface AbnResult {
  status: StepStatus;
  businessName: string;
}

interface LicenseResult {
  status: StepStatus;
  licenseType: string;
  apiVerified: boolean;
  holderName: string | null;
  licenseClass: string | null;
}

export default function VerificationCenter() {
  const { user, profile, refreshProfile } = useAuth();
  const [selfApproving, setSelfApproving] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const isAdmin = profile?.role === 'admin';

  const [abnInput, setAbnInput] = useState(profile?.abn_number || '');
  const [abnResult, setAbnResult] = useState<AbnResult>({ status: 'incomplete', businessName: '' });

  const [licenseInput, setLicenseInput] = useState(profile?.license_number || '');
  const [licenseState, setLicenseState] = useState(profile?.license_state || 'NSW');
  const [licenseExpiry, setLicenseExpiry] = useState(profile?.license_expiry || '');
  const [licenseResult, setLicenseResult] = useState<LicenseResult>({ status: 'incomplete', licenseType: '', apiVerified: false, holderName: null, licenseClass: null });
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const licenseFileRef = useRef<HTMLInputElement>(null);

  const [licenseTrades, setLicenseTrades] = useState<string[]>(profile?.license_trades || []);

  const [idFile, setIdFile] = useState<File | null>(null);
  const idFileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const tradeOptions = [
    'Plumbing', 'Electrical', 'Carpentry', 'Landscaping', 'HVAC',
    'General Builder', 'Painting', 'Gas Fitting', 'Roofing', 'Tiling',
    'Locksmith', 'Cleaning', 'Handyman',
  ];

  const toggleLicenseTrade = (trade: string) => {
    setLicenseTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  };

  const isAlreadyPending = profile?.verification_status === 'pending';
  const isVerified = profile?.verification_status === 'verified';
  const isRejected = profile?.verification_status === 'rejected';

  useEffect(() => {
    if (!isAlreadyPending || !user) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('verification_status')
        .eq('id', user.id)
        .maybeSingle();

      if (data && data.verification_status !== 'pending') {
        refreshProfile();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isAlreadyPending, user]);

  const handleSelfApprove = async () => {
    if (!user || !profile) return;
    setSelfApproving(true);

    const existingVerified = profile.verified_trades || [];
    const pendingTrades = profile.license_trades || [];
    const declaredTrades = profile.declared_trades || [];
    const merged = Array.from(new Set([...existingVerified, ...pendingTrades, ...declaredTrades]));

    const { error } = await supabase
      .from('profiles')
      .update({ verification_status: 'verified', rejection_reason: null, verified_trades: merged, license_verified: true })
      .eq('id', user.id);

    if (!error) {
      await supabase
        .from('tradie_details')
        .update({ is_verified: true })
        .eq('profile_id', user.id);
      await refreshProfile();
    }

    setSelfApproving(false);
  };

  const handleVerifyABN = async () => {
    const cleaned = abnInput.replace(/\s/g, '');
    if (cleaned.length !== 11) return;

    setAbnResult({ status: 'checking', businessName: '' });

    try {
      // First try to refresh the session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();

      if (sessionError) {
        setAbnResult({ status: 'invalid', businessName: 'Session error. Please log out and log in again.' });
        return;
      }

      if (!session) {
        setAbnResult({ status: 'invalid', businessName: 'Not logged in. Please log in first.' });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/verify-abn`;

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ abn: cleaned }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          const errorMsg = result.details || result.error || 'Session expired';
          setAbnResult({ status: 'invalid', businessName: `Auth Error: ${errorMsg}. Please refresh the page.` });
        } else if (result.error) {
          setAbnResult({ status: 'invalid', businessName: result.error });
        } else {
          setAbnResult({ status: 'invalid', businessName: 'Verification failed' });
        }
        return;
      }

      if (result.valid) {
        setAbnResult({
          status: 'valid',
          businessName: result.entityName || 'Registered Business',
        });
      } else {
        setAbnResult({
          status: 'invalid',
          businessName: result.message || 'Invalid ABN',
        });
      }
    } catch (error) {
      setAbnResult({ status: 'invalid', businessName: 'Network error. Please try again.' });
    }
  };

  const handleVerifyLicense = async () => {
    if (!licenseInput.trim() || !licenseExpiry) return;

    setLicenseResult({ status: 'checking', licenseType: '', apiVerified: false, holderName: null, licenseClass: null });

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();

      if (sessionError || !session) {
        setLicenseResult({ status: 'invalid', licenseType: 'Session error. Please refresh the page.', apiVerified: false, holderName: null, licenseClass: null });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/verify-license`;

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          licenseNumber: licenseInput.trim(),
          licenseState: licenseState,
          expiryDate: licenseExpiry,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setLicenseResult({ status: 'invalid', licenseType: result.error || 'Verification failed', apiVerified: false, holderName: null, licenseClass: null });
        return;
      }

      if (result.valid) {
        setLicenseResult({
          status: 'valid',
          licenseType: result.message || 'License verified',
          apiVerified: result.apiVerified || false,
          holderName: result.holderName || null,
          licenseClass: result.licenseClass || null,
        });
      } else {
        setLicenseResult({
          status: 'invalid',
          licenseType: result.message || 'Invalid license',
          apiVerified: result.apiVerified || false,
          holderName: result.holderName || null,
          licenseClass: result.licenseClass || null,
        });
      }
    } catch (error) {
      setLicenseResult({ status: 'invalid', licenseType: 'Network error. Please try again.', apiVerified: false, holderName: null, licenseClass: null });
    }
  };

  const handleSubmitForReview = async () => {
    if (!user) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const documentUrls: string[] = [];

      if (licenseFile) {
        const ext = licenseFile.name.split('.').pop();
        const path = `${user.id}/license-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(path, licenseFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
        documentUrls.push(publicUrl);
      }

      if (idFile) {
        const ext = idFile.name.split('.').pop();
        const path = `${user.id}/identity-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(path, idFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
        documentUrls.push(publicUrl);
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          abn_number: abnInput.replace(/\s/g, ''),
          license_number: licenseInput.trim(),
          license_state: licenseState.toUpperCase(),
          license_expiry: licenseExpiry || null,
          verification_status: 'pending',
          documents_url: documentUrls,
          rejection_reason: null,
          license_trades: licenseTrades,
        })
        .eq('id', user.id);

      if (updateErr) throw updateErr;

      await refreshProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit verification';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const allStepsComplete =
    abnResult.status === 'valid' &&
    licenseResult.status === 'valid' &&
    licenseExpiry &&
    licenseTrades.length > 0 &&
    idFile;

  if (isVerified) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BadgeCheck className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-green-900 mb-2">Fully Verified</h3>
          <p className="text-green-700">
            Your identity and credentials have been verified. You can accept all jobs including urgent leads.
          </p>
          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <div className="p-3 bg-white rounded-xl border border-green-200">
              <FileText className="w-5 h-5 text-green-600 mb-1" />
              <p className="text-sm font-medium text-green-800">ABN: {profile?.abn_number}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-green-200">
              <Hash className="w-5 h-5 text-green-600 mb-1" />
              <p className="text-sm font-medium text-green-800">License: {profile?.license_number}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-green-200">
              <Shield className="w-5 h-5 text-green-600 mb-1" />
              <p className="text-sm font-medium text-green-800">Identity Confirmed</p>
            </div>
          </div>
        </div>

        {profile?.license_number && profile?.license_state && profile?.license_expiry && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Your License Card</h3>
              <button
                onClick={() => setShowCertificate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-colors"
              >
                <Award className="w-4 h-4" />
                View Certificate
              </button>
            </div>
            <LicenseCard
              licenseNumber={profile.license_number}
              licenseState={profile.license_state}
              expiryDate={profile.license_expiry}
              verified={profile.license_verified || false}
              verificationStatus={profile.verification_status}
              holderName={profile.full_name || 'License Holder'}
              businessName={profile.abn_entity_name || profile.business_name || undefined}
              tradeType={profile.trade_type || undefined}
              apiVerified={profile.license_api_verified || false}
              licenseClass={profile.license_class || undefined}
            />
          </div>
        )}

        {profile?.license_number && profile?.license_state && profile?.license_expiry && (
          <LicenseCertificate
            isOpen={showCertificate}
            onClose={() => setShowCertificate(false)}
            holderName={profile.full_name || 'License Holder'}
            licenseNumber={profile.license_number}
            licenseState={profile.license_state}
            expiryDate={profile.license_expiry}
            businessName={profile.abn_entity_name || profile.business_name || undefined}
            abnNumber={profile.abn_number || undefined}
            tradeType={profile.trade_type || undefined}
            verifiedTrades={profile.verified_trades || []}
            verifiedDate={profile.created_at}
          />
        )}
      </div>
    );
  }

  if (isAlreadyPending) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-amber-900 mb-2">Verification Under Review</h3>
          <p className="text-amber-700 max-w-md mx-auto">
            Your documents have been submitted and are being reviewed by our team. This usually takes 1-2 business days.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-amber-100 rounded-full text-sm font-medium text-amber-800">
            <Loader2 className="w-4 h-4 animate-spin" />
            Pending Review
          </div>
          {isAdmin && (
            <div className="mt-6 space-y-3">
              <div className="border-t border-amber-200 pt-4">
                <p className="text-sm text-amber-800 mb-3">As an admin, you can approve your own verification:</p>
                <button
                  onClick={handleSelfApprove}
                  disabled={selfApproving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {selfApproving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Approve Verification</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      {!user && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Login Required</p>
            <p className="text-sm text-blue-700 mt-1">You must be logged in to verify your credentials.</p>
          </div>
        </div>
      )}

      {isRejected && profile?.rejection_reason && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Verification Rejected</p>
            <p className="text-sm text-red-700 mt-1">{profile.rejection_reason}</p>
            <p className="text-sm text-red-600 mt-2">Please correct the issues below and resubmit.</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Get Verified</h3>
        <p className="text-sm text-gray-600 mb-6">
          Complete all three steps below to submit your verification. Only verified tradies can accept jobs and quote on urgent leads.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              abnResult.status === 'valid' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <span className={`text-sm font-bold ${abnResult.status === 'valid' ? 'text-green-700' : 'text-gray-500'}`}>A</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">ABN Check</h4>
              <p className="text-sm text-gray-500">Verify your Australian Business Number (11 digits)</p>
            </div>
            {abnResult.status === 'valid' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </div>
        </div>
        <div className="p-5">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={abnInput}
                onChange={(e) => {
                  setAbnInput(e.target.value.replace(/[^\d\s]/g, '').slice(0, 14));
                  setAbnResult({ status: 'incomplete', businessName: '' });
                }}
                placeholder="e.g., 10 824 753 556"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={abnResult.status === 'valid'}
              />
            </div>
            <button
              onClick={handleVerifyABN}
              disabled={!user || abnInput.replace(/\s/g, '').length !== 11 || abnResult.status === 'checking' || abnResult.status === 'valid'}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {abnResult.status === 'checking' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</>
              ) : abnResult.status === 'valid' ? (
                <><CheckCircle2 className="w-4 h-4" /> Verified</>
              ) : (
                'Verify ABN'
              )}
            </button>
          </div>
          {abnResult.status === 'valid' && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800">Active -- {abnResult.businessName}</p>
            </div>
          )}
          {abnResult.status === 'invalid' && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">
                {abnResult.businessName || 'Invalid ABN. Please check the number and try again.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              licenseResult.status === 'valid' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <span className={`text-sm font-bold ${licenseResult.status === 'valid' ? 'text-green-700' : 'text-gray-500'}`}>B</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">License Check</h4>
              <p className="text-sm text-gray-500">Verify your trade license number and upload a photo</p>
            </div>
            {licenseResult.status === 'valid' && licenseExpiry && licenseFile && (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            )}
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">License Number</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={licenseInput}
                  onChange={(e) => {
                    setLicenseInput(e.target.value);
                    setLicenseResult({ status: 'incomplete', licenseType: '', apiVerified: false, holderName: null, licenseClass: null });
                  }}
                  placeholder="e.g., ABC123456"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
              <select
                value={licenseState}
                onChange={(e) => {
                  setLicenseState(e.target.value);
                  setLicenseResult({ status: 'incomplete', licenseType: '' });
                }}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="NSW">NSW</option>
                <option value="VIC">VIC</option>
                <option value="QLD">QLD</option>
                <option value="SA">SA</option>
                <option value="WA">WA</option>
                <option value="TAS">TAS</option>
                <option value="NT">NT</option>
                <option value="ACT">ACT</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiry Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={licenseExpiry}
                  onChange={(e) => setLicenseExpiry(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleVerifyLicense}
            disabled={!licenseInput.trim() || !licenseExpiry || licenseResult.status === 'checking' || licenseResult.status === 'valid'}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {licenseResult.status === 'checking' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</>
            ) : licenseResult.status === 'valid' ? (
              <><CheckCircle2 className="w-4 h-4" /> Verified</>
            ) : (
              'Verify License'
            )}
          </button>

          {licenseResult.status === 'valid' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-green-800">{licenseResult.licenseType}</p>
                  {licenseResult.apiVerified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                      <BadgeCheck className="w-3 h-3" />
                      Authority Verified
                    </span>
                  )}
                </div>
                {licenseResult.holderName && (
                  <p className="text-xs text-green-700 mt-1">Holder: {licenseResult.holderName}</p>
                )}
                {licenseResult.licenseClass && (
                  <p className="text-xs text-green-700 mt-0.5">Class: {licenseResult.licenseClass}</p>
                )}
                {!licenseResult.apiVerified && (
                  <p className="text-xs text-green-700 mt-1">Format validation only. Real-time verification with licensing authority not available.</p>
                )}
              </div>
            </div>
          )}
          {licenseResult.status === 'invalid' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{licenseResult.licenseType}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Photo of License Card</label>
            <input
              ref={licenseFileRef}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setLicenseFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              onClick={() => licenseFileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
            >
              {licenseFile ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-700">{licenseFile.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-6 h-6 text-gray-400 mb-1" />
                  <span className="text-sm text-gray-500">Click to upload license photo</span>
                </div>
              )}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Which trades does this license cover? <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {tradeOptions.map((trade) => {
                const selected = licenseTrades.includes(trade);
                return (
                  <button
                    key={trade}
                    type="button"
                    onClick={() => toggleLicenseTrade(trade)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {selected && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                    {trade}
                  </button>
                );
              })}
            </div>
            {licenseTrades.length > 0 && (
              <p className="text-xs text-blue-600 mt-2">
                {licenseTrades.length} trade{licenseTrades.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              idFile ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <span className={`text-sm font-bold ${idFile ? 'text-green-700' : 'text-gray-500'}`}>C</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">Identity Check</h4>
              <p className="text-sm text-gray-500">Upload a photo of your Driver's License or Passport</p>
            </div>
            {idFile && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </div>
        </div>
        <div className="p-5">
          <input
            ref={idFileRef}
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setIdFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <button
            onClick={() => idFileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            {idFile ? (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-gray-700">{idFile.name}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <User className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-700 mb-0.5">Upload Identity Document</p>
                <p className="text-xs text-gray-500">Driver's License or Passport (image or PDF)</p>
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Verification Checklist</p>
            <p className="text-sm text-gray-600 mt-1">All items must be completed before submitting.</p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { done: abnResult.status === 'valid', label: 'ABN verified' },
            { done: licenseResult.status === 'valid', label: 'License number verified' },
            { done: !!licenseExpiry, label: 'License expiry date provided' },
            { done: !!licenseFile, label: 'License card photo uploaded' },
            { done: licenseTrades.length > 0, label: 'Trades covered by license selected' },
            { done: !!idFile, label: 'Identity document uploaded' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-sm ${item.done ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      <button
        onClick={handleSubmitForReview}
        disabled={!allStepsComplete || submitting}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
        ) : (
          <><Shield className="w-5 h-5" /> Submit for Verification <ChevronRight className="w-4 h-4" /></>
        )}
      </button>
    </div>
  );
}
