import { useState, useEffect } from 'react';
import {
  BadgeCheck,
  Shield,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Hash,
  ChevronRight,
  Clock,
  Award,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Update } from '../types/database';
import { createIdentityVerification } from '../lib/stripe';
import LicenseCard from './LicenseCard';
import LicenseCertificate from './LicenseCertificate';
import { isTradeExempt, normalizeTradeName } from '../lib/licensingRequirements';
import AbnVerifyField, { type AbnFieldOutcome } from './verification/AbnVerifyField';
import LicenceVerificationStep from './verification/LicenceVerificationStep';
import { fetchOwnBusinessVerification, fetchOwnLicenceVerifications, type LicenceVerification } from '../lib/verification';

type StepStatus = 'incomplete' | 'checking' | 'valid' | 'invalid';

interface AbnResult {
  status: StepStatus;
  businessName: string;
}

export default function VerificationCenter() {
  const { user, profile, tradieDetails, refreshProfile } = useAuth();
  const [selfApproving, setSelfApproving] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const isAdmin = profile?.role === 'admin';
  const primaryTrade = profile?.declared_trades?.[0] || '';
  const tradeIsExempt = isTradeExempt(primaryTrade);

  // ABN: a previously verified ABN (profiles.abn_verified is kept in step with
  // business_verifications by trigger) counts as done on load.
  const [abnResult, setAbnResult] = useState<AbnResult>(
    profile?.abn_verified ? { status: 'valid', businessName: profile.abn_entity_name || '' } : { status: 'incomplete', businessName: '' },
  );
  const [abnInitial, setAbnInitial] = useState<AbnFieldOutcome | null>(null);
  const handleAbnOutcome = (o: AbnFieldOutcome) => {
    // 'review' still lets the tradie continue — an admin resolves the name
    // mismatch; 'failed' does not.
    setAbnResult({ status: o.status === 'failed' ? 'invalid' : 'valid', businessName: o.entity_name || o.business_names[0] || '' });
  };

  // Licence: the new photo → OCR → review flow (LicenceVerificationStep) owns
  // its own state; this only needs to know whether a licence for the primary
  // trade has been submitted or verified, for the checklist and the submit.
  const [licenceRow, setLicenceRow] = useState<LicenceVerification | null>(null);
  const licenceSubmitted = !!licenceRow && (licenceRow.status === 'awaiting_review' || licenceRow.status === 'verified');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [bv, rows] = await Promise.all([fetchOwnBusinessVerification(user.id), fetchOwnLicenceVerifications(user.id)]);
      if (cancelled) return;
      if (bv) {
        setAbnInitial({ status: bv.status as AbnFieldOutcome['status'], entity_name: bv.entity_name, business_names: bv.business_names, gst_registered: bv.gst_registered, abn_status: bv.abn_status });
        if (bv.status !== 'failed') setAbnResult({ status: 'valid', businessName: bv.entity_name || bv.business_names[0] || '' });
      }
      const live = rows.find((r) => r.trade_category === primaryTrade && (r.status === 'awaiting_review' || r.status === 'verified'));
      setLicenceRow(live ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, primaryTrade]);

  const [licenseTrades, setLicenseTrades] = useState<string[]>(profile?.license_trades || []);

  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const identityStatus: 'verified' | 'processing' | 'unverified' =
    profile?.is_identity_verified
      ? 'verified'
      : profile?.stripe_identity_session_id
        ? 'processing'
        : 'unverified';

  // Handle return from Stripe Identity hosted page
  useEffect(() => {
    const identityParam = searchParams.get('identity');
    if (identityParam === 'success') {
      refreshProfile();
      setSearchParams((prev) => {
        prev.delete('identity');
        return prev;
      }, { replace: true });
    }
  }, [searchParams]);

  const handleVerifyIdentity = async () => {
    setIdentityLoading(true);
    setIdentityError(null);
    try {
      await createIdentityVerification();
    } catch (err: unknown) {
      console.error('Identity verification error:', err);
      setIdentityError(err instanceof Error ? err.message : 'Failed to start verification');
      setIdentityLoading(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const tradeOptions = [
    'Plumbing', 'Electrical', 'Carpentry', 'Landscaping', 'HVAC',
    'General builder', 'Painting', 'Gas fitting', 'Roofing', 'Tiling',
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

  const handleSubmitForReview = async () => {
    if (!user) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      // The licence photo no longer goes into `documents`: it lives in the
      // private licence-uploads bucket for exactly as long as the review takes,
      // and review-licence deletes it. Only the outcome is kept.
      //
      // Annotated, not `Record<string, unknown>`: the annotation is what makes
      // every key below column-checked. See the note on `Update` in
      // types/database.ts.
      const updatePayload: Update<'profiles'> = {
        verification_status: 'pending',
        documents_url: null,
        rejection_reason: null,
      };

      if (tradeIsExempt) {
        updatePayload.license_number = null;
        updatePayload.license_state = null;
        updatePayload.license_expiry = null;
        updatePayload.license_trades = [];
      } else {
        updatePayload.license_number = licenceRow?.licence_number ?? null;
        updatePayload.license_state = licenceRow?.state_code ?? null;
        updatePayload.license_expiry = licenceRow?.expiry_date ?? null;
        updatePayload.license_trades = licenseTrades;
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(updatePayload)
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

  const allStepsComplete = tradeIsExempt
    ? abnResult.status === 'valid' && identityStatus === 'verified'
    : abnResult.status === 'valid' &&
      licenceSubmitted &&
      licenseTrades.length > 0 &&
      identityStatus === 'verified';

  if (isVerified) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        <div className="bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-lg p-8 text-center">
          <div className="w-16 h-16 bg-ct-teal/[0.14] rounded-full flex items-center justify-center mx-auto mb-4">
            <BadgeCheck className="w-8 h-8 text-ct-teal" />
          </div>
          <h3 className="text-xl font-bold text-ct-teal mb-2">Fully verified</h3>
          <p className="text-ct-teal">
            Your identity and credentials have been verified. You can accept all jobs including urgent leads.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-ct-surface rounded-ct-md border border-ct-teal/30">
              <FileText className="w-5 h-5 text-ct-teal mb-1" />
              <p className="text-sm font-medium text-ct-teal">ABN: {profile?.abn_number}</p>
            </div>
            <div className="p-3 bg-ct-surface rounded-ct-md border border-ct-teal/30">
              <Hash className="w-5 h-5 text-ct-teal mb-1" />
              <p className="text-sm font-medium text-ct-teal">License: {profile?.license_number}</p>
            </div>
            <div className="p-3 bg-ct-surface rounded-ct-md border border-ct-teal/30">
              <Shield className="w-5 h-5 text-ct-teal mb-1" />
              <p className="text-sm font-medium text-ct-teal">Identity confirmed</p>
            </div>
          </div>
        </div>

        {profile?.license_number && profile?.license_state && profile?.license_expiry && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ct-paper">Your license card</h3>
              <button
                onClick={() => setShowCertificate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink text-sm font-medium rounded-ct-sm hover:bg-ct-teal-deep transition-colors"
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
              holderName={profile.full_name || 'License holder'}
              businessName={profile.abn_entity_name || tradieDetails?.business_name || undefined}
              tradeType={tradieDetails?.trade_type || undefined}
              apiVerified={profile.license_api_verified || false}
              licenseClass={profile.license_class || undefined}
            />
          </div>
        )}

        {profile?.license_number && profile?.license_state && profile?.license_expiry && (
          <LicenseCertificate
            isOpen={showCertificate}
            onClose={() => setShowCertificate(false)}
            holderName={profile.full_name || 'License holder'}
            licenseNumber={profile.license_number}
            licenseState={profile.license_state}
            expiryDate={profile.license_expiry}
            businessName={profile.abn_entity_name || tradieDetails?.business_name || undefined}
            abnNumber={profile.abn_number || undefined}
            tradeType={tradieDetails?.trade_type || undefined}
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
        <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-lg p-8 text-center">
          <div className="w-16 h-16 bg-ct-amber/[0.13] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Clock className="w-8 h-8 text-ct-amber" />
          </div>
          {/* Awaiting a reviewer is amber, not teal — and the heading was teal on
              a teal fill, i.e. 1:1. */}
          <h3 className="text-xl font-bold text-ct-amber mb-2">Verification under review</h3>
          <p className="text-ct-amber max-w-md mx-auto">
            Your documents have been submitted and are being reviewed by our team. This usually takes 1-2 business days.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-ct-amber/[0.13] rounded-full text-sm font-medium text-ct-paper">
            <Loader2 className="w-4 h-4 animate-spin" />
            Pending Review
          </div>
          {isAdmin && (
            <div className="mt-6 space-y-3">
              <div className="border-t border-ct-amber/[0.34] pt-4">
                <p className="text-sm text-ct-paper mb-3">As an admin, you can approve your own verification:</p>
                <button
                  onClick={handleSelfApprove}
                  disabled={selfApproving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {selfApproving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Approve verification</>
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
        <div className="p-4 bg-ct-surface-2 border border-ct-line rounded-ct-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-ct-mute-2 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-ct-paper">Login required</p>
            <p className="text-sm text-ct-mute-2 mt-1">You must be logged in to verify your credentials.</p>
          </div>
        </div>
      )}

      {isRejected && profile?.rejection_reason && (
        <div className="p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md flex items-start gap-3">
          <XCircle className="w-5 h-5 text-ct-rose flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-ct-paper">Verification rejected</p>
            <p className="text-sm text-ct-rose mt-1">{profile.rejection_reason}</p>
            <p className="text-sm text-ct-rose mt-2">Please correct the issues below and resubmit.</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold text-ct-paper mb-1">Get verified</h3>
        <p className="text-sm text-ct-mute-2 mb-6">
          Complete all three steps below to submit your verification. Only verified tradies can accept jobs and quote on urgent leads.
        </p>
      </div>

      <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
        <div className="p-5 border-b border-ct-line-soft">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-ct-sm flex items-center justify-center ${
              abnResult.status === 'valid' ? 'bg-ct-teal/[0.14]' : 'bg-ct-surface-2'
            }`}>
              <span className={`text-sm font-bold ${abnResult.status === 'valid' ? 'text-ct-teal' : 'text-ct-mute'}`}>A</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-ct-paper">ABN Check</h4>
              <p className="text-sm text-ct-mute">Verify your Australian Business Number (11 digits)</p>
            </div>
            {abnResult.status === 'valid' && <CheckCircle2 className="w-5 h-5 text-ct-teal" />}
          </div>
        </div>
        <div className="p-5">
          <AbnVerifyField
            claimedBusinessName={tradieDetails?.business_name || profile?.full_name || ''}
            initialAbn={profile?.abn_number}
            initialOutcome={abnInitial}
            onVerified={handleAbnOutcome}
            disabled={!user}
          />
        </div>
      </div>

      {tradeIsExempt ? (
        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          <div className="p-5 border-b border-ct-line-soft">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-ct-sm flex items-center justify-center bg-ct-teal/[0.14]">
                <span className="text-sm font-bold text-ct-teal">B</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-ct-paper">License check</h4>
                <p className="text-sm text-ct-mute">Not required for your trade</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-ct-teal" />
            </div>
          </div>
          <div className="p-5">
            <div className="p-4 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ct-teal">
                  License Verification not required for {normalizeTradeName(primaryTrade)}.
                </p>
                <p className="text-xs text-ct-teal mt-1">
                  Your trade is exempt from licensing requirements. A verified ABN and identity are sufficient.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          <div className="p-5 border-b border-ct-line-soft">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-ct-sm flex items-center justify-center ${
                licenceSubmitted ? 'bg-ct-teal/[0.14]' : 'bg-ct-surface-2'
              }`}>
                <span className={`text-sm font-bold ${licenceSubmitted ? 'text-ct-teal' : 'text-ct-mute'}`}>B</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-ct-paper">License check</h4>
                <p className="text-sm text-ct-mute">Photograph your licence card — we read the details, an admin checks the register</p>
              </div>
              {licenceSubmitted && (
                <CheckCircle2 className="w-5 h-5 text-ct-teal" />
              )}
            </div>
          </div>
          <div className="p-5 space-y-4">
            <LicenceVerificationStep
              tradeCategory={primaryTrade}
              defaultState={profile?.license_state}
              onFinished={(outcome) => {
                if (outcome === 'submitted' && user) {
                  fetchOwnLicenceVerifications(user.id).then((rows) => {
                    setLicenceRow(rows.find((r) => r.trade_category === primaryTrade && (r.status === 'awaiting_review' || r.status === 'verified')) ?? null);
                  });
                }
              }}
            />

            <div>
              <label className="block text-sm font-medium text-ct-mute-2 mb-2">
                Which trades does this license cover? <span className="text-ct-rose">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {tradeOptions.map((trade) => {
                  const selected = licenseTrades.includes(trade);
                  return (
                    <button
                      key={trade}
                      type="button"
                      onClick={() => toggleLicenseTrade(trade)}
                      className={`px-3 py-1.5 rounded-ct-sm text-sm font-medium border transition-all ${
                        selected
                          ? 'bg-ct-teal text-ct-ink border-ct-teal/30 shadow-sm'
                          : 'bg-ct-surface text-ct-mute-2 border-ct-line hover:border-ct-teal/30 hover:bg-ct-surface-2'
                      }`}
                    >
                      {selected && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                      {trade}
                    </button>
                  );
                })}
              </div>
              {licenseTrades.length > 0 && (
                <p className="text-xs text-ct-mute-2 mt-2">
                  {licenseTrades.length} trade{licenseTrades.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
        <div className="p-5 border-b border-ct-line-soft">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-ct-sm flex items-center justify-center ${
              identityStatus === 'verified' ? 'bg-ct-teal/[0.14]' : 'bg-ct-surface-2'
            }`}>
              <span className={`text-sm font-bold ${identityStatus === 'verified' ? 'text-ct-teal' : 'text-ct-mute'}`}>C</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-ct-paper">Identity check</h4>
              <p className="text-sm text-ct-mute">
                {identityStatus === 'verified'
                  ? 'Identity verified'
                  : identityStatus === 'processing'
                    ? 'Verification in progress'
                    : 'Verify your identity via our secure partner'}
              </p>
            </div>
            {identityStatus === 'verified' && <CheckCircle2 className="w-5 h-5 text-ct-teal" />}
          </div>
        </div>
        <div className="p-5 space-y-4">
          {identityStatus === 'verified' ? (
            <div className="flex items-start gap-3 p-4 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm">
              <Shield className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ct-teal">Identity verified</p>
                <p className="text-xs text-ct-teal mt-1">
                  Your profile now features a trusted verification badge.
                </p>
              </div>
            </div>
          ) : identityStatus === 'processing' ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm">
                <Loader2 className="w-5 h-5 text-ct-amber flex-shrink-0 mt-0.5 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-ct-paper">Securely verifying your identity...</p>
                  <p className="text-xs text-ct-amber mt-1">
                    Check your email if the verification is still pending. This page will update automatically.
                  </p>
                </div>
              </div>
              <button
                onClick={handleVerifyIdentity}
                disabled={identityLoading}
                className="w-full py-3 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:bg-ct-teal-deep disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center justify-center gap-2"
              >
                {identityLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting...</>
                ) : (
                  <><Shield className="w-4 h-4" /> Retry verification</>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-ct-surface-2 border border-ct-line rounded-ct-sm">
                <Shield className="w-5 h-5 text-ct-mute-2 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-ct-mute-2">
                  Your documents are processed securely and are <strong>never stored</strong> on ConnecTradie servers. Handled in accordance with Australian Privacy Principles.
                </p>
              </div>
              {identityError && (
                <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-ct-rose flex-shrink-0" />
                  <p className="text-sm text-ct-rose">{identityError}</p>
                </div>
              )}
              <button
                onClick={handleVerifyIdentity}
                disabled={identityLoading}
                className="w-full py-3 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:bg-ct-teal-deep disabled:opacity-50 disabled:cursor-wait transition-colors flex items-center justify-center gap-2"
              >
                {identityLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to verification...</>
                ) : (
                  <><Shield className="w-4 h-4" /> Verify identity securely</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-ct-surface-2 rounded-ct-md border border-ct-line p-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-ct-paper">Verification checklist</p>
            <p className="text-sm text-ct-mute-2 mt-1">All items must be completed before submitting.</p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { done: abnResult.status === 'valid', label: 'ABN verified' },
            ...(tradeIsExempt
              ? [{ done: true, label: `License not required for ${normalizeTradeName(primaryTrade)}` }]
              : [
                  { done: licenceSubmitted, label: licenceRow?.status === 'verified' ? 'Licence verified' : 'Licence submitted for review' },
                  { done: licenseTrades.length > 0, label: 'Trades covered by licence selected' },
                ]),
            { done: identityStatus === 'verified', label: 'Identity verified' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-ct-teal" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-ct-line" />
              )}
              <span className={`text-sm ${item.done ? 'text-ct-teal font-medium' : 'text-ct-mute'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md flex items-center gap-2">
          <XCircle className="w-5 h-5 text-ct-rose flex-shrink-0" />
          <p className="text-sm text-ct-rose">{submitError}</p>
        </div>
      )}

      <button
        onClick={handleSubmitForReview}
        disabled={!allStepsComplete || submitting}
        className="w-full py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
