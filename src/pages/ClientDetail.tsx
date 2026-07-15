// ─────────────────────────────────────────────────────────────────────────────
// ClientDetail — a single client's page: their contact details plus every quote
// you've sent them (each row links back to the public accept page). Reached from
// the Clients address book. Off-app clients need no ConnecTradie account.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, UserCheck, FileText, Loader2, Copy, Check, Plus, RefreshCw, Send, Receipt, Banknote, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import NewQuoteModal from '../components/NewQuoteModal';
import Modal from '../components/Modal';
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

interface ServiceRow {
  id: string;
  trade_category: string;
  assignedName: string | null;
  agreedPrice: number | null;
  frequencyMonths: number;
  isOffApp: boolean;
}

interface InvoiceRow {
  id: string;
  total: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  external_payment_method: string | null;
  external_reference: string | null;
}

const EXTERNAL_METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  accountant: 'Accountant',
};

// Invoice status → pill. External-paid gets its own colour (secondary/blue) so a
// tradie can tell manually-settled invoices apart from Stripe-paid ones at a glance.
function invoiceBadge(inv: InvoiceRow): { label: string; cls: string } {
  const ext = inv.payment_method === 'external';
  if (inv.status === 'paid') {
    return ext
      ? { label: 'Paid · External', cls: 'bg-secondary-100 text-secondary-700' }
      : { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' };
  }
  if (inv.status === 'sent') return { label: ext ? 'Awaiting transfer' : 'Awaiting payment', cls: 'bg-amber-100 text-amber-700' };
  if (inv.status === 'overdue') return { label: 'Overdue', cls: 'bg-red-100 text-red-700' };
  if (inv.status === 'processing') return { label: 'Processing', cls: 'bg-secondary-100 text-secondary-700' };
  if (inv.status === 'cancelled') return { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' };
  return { label: inv.status, cls: 'bg-gray-100 text-gray-600' };
}

const todayISO = () => new Date().toISOString().split('T')[0];

const freqLabel = (m: number): string =>
  m === -1 ? 'weekly' : m === -2 ? 'fortnightly' : m === -3 ? 'daily'
  : m === 1 ? 'monthly' : m === 3 ? 'quarterly' : m === 12 ? 'yearly' : `every ${m} mo`;

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

// Record an external (off-platform) payment against an invoice — bank transfer,
// cash, cheque or accountant remittance. Calls the mark-invoice-paid edge fn.
function MarkPaidModal({ invoice, onClose, onDone }: { invoice: InvoiceRow; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [method, setMethod] = useState<'bank_transfer' | 'cash' | 'cheque' | 'accountant'>('bank_transfer');
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('mark-invoice-paid', {
        body: { invoiceId: invoice.id, method, receivedDate, reference: reference.trim() || undefined },
      });
      if (error) {
        let msg = 'Could not mark this invoice paid.';
        try { msg = (await (error as { context?: Response }).context?.json())?.error || msg; } catch { /* keep default */ }
        showToast(msg, true);
        return;
      }
      if (data?.error) { showToast(data.error, true); return; }
      showToast('Invoice marked as paid.');
      onDone();
    } catch {
      showToast('Could not mark this invoice paid.', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="md">
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mark invoice as paid</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Record a payment you received outside the app for {money(invoice.total)}.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">How was it paid?</label>
          <div className="grid grid-cols-2 gap-2">
            {(['bank_transfer', 'cash', 'cheque', 'accountant'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  method === m
                    ? 'border-warm-500 bg-warm-50 text-warm-700 ring-1 ring-warm-500'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {EXTERNAL_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date received</label>
            <input
              type="date"
              value={receivedDate}
              max={todayISO()}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Reference <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. bank reference"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Mark as paid
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [contact, setContact] = useState<ClientContact | null>(null);
  const [jobs, setJobs] = useState<JobWithQuote[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuote, setShowQuote] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [markPaid, setMarkPaid] = useState<InvoiceRow | null>(null);

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
    const contactRow = (c as ClientContact) ?? null;
    setContact(contactRow);
    const rows: JobWithQuote[] = ((j as unknown as Array<{ id: string; title: string; created_at: string; quotes: QuoteRow[] }>) ?? [])
      .map((job) => {
        const quote = job.quotes?.find((q) => q.public_token) ?? job.quotes?.[0];
        return quote ? { id: job.id, title: job.title, created_at: job.created_at, quote } : null;
      })
      .filter((r): r is JobWithQuote => r !== null);
    setJobs(rows);

    // Ongoing (recurring) services for this contact — off-app via client_contact_id,
    // and/or the linked on-app profile via client_id.
    if (contactRow) {
      let rjQuery = supabase
        .from('recurring_jobs')
        .select('id, trade_category, assigned_team_member_id, agreed_price, frequency_months, client_contact_id')
        .eq('tradie_id', user.id)
        .eq('is_active', true);
      rjQuery = contactRow.linked_profile_id
        ? rjQuery.or(`client_contact_id.eq.${contactRow.id},client_id.eq.${contactRow.linked_profile_id}`)
        : rjQuery.eq('client_contact_id', contactRow.id);
      const { data: rj } = await rjQuery;
      const svc = (rj as Array<{ id: string; trade_category: string; assigned_team_member_id: string | null; agreed_price: number | null; frequency_months: number; client_contact_id: string | null }>) ?? [];
      const memberIds = [...new Set(svc.map((s) => s.assigned_team_member_id).filter((x): x is string => !!x))];
      let names: Record<string, string> = {};
      if (memberIds.length) {
        const { data: members } = await supabase
          .from('business_team_members')
          .select('id, invite_name')
          .in('id', memberIds);
        names = Object.fromEntries(((members as Array<{ id: string; invite_name: string }>) ?? []).map((m) => [m.id, m.invite_name]));
      }
      setServices(svc.map((s) => ({
        id: s.id,
        trade_category: s.trade_category,
        assignedName: s.assigned_team_member_id ? names[s.assigned_team_member_id] ?? null : null,
        agreedPrice: s.agreed_price ?? null,
        frequencyMonths: s.frequency_months,
        isOffApp: !!s.client_contact_id,
      })));
    } else {
      setServices([]);
    }

    // Invoices raised for this contact (off-app, via client_contact_id). RLS
    // scopes to this tradie; external + Stripe both live in recurring_invoices.
    const { data: inv } = await supabase
      .from('recurring_invoices')
      .select('id, total, status, payment_method, created_at, paid_at, external_payment_method, external_reference')
      .eq('tradie_id', user.id)
      .eq('client_contact_id', id)
      .order('created_at', { ascending: false });
    setInvoices((inv as InvoiceRow[]) ?? []);

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

  // Bill an off-app client for a visit: invoice-contact creates a Stripe pay link
  // (destination charge to the tradie) and emails it to the contact.
  const sendInvoice = async (serviceId: string) => {
    if (!contact) return;
    setInvoicingId(serviceId);
    try {
      const { data, error } = await supabase.functions.invoke('invoice-contact', {
        body: { recurringJobId: serviceId },
      });
      if (error) {
        // Edge function returns a JSON { error } body on non-2xx — surface it.
        let msg = 'Could not send the invoice.';
        try { msg = (await (error as { context?: Response }).context?.json())?.error || msg; } catch { /* keep default */ }
        showToast(msg, true);
        return;
      }
      if (data?.error) { showToast(data.error, true); return; }
      const amt = `$${Number(data?.total ?? 0).toLocaleString('en-AU')}`;
      const first = contact.full_name.split(' ')[0];
      if (data?.external) {
        showToast(data?.emailed ? `Invoice for ${amt} emailed to ${first}.` : `Invoice for ${amt} recorded.`);
      } else {
        showToast(`Invoice for ${amt} emailed to ${first}.`);
      }
      await load();
    } catch {
      showToast('Could not send the invoice.', true);
    } finally {
      setInvoicingId(null);
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

            {/* Ongoing services — recurring jobs for this client (off-app via
                client_contact_id, or the linked on-app profile). Off-app rows get
                a "Send invoice" action that emails a Stripe card payment link. */}
            {services.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Ongoing services</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{services.length}</span>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                  {services.map((s) => (
                    <div key={s.id} className="flex items-center gap-4 p-4">
                      <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center flex-shrink-0">
                        <RefreshCw className="w-4 h-4 text-secondary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 capitalize truncate">{s.trade_category.replace(/-/g, ' ')}</span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>
                          <span className="text-xs text-gray-400 capitalize">{freqLabel(s.frequencyMonths)}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          {s.assignedName ? (
                            <><UserCheck className="w-3.5 h-3.5 text-gray-400" /> {s.assignedName}</>
                          ) : (
                            'No worker assigned'
                          )}
                        </p>
                      </div>
                      {s.agreedPrice != null && (
                        <span className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums">
                          ${Number(s.agreedPrice).toLocaleString('en-AU')}<span className="text-xs font-normal text-gray-400">/visit</span>
                        </span>
                      )}
                      {s.isOffApp && s.agreedPrice != null && s.agreedPrice > 0 && (contact.payment_method === 'external' || contact.email) && (
                        <button
                          onClick={() => sendInvoice(s.id)}
                          disabled={invoicingId === s.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                          title={contact.payment_method === 'external'
                            ? `Invoice ${contact.full_name.split(' ')[0]} for this visit (bank transfer)`
                            : `Email ${contact.full_name.split(' ')[0]} a card payment link for this visit`}
                        >
                          {invoicingId === s.id ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                          ) : (
                            <><Send className="w-3.5 h-3.5" /> {contact.payment_method === 'external' && !contact.email ? 'Record invoice' : 'Send invoice'}</>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invoices — every invoice raised for this client. External ones can
                be marked paid manually; Stripe ones update themselves on payment. */}
            {invoices.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{invoices.length}</span>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                  {invoices.map((inv) => {
                    const badge = invoiceBadge(inv);
                    const ext = inv.payment_method === 'external';
                    const canMark = ext && inv.status !== 'paid' && inv.status !== 'cancelled';
                    return (
                      <div key={inv.id} className="flex items-center gap-4 p-4">
                        <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-4 h-4 text-secondary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 tabular-nums">{money(inv.total)}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {inv.status === 'paid' && inv.paid_at ? (
                              <>
                                Paid {fmtDate(inv.paid_at)}
                                {ext && inv.external_payment_method ? ` · ${EXTERNAL_METHOD_LABEL[inv.external_payment_method] ?? inv.external_payment_method}` : ''}
                                {inv.external_reference ? ` · ${inv.external_reference}` : ''}
                              </>
                            ) : (
                              <>Sent {fmtDate(inv.created_at)}</>
                            )}
                          </p>
                        </div>
                        {canMark ? (
                          <button
                            onClick={() => setMarkPaid(inv)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
                          >
                            <Banknote className="w-3.5 h-3.5" /> Mark as paid
                          </button>
                        ) : inv.status === 'paid' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

      {markPaid && (
        <MarkPaidModal
          invoice={markPaid}
          onClose={() => setMarkPaid(null)}
          onDone={() => { setMarkPaid(null); load(); }}
        />
      )}
    </DashboardLayout>
  );
}
