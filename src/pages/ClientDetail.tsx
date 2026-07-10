// ─────────────────────────────────────────────────────────────────────────────
// ClientDetail — a single client's page: their contact details plus every quote
// you've sent them (each row links back to the public accept page). Reached from
// the Clients address book. Off-app clients need no ConnecTradie account.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, UserCheck, FileText, Loader2, Copy, Check, Plus } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import NewQuoteModal from '../components/NewQuoteModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import type { ClientContact, QuoteStatus } from '../types/database';

interface QuoteRow {
  id: string;
  firm_price: number | null;
  price_min: number | null;
  price_max: number | null;
  status: QuoteStatus;
  created_at: string;
  public_token: string | null;
}

interface JobWithQuote {
  id: string;
  title: string;
  created_at: string;
  quote: QuoteRow;
}

// Client-facing status, quote-centric: "Sent" until they accept.
const STATUS_META: Record<QuoteStatus, { label: string; cls: string }> = {
  pending: { label: 'Sent', cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-gray-100 text-gray-600' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-600' },
  site_visit_scheduled: { label: 'In progress', cls: 'bg-secondary-100 text-secondary-700' },
  site_visit_completed: { label: 'In progress', cls: 'bg-secondary-100 text-secondary-700' },
  final_submitted: { label: 'In progress', cls: 'bg-secondary-100 text-secondary-700' },
};

const money = (n: number) => `$${Number(n).toLocaleString('en-AU')}`;

function priceOf(q: QuoteRow): string {
  if (q.firm_price != null) return money(q.firm_price);
  if (q.price_min != null && q.price_max != null) {
    return q.price_min === q.price_max ? money(q.price_min) : `${money(q.price_min)}–${money(q.price_max)}`;
  }
  if (q.price_min != null) return money(q.price_min);
  return '—';
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [contact, setContact] = useState<ClientContact | null>(null);
  const [jobs, setJobs] = useState<JobWithQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuote, setShowQuote] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    if (!user || !id) return;
    setLoading(true);
    const [{ data: c }, { data: j }] = await Promise.all([
      supabase.from('client_contacts').select('*').eq('id', id).eq('owner_id', user.id).maybeSingle(),
      supabase
        .from('jobs')
        .select('id, title, created_at, quotes(id, firm_price, price_min, price_max, status, created_at, public_token)')
        .eq('tradie_id', user.id)
        .eq('client_contact_id', id)
        .order('created_at', { ascending: false }),
    ]);
    setContact((c as ClientContact) ?? null);
    const rows: JobWithQuote[] = ((j as unknown as Array<{ id: string; title: string; created_at: string; quotes: QuoteRow[] }>) ?? [])
      .map((job) => {
        const quote = job.quotes?.find((q) => q.public_token) ?? job.quotes?.[0];
        return quote ? { id: job.id, title: job.title, created_at: job.created_at, quote } : null;
      })
      .filter((r): r is JobWithQuote => r !== null);
    setJobs(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  const copyLink = async (q: QuoteRow) => {
    if (!q.public_token) return;
    const link = `${window.location.origin}/quote/${q.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(q.id);
      setTimeout(() => setCopiedId((prev) => (prev === q.id ? null : prev)), 2000);
    } catch {
      showToast('Could not copy the link.', true);
    }
  };

  const backLink = (
    <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
      <ArrowLeft className="w-4 h-4" /> Clients
    </Link>
  );

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {backLink}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading client…</span>
          </div>
        ) : !contact ? (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-16 text-center">
            <h3 className="text-lg font-semibold text-gray-900">Client not found</h3>
            <p className="text-sm text-gray-600 mt-1">This client may have been removed.</p>
          </div>
        ) : (
          <>
            {/* Client header */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-secondary-100 to-secondary-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-secondary-800">
                      {contact.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl font-bold text-gray-900 truncate">{contact.full_name}</h1>
                      {contact.linked_profile_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <UserCheck className="w-3 h-3" /> On app
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {contact.email && (
                        <p className="flex items-center gap-1.5 text-sm text-gray-600 truncate">
                          <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" /> {contact.email}
                        </p>
                      )}
                      {contact.phone && (
                        <p className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" /> {contact.phone}
                        </p>
                      )}
                      {contact.address && (
                        <p className="flex items-center gap-1.5 text-sm text-gray-500 truncate">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" /> {contact.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowQuote(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors w-full sm:w-auto flex-shrink-0"
                >
                  <FileText className="w-4 h-4" /> New quote
                </button>
              </div>
              {contact.notes && (
                <p className="mt-4 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5">{contact.notes}</p>
              )}
            </div>

            {/* Quotes */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Quotes</h2>
                {jobs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{jobs.length}</span>
                )}
              </div>

              {jobs.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-secondary-50 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-6 h-6 text-secondary-500" />
                  </div>
                  <h3 className="font-semibold text-gray-700">No quotes yet</h3>
                  <p className="text-sm text-gray-400 max-w-xs mx-auto mt-1">
                    Send {contact.full_name.split(' ')[0]} a quote — they’ll get a link to view and accept it.
                  </p>
                  <button
                    onClick={() => setShowQuote(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 mt-5 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> New quote
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                  {jobs.map(({ id: jobId, title, quote }) => {
                    const meta = STATUS_META[quote.status] ?? STATUS_META.pending;
                    return (
                      <div key={jobId} className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 truncate">{title}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">Sent {fmtDate(quote.created_at)}</p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums">{priceOf(quote)}</span>
                        {quote.public_token && (
                          <button
                            onClick={() => copyLink(quote)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
                            title="Copy the client’s quote link"
                          >
                            {copiedId === quote.id ? (
                              <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</>
                            ) : (
                              <><Copy className="w-3.5 h-3.5" /> Copy link</>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showQuote && user && contact && (
        <NewQuoteModal
          isOpen={showQuote}
          onClose={() => setShowQuote(false)}
          onSent={load}
          tradieId={user.id}
          contact={contact}
        />
      )}
    </DashboardLayout>
  );
}
