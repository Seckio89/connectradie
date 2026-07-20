// ─────────────────────────────────────────────────────────────────────────────
// PublicQuote — the page an off-app client lands on from a quote email. No login
// required; access is via the unguessable token in the URL. Reads + accepts the
// quote through the token-gated `public-quote` edge function.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2, CheckCircle2, XCircle, MapPin, ShieldCheck, AlertCircle,
  BadgeCheck, Calendar, Clock, Package, DollarSign, Search, Phone, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import JobDescription from '../components/JobDescription';

interface QuoteView {
  status: string;
  reference?: string;
  issuedDate?: string | null;
  validUntil?: string | null;
  quote: {
    priceMin: number | null;
    priceMax: number | null;
    firmPrice: number | null;
    message: string | null;
    proposedStartDate: string | null;
    estimatedDuration?: string | null;
    includesMaterials?: boolean | null;
    requiresSiteInspection?: boolean | null;
    callOutFee?: number | null;
    gstRegistered?: boolean;
  };
  job: { title: string | null; description: string | null; address: string | null; status?: string | null };
  client?: { name: string | null; location: string | null };
  tradie: {
    name: string | null;
    business: string | null;
    avatarUrl?: string | null;
    trade?: string | null;
    memberSince?: string | null;
    phone?: string | null;
    abn?: string | null;
    abnVerified?: boolean;
    entityName?: string | null;
    license?: { number: string | null; state: string | null; cls: string | null; verified: boolean } | null;
    insured?: boolean;
    insurer?: string | null;
    identityVerified?: boolean;
  };
  payment?: { paid: boolean; released: boolean; approved?: boolean; payable?: boolean; url?: string | null };
}

function formatPrice(q: QuoteView['quote']): string {
  const fmt = (n: number) => `$${n.toLocaleString('en-AU')}`;
  if (q.firmPrice != null) return fmt(q.firmPrice);
  if (q.priceMin != null && q.priceMax != null) {
    return q.priceMin === q.priceMax ? fmt(q.priceMin) : `${fmt(q.priceMin)} – ${fmt(q.priceMax)}`;
  }
  if (q.priceMin != null) return fmt(q.priceMin);
  return 'On request';
}

/** The single definite dollar amount, when the quote isn't a range (used for GST). */
function definitePrice(q: QuoteView['quote']): number | null {
  if (q.firmPrice != null) return q.firmPrice;
  if (q.priceMin != null && q.priceMin === q.priceMax) return q.priceMin;
  return null;
}

const fmtDate = (iso?: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-800 break-words">{value}</p>
      </div>
    </div>
  );
}

