// ─────────────────────────────────────────────────────────────────────────────
// PublicQuote — the page an off-app client lands on from a quote email. No login
// required; access is via the unguessable token in the URL. Reads + accepts the
// quote through the token-gated `public-quote` edge function.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, MapPin, ShieldCheck, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import JobDescription from '../components/JobDescription';

interface QuoteView {
  status: string;
  quote: {
    priceMin: number | null;
    priceMax: number | null;
    firmPrice: number | null;
    message: string | null;
    proposedStartDate: string | null;
  };
  job: { title: string | null; description: string | null; address: string | null };
  tradie: { name: string | null; business: string | null; avatarUrl?: string | null };
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

export default function PublicQuote() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<QuoteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
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
          setData(res as QuoteView);
          if ((res as QuoteView).status === 'accepted') setAccepted(true);
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
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('public-quote', {
        body: { token, action: 'accept' },
      });
      if (fnError || res?.error) {
        setError(res?.error || 'Could not accept the quote. Please try again.');
      } else {
        setAccepted(true);
      }
    } catch {
      setError('Could not accept the quote. Please try again.');
    }
    setAccepting(false);
  };

  const businessName = data?.tradie.business || data?.tradie.name || 'Your tradie';
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
            {/* Sender header — reads like the top of a document from the business */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-secondary-100 to-secondary-200 flex items-center justify-center flex-shrink-0">
                  {showAvatar ? (
                    <img src={avatarUrl!} alt="" className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
                  ) : (
                    <span className="text-xl font-bold text-secondary-800">{businessName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">You’ve received a quote from</p>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight break-words">{businessName}</h1>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">{data.job.title || 'Your job'}</h2>
                {data.job.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <MapPin className="w-4 h-4" /> {data.job.address}
                  </p>
                )}
                {/* Client-facing: scope of work only — internal assumptions/conditions
                    and hour estimates are the tradie's pricing rationale, not scope. */}
                {data.job.description && (
                  <JobDescription text={data.job.description} className="mt-3" hideNotes />
                )}
              </div>

              <div className="p-6 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Quoted price</span>
                <span className="text-2xl font-bold text-gray-900">{formatPrice(data.quote)}</span>
              </div>

              {data.quote.message && (
                <div className="p-6 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Note from {businessName}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{data.quote.message}</p>
                </div>
              )}
            </div>

            {accepted ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h3 className="font-semibold text-emerald-800">Quote accepted</h3>
                <p className="text-sm text-emerald-700 mt-1">
                  {businessName} has been notified and will be in touch to arrange the work.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {accepting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Accept quote
                </button>
                <p className="text-center text-xs text-gray-500">
                  No payment is taken now — accepting just lets {businessName} know you’d like to go ahead.
                </p>
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