export default function PublicQuote() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<QuoteView | null>(null);
  const [loading, setLoading] = useState(true);
  // Load error = the quote itself couldn't be shown (invalid/expired link).
  // Action error = accept/decline/release failed — shown INLINE so the quote
  // stays visible (a failed release must never render as "Quote unavailable").
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [released, setReleased] = useState(false);
  // Approved but the payout can't be made until the card charge settles — the
  // approval is recorded and the payout completes automatically.
  const [approvedPending, setApprovedPending] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setError('This quote link is not valid.'); setLoading(false); return; }
      try {
        const { data: res, error: fnError } = await supabase.functions.invoke('public-quote', {
          body: { token, action: 'view' },
        });
        if (cancelled) return;
        if (fnError || res?.error) {
          setError(res?.error || 'This quote link is not valid or has expired.');
        } else {
          const view = res as QuoteView;
          setData(view);
          if (view.status === 'accepted') setAccepted(true);
          if (view.status === 'declined') setDeclined(true);
          if (view.payment?.released) setReleased(true);
          else if (view.payment?.approved) setApprovedPending(true);
        }
      } catch {
        if (!cancelled) setError('Something went wrong loading this quote.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setActionError('');
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('public-quote', {
        body: { token, action: 'accept' },
      });
      if (fnError || res?.error) {
        setActionError(res?.error || 'Could not accept the quote. Please try again.');
      } else {
        // If a secure deposit is due, send the client straight to Stripe to fund
        // the job into escrow. Otherwise acceptance is record-only.
        const payUrl = (res as QuoteView)?.payment?.url;
        if (payUrl) {
          window.location.href = payUrl;
          return; // keep the spinner while the browser navigates
        }
        setAccepted(true);
      }
    } catch {
      setActionError('Could not accept the quote. Please try again.');
    }
    setAccepting(false);
  };

  const handleDecline = async () => {
    if (!token) return;
    setDeclining(true);
    setActionError('');
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('public-quote', {
        body: { token, action: 'decline', reason: declineReason.trim() },
      });
      if (fnError || res?.error) {
        setActionError(res?.error || 'Could not submit your response. Please try again.');
      } else {
        setDeclined(true);
        setShowDeclineForm(false);
      }
    } catch {
      setActionError('Could not submit your response. Please try again.');
    }
    setDeclining(false);
  };

  const handleRelease = async () => {
    if (!token) return;
    setReleasing(true);
    setActionError('');
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('public-quote', {
        body: { token, action: 'release' },
      });
      if (fnError || res?.error) {
        // Non-2xx bodies come through error.context — surface the real reason.
        let msg = (res as { error?: string } | null)?.error;
        if (!msg && fnError) {
          try { msg = (await (fnError as { context?: Response }).context?.json())?.error; } catch { /* opaque */ }
        }
        setActionError(msg || 'Could not release the payment. Please try again.');
      } else {
        const pay = (res as QuoteView)?.payment;
        if (pay?.released) setReleased(true);
        else setApprovedPending(true); // approval recorded — payout follows settlement
      }
    } catch {
      setActionError('Could not release the payment. Please try again.');
    }
    setReleasing(false);
  };

  const businessName = data?.tradie.business || data?.tradie.name || 'Your tradie';
  const noLongerAvailable = !!data && ['withdrawn', 'expired', 'cancelled'].includes(data.status);
  const paid = !!data?.payment?.paid;
  const depositPayable = !!data?.payment?.payable;
  const canRelease = paid && data?.job.status === 'completed';
  const avatarUrl = data?.tradie.avatarUrl;
  const showAvatar = !!avatarUrl && /^https?:\/\//.test(avatarUrl) && !avatarFailed;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link to="/" aria-label="ConnecTradie" className="flex items-center">
            <img
              src="/brand/connectradie-wordmark.png"
              alt="ConnecTradie"
              className="h-7 w-auto"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline'; }}
            />
            <span className="hidden text-xl font-extrabold tracking-tight text-black">
              Connec<span className="text-warm-500">Tradie</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading your quote…</span>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900">Quote unavailable</h1>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Quote document */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Business identity */}
              <div className="p-5 sm:p-6 flex items-start gap-4 border-b border-gray-100">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center flex-shrink-0">
                  {showAvatar ? (
                    <img src={avatarUrl!} alt="" className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
                  ) : (
                    <span className="text-xl font-bold text-emerald-800">{businessName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Quote from</p>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight break-words">{businessName}</h1>
                  {(data.tradie.trade || data.tradie.memberSince) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {data.tradie.trade}
                      {data.tradie.trade && data.tradie.memberSince ? ' · ' : ''}
                      {data.tradie.memberSince ? `On ConnecTradie since ${new Date(data.tradie.memberSince).getFullYear()}` : ''}
                    </p>
                  )}
                  {data.tradie.phone && (
                    <a
                      href={`tel:${data.tradie.phone.replace(/[^\d+]/g, '')}`}
                      className="inline-flex items-center gap-1.5 mt-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      <Phone className="w-3.5 h-3.5" /> {data.tradie.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* Reference + dates */}
              <div className="px-5 sm:px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                {data.reference && <span className="text-gray-500">Quote <span className="font-semibold text-gray-800">{data.reference}</span></span>}
                {fmtDate(data.issuedDate) && <span className="text-gray-500">Issued <span className="font-medium text-gray-700">{fmtDate(data.issuedDate)}</span></span>}
                {fmtDate(data.validUntil) && <span className="text-gray-500">Valid until <span className="font-medium text-gray-700">{fmtDate(data.validUntil)}</span></span>}
              </div>

              {/* Trust credentials */}
              {(data.tradie.abn || data.tradie.license || data.tradie.insured || data.tradie.identityVerified) && (
                <div className="px-5 sm:px-6 py-3.5 border-b border-gray-100 flex flex-wrap gap-2">
                  {data.tradie.abn && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                      {data.tradie.abnVerified && <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />}
                      ABN {data.tradie.abn}
                    </span>
                  )}
                  {data.tradie.license && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                      {data.tradie.license.verified && <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />}
                      Licensed{data.tradie.license.state ? ` (${data.tradie.license.state})` : ''}
                    </span>
                  )}
                  {data.tradie.insured && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Insured
                    </span>
                  )}
                  {data.tradie.identityVerified && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
                      <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" /> ID verified
                    </span>
                  )}
                </div>
              )}

              {/* Prepared for */}
              {data.client?.name && (
                <div className="px-5 sm:px-6 py-3 border-b border-gray-100 text-xs">
                  <span className="text-gray-500">Prepared for </span>
                  <span className="font-semibold text-gray-800">{data.client.name}</span>
                  {data.client.location && <span className="text-gray-500"> · {data.client.location}</span>}
                </div>
              )}

              {/* Scope of work */}
              <div className="p-5 sm:p-6 border-b border-gray-100">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Scope of work</p>
                <h2 className="text-lg font-semibold text-gray-900">{data.job.title || 'Your job'}</h2>
                {data.job.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <MapPin className="w-4 h-4" /> {data.job.address}
                  </p>
                )}
                {data.job.description && (
                  <JobDescription text={data.job.description} className="mt-3" hideNotes />
                )}
              </div>

              {/* Price + GST */}
              <div className="px-5 sm:px-6 py-5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-end justify-between gap-4">
                  <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Quoted price</span>
                  <span className="text-3xl font-bold text-gray-900">{formatPrice(data.quote)}</span>
                </div>
                {data.quote.gstRegistered && definitePrice(data.quote) != null && (
                  <p className="text-right text-xs text-gray-500 mt-1">
                    Includes GST of ${(definitePrice(data.quote)! / 11).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              {/* Details grid */}
              {(data.quote.proposedStartDate || data.quote.estimatedDuration || data.quote.includesMaterials != null || data.quote.callOutFee || data.quote.requiresSiteInspection) && (
                <div className="px-5 sm:px-6 py-4 border-b border-gray-100 grid grid-cols-2 gap-4">
                  {data.quote.proposedStartDate && (
                    <Detail icon={Calendar} label="Proposed start" value={fmtDate(data.quote.proposedStartDate) || '—'} />
                  )}
                  {data.quote.estimatedDuration && (
                    <Detail icon={Clock} label="Estimated time" value={data.quote.estimatedDuration} />
                  )}
                  {data.quote.includesMaterials != null && (
                    <Detail icon={Package} label="Materials" value={data.quote.includesMaterials ? 'Included' : 'Not included'} />
                  )}
                  {data.quote.callOutFee ? (
                    <Detail icon={DollarSign} label="Call-out fee" value={`$${data.quote.callOutFee.toLocaleString('en-AU')}`} />
                  ) : null}
                  {data.quote.requiresSiteInspection && (
                    <Detail icon={Search} label="Site inspection" value="Required first" />
                  )}
                </div>
              )}

              {/* Note from tradie */}
              {data.quote.message && (
                <div className="p-5 sm:p-6">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Note from {businessName}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{data.quote.message}</p>
                </div>
              )}
            </div>

            {actionError && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-2xl p-4">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{actionError}</p>
              </div>
            )}

            {accepted ? (
              <div className="space-y-2.5">
                {released ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <h3 className="font-semibold text-emerald-800">Payment released</h3>
                    <p className="text-sm text-emerald-700 mt-1">
                      Thanks! The payment is on its way to {businessName}. This job is all wrapped up.
                    </p>
                  </div>
                ) : approvedPending ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <h3 className="font-semibold text-emerald-800">Payment approved</h3>
                    <p className="text-sm text-emerald-700 mt-1">
                      Thanks! Your approval is recorded — the payment will reach {businessName} automatically
                      as soon as the funds finish clearing (usually 1–2 business days). Nothing more to do.
                    </p>
                  </div>
                ) : canRelease ? (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    <div className="text-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                      <h3 className="font-semibold text-gray-900">{businessName} marked this job complete</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Happy with the work? Approve to release the payment now. If you don’t, it releases
                        automatically 5 hours after completion.
                      </p>
                    </div>
                    <button
                      onClick={handleRelease}
                      disabled={releasing}
                      className="w-full mt-4 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {releasing && <Loader2 className="w-4 h-4 animate-spin" />}
                      Approve &amp; release payment
                    </button>
                    <p className="text-center text-xs text-gray-500 mt-2">
                      Only release once the work is done to your satisfaction — this pays {businessName}.
                    </p>
                  </div>
                ) : !paid && depositPayable ? (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    <div className="text-center">
                      <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                      <h3 className="font-semibold text-gray-900">Secure the job with {businessName}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Pay securely into escrow to lock it in. Your money is held safely by Stripe and only
                        released to {businessName} once the work is done.
                      </p>
                    </div>
                    <button
                      onClick={handleAccept}
                      disabled={accepting}
                      className="w-full mt-4 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Pay deposit securely
                    </button>
                    <p className="text-center text-xs text-gray-500 mt-2">
                      Secured by Stripe. You release the payment yourself once the job is complete.
                    </p>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <h3 className="font-semibold text-emerald-800">Quote accepted</h3>
                    <p className="text-sm text-emerald-700 mt-1">
                      {businessName} has been notified and will be in touch to arrange the work.
                    </p>
                  </div>
                )}
              </div>
            ) : declined ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
                <XCircle className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-800">Quote declined</h3>
                <p className="text-sm text-gray-600 mt-1">
                  You’ve let {businessName} know this quote isn’t going ahead. Thanks for letting them know.
                </p>
              </div>
            ) : noLongerAvailable ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
                <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-800">This quote is no longer available</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {businessName} has withdrawn this quote. Please contact them directly if you have questions.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  onClick={handleAccept}
                  disabled={accepting || declining}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {depositPayable ? 'Accept & pay securely' : 'Accept quote'}
                </button>
                <p className="text-center text-xs text-gray-500">
                  {depositPayable
                    ? `Your payment is held safely in Stripe escrow and only released to ${businessName} once the work is done.`
                    : `No payment is taken now — accepting just lets ${businessName} know you’d like to go ahead.`}
                </p>

                {showDeclineForm ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 space-y-3 text-left">
                    <label className="block text-sm font-medium text-gray-700">
                      Let {businessName} know why <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="e.g. Went with someone else, timing doesn’t suit, price is above budget…"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowDeclineForm(false); setDeclineReason(''); }}
                        className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDecline}
                        disabled={declining}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {declining && <Loader2 className="w-4 h-4 animate-spin" />}
                        Decline quote
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeclineForm(true)}
                    className="w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700 py-1"
                  >
                    Not going ahead? Decline this quote
                  </button>
                )}
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Track &amp; pay securely — optional</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Create a free account to message {businessName}, follow the job, and pay through
                    protected Stripe escrow. No cost, no obligation.
                  </p>
                  <Link to="/register" className="inline-flex items-center gap-1 mt-2.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                    Create a free account <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-gray-400 pt-1">
              Sent securely through <span className="font-semibold text-gray-500">ConnecTradie</span> · Australian tradie marketplace
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
