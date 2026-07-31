import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  ExternalLink,
  Sparkles,
  Scale,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';
import { supabase } from '../lib/supabase';
import { callEdgeFunction } from '../lib/edgeFn';
import { friendlyError } from '../lib/utils';
import type { Update } from '../types/database';
import { useAuth } from '../contexts/AuthContext';

type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'direct_resolution'
  | 'platform_review'
  | 'resolved_client'
  | 'resolved_tradie'
  | 'resolved_split'
  | 'dismissed';

/** The outcomes a human may record. `resolved_split` is deliberately absent —
 *  see the note above the decision buttons. */
type Outcome = 'resolved_client' | 'resolved_tradie' | 'dismissed';

/** The terminal statuses, in one place. This list used to be written out twice
 *  (once to filter, once to decide whether to show the actions), which is how a
 *  new status ends up handled in one spot and not the other. */
const TERMINAL_STATUSES = ['resolved_client', 'resolved_tradie', 'resolved_split', 'dismissed'];
const isTerminal = (status: string | null) => status !== null && TERMINAL_STATUSES.includes(status);

interface Dispute {
  id: string;
  job_id: string;
  opened_by: string;
  against_user: string;
  reason: string;
  description: string | null;
  evidence_urls: string[] | null;
  status: string | null;
  admin_notes: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  dispute_type: string | null;
  respond_by: string | null;
  platform_review_by: string | null;
  opener_name?: string;
  against_name?: string;
  job_description?: string;
}

/** The shape dispute-evidence-summary writes. The column is `jsonb`, so nothing
 *  guarantees this at the type level — every read below is written to survive a
 *  field being absent. */
interface EvidenceSummary {
  overview?: string;
  agreed_scope?: string;
  timeline?: { date?: string; event?: string; source?: string }[];
  client_position?: string;
  tradie_position?: string;
  disputed_points?: string[];
  evidence_gaps?: string[];
  suggested_outcome?: {
    outcome?: string;
    rationale?: string;
    confidence?: string;
    split_client_pct?: number | null;
  };
}

interface SummaryRecord {
  summary: EvidenceSummary;
  model: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string | undefined> = {
  open: 'Open',
  under_review: 'Under Review',
  direct_resolution: 'Parties Talking',
  platform_review: 'Platform Review',
  resolved_client: 'Resolved (Client)',
  resolved_tradie: 'Resolved (Tradie)',
  resolved_split: 'Resolved (Split)',
  dismissed: 'Dismissed',
};

const STATUS_COLORS: Record<string, string | undefined> = {
  open: 'bg-ct-amber/[0.13] text-ct-paper',
  under_review: 'bg-ct-surface-2 text-ct-mute-2',
  direct_resolution: 'bg-ct-amber/[0.13] text-ct-paper',
  platform_review: 'bg-ct-surface-2 text-ct-mute-2',
  resolved_client: 'bg-ct-teal/[0.14] text-ct-teal',
  resolved_tradie: 'bg-ct-teal/[0.14] text-ct-teal',
  resolved_split: 'bg-ct-surface-2 text-ct-mute-2',
  dismissed: 'bg-ct-surface-2 text-ct-paper',
};

/** Human labels for the AI's suggested outcome. Deliberately different wording
 *  from STATUS_LABELS so a recommendation never reads like a status. */
const SUGGESTION_LABELS: Record<string, string | undefined> = {
  resolved_client: 'Favour the client',
  resolved_tradie: 'Favour the tradie',
  resolved_split: 'Split the funds',
  dismissed: 'Dismiss the dispute',
  insufficient_evidence: 'Not enough evidence to say',
};

const CONFIDENCE_COLORS: Record<string, string | undefined> = {
  low: 'bg-ct-rose/[0.13] text-ct-rose',
  medium: 'bg-ct-amber/[0.13] text-ct-amber',
  high: 'bg-ct-teal/[0.14] text-ct-teal',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_review', label: 'In Review' },
  { key: 'resolved', label: 'Resolved' },
] as const;

type FilterTab = (typeof FILTER_TABS)[number]['key'];

/** "In Review" covers every live status that isn't a brand-new dispute. Widened
 *  from the single `under_review` so the two statuses added for the assisted
 *  flow cannot sit in the queue with no tab that shows them. */
const IN_REVIEW_STATUSES = ['under_review', 'direct_resolution', 'platform_review'];

/** Cents → "$1,234.56". Local rather than shared: the codebase has no cents
 *  formatter, and inventing a global one is not this ticket. */
function formatAud(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

/** Days until a deadline, or null when none is set. Nothing populates the
 *  deadline columns yet, so this renders for no one today — it is written to
 *  stay silent rather than show a fake countdown. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function DeadlinePill({ label, iso }: { label: string; iso: string | null }) {
  const days = daysUntil(iso);
  if (days === null) return null;
  const overdue = days < 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
        overdue ? 'bg-ct-rose/[0.13] text-ct-rose' : days <= 1 ? 'bg-ct-amber/[0.13] text-ct-amber' : 'bg-ct-surface-2 text-ct-mute-2'
      }`}
    >
      <Clock className="w-3.5 h-3.5" />
      {overdue
        ? `${label} overdue by ${Math.abs(days)}d`
        : days === 0
          ? `${label} due today`
          : `${label} in ${days}d`}
    </span>
  );
}

export default function AdminDisputes() {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SummaryRecord>>({});
  const [decisionError, setDecisionError] = useState<Record<string, string>>({});
  /** Neutral outcome messages — e.g. a payout deferred until funds settle.
   *  Separate from decisionError so an expected result isn't shown in red. */
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});
  /** job_id → refundable total in cents, for jobs whose escrow can still be split. */
  const [splittable, setSplittable] = useState<Record<string, number>>({});
  /** dispute_id → the dollar amount the officer typed for the client's share. */
  const [splitAmount, setSplitAmount] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDisputes();
  }, []);

  const fetchDisputes = async () => {
    setLoading(true);

    try {
      const { data: disputesData, error } = await supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Bail before the follow-up queries rather than sending an empty `.in()`
      // list — PostgREST rejects `id=in.()` outright, so with no disputes the
      // whole enrich step used to fail and get swallowed by the catch below.
      if (!disputesData || disputesData.length === 0) {
        setDisputes([]);
        setLoading(false);
        return;
      }

      // Fetch related profiles and jobs
      const openerIds = [...new Set(disputesData.map((d) => d.opened_by))];
      const againstIds = [...new Set(disputesData.map((d) => d.against_user))];
      const allUserIds = [...new Set([...openerIds, ...againstIds])];
      const jobIds = [...new Set(disputesData.map((d) => d.job_id))];
      const disputeIds = disputesData.map((d) => d.id);

      const [profilesRes, jobsRes, summariesRes, paymentsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', allUserIds),
        supabase.from('jobs').select('id, description').in('id', jobIds),
        supabase
          .from('dispute_evidence_summaries')
          .select('dispute_id, summary, model, created_at')
          .in('dispute_id', disputeIds)
          .order('created_at', { ascending: false }),
        // A split is only possible while the money is still in the tradie's
        // Stripe balance — status 'completed', not yet paid out. Same filter the
        // edge function applies, so the control never offers what it can't do.
        supabase
          .from('payments')
          .select('job_id, amount, processing_fee, metadata')
          .in('job_id', jobIds)
          .eq('payment_type', 'job_funding')
          .eq('status', 'completed'),
      ]);

      // Newest summary per dispute. The table is append-only and a forced
      // regeneration appends, so a dispute can legitimately have several.
      const nextSummaries: Record<string, SummaryRecord> = {};
      for (const row of summariesRes.data || []) {
        if (nextSummaries[row.dispute_id]) continue;
        nextSummaries[row.dispute_id] = {
          summary: (row.summary ?? {}) as EvidenceSummary,
          model: row.model,
          created_at: row.created_at,
        };
      }
      setSummaries(nextSummaries);

      // Refundable total mirrors process-refund: base + GST + processing fee.
      // Legacy custodial payments are excluded — the edge function refuses them,
      // so offering the control would be a dead end.
      const nextSplittable: Record<string, number> = {};
      for (const row of paymentsRes.data || []) {
        // job_id is nullable on payments — recurring-invoice rows carry none.
        if (!row.job_id) continue;
        const m = (row.metadata ?? {}) as { flow?: string; gst?: string | number };
        if (m.flow !== 'destination') continue;
        const gst = Number(m.gst ?? 0) || 0;
        nextSplittable[row.job_id] = (row.amount || 0) + gst + (row.processing_fee || 0);
      }
      setSplittable(nextSplittable);

      const profileMap = new Map(
        (profilesRes.data || []).map((p) => [p.id, p.full_name])
      );
      const jobMap = new Map(
        (jobsRes.data || []).map((j) => [j.id, j.description])
      );

      const enriched: Dispute[] = disputesData.map((d) => ({
        ...d,
        opener_name: profileMap.get(d.opened_by) || 'Unknown User',
        against_name: profileMap.get(d.against_user) || 'Unknown User',
        job_description: jobMap.get(d.job_id) || 'Unknown Job',
      }));

      setDisputes(enriched);
    } catch (err) {
      console.error('Failed to fetch disputes:', err);
    }
    setLoading(false);
  };

  /* Non-terminal transitions only — moving a dispute along without deciding it.
     Resolutions go through recordDecision, which cannot lose the audit row. */
  const updateDisputeStatus = async (disputeId: string, newStatus: DisputeStatus) => {
    if (!user) return;
    setUpdating(disputeId);

    const notes = adminNotes[disputeId] || null;

    // Annotated, not `Record<string, unknown>`: the annotation is what makes
    // every key below column-checked. See the note on `Update` in
    // types/database.ts.
    const updateData: Update<'disputes'> = {
      status: newStatus,
      admin_notes: notes,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('disputes')
      .update(updateData)
      .eq('id', disputeId);

    if (!error) {
      setDisputes((prev) =>
        prev.map((d) => (d.id === disputeId ? { ...d, status: newStatus, admin_notes: notes } : d))
      );
    }

    setUpdating(null);
  };

  /* Record the decision AND apply the outcome.
     One RPC, so it is one transaction: the audit row and the status change
     cannot come apart. Doing this as two round trips from here would allow a
     resolved dispute with nothing recorded about who decided it or why — which
     is the exact failure the append-only table exists to prevent.

     `overridden` is the value that makes the AI accountable: it records that a
     human saw the suggestion and went a different way. Computed here rather
     than left to the officer to tick, because a self-reported override is the
     first thing to get skipped. */
  const recordDecision = async (dispute: Dispute, outcome: Outcome) => {
    if (!user) return;
    const reasoning = (adminNotes[dispute.id] || '').trim();
    if (!reasoning) {
      setDecisionError((prev) => ({ ...prev, [dispute.id]: 'Write the reason for this decision first.' }));
      return;
    }

    setDecisionError((prev) => ({ ...prev, [dispute.id]: '' }));
    setUpdating(dispute.id);

    const suggestion = summaries[dispute.id]?.summary?.suggested_outcome ?? null;

    const { error } = await supabase.rpc('resolve_dispute', {
      p_dispute_id: dispute.id,
      p_outcome: outcome,
      p_reasoning: reasoning,
      p_ai_suggestion: suggestion,
      p_overridden: suggestion?.outcome != null && suggestion.outcome !== outcome,
    });

    if (error) {
      setDecisionError((prev) => ({
        ...prev,
        [dispute.id]: friendlyError(error, 'Could not record the decision. Please try again.'),
      }));
      setUpdating(null);
      return;
    }

    setDisputes((prev) =>
      prev.map((d) =>
        d.id === dispute.id
          ? {
              ...d,
              status: outcome,
              resolution: reasoning,
              resolved_by: user.id,
              resolved_at: new Date().toISOString(),
            }
          : d
      )
    );
    setUpdating(null);
  };

  /* A split moves money, so it goes through the edge function — NOT the
     resolve_dispute RPC directly. The function refunds the client's share
     first, pays the tradie the remainder, and only then resolves the dispute.
     Resolving first would clear blocks_release and let the auto-release cron
     pay out the FULL amount before the split had finished. */
  const recordSplit = async (dispute: Dispute) => {
    if (!user) return;
    const reasoning = (adminNotes[dispute.id] || '').trim();
    if (!reasoning) {
      setDecisionError((prev) => ({ ...prev, [dispute.id]: 'Write the reason for this decision first.' }));
      return;
    }

    const total = splittable[dispute.job_id];
    const dollars = Number((splitAmount[dispute.id] || '').trim());
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setDecisionError((prev) => ({ ...prev, [dispute.id]: 'Enter the amount to return to the client.' }));
      return;
    }
    const cents = Math.round(dollars * 100);
    if (total != null && cents >= total) {
      setDecisionError((prev) => ({
        ...prev,
        [dispute.id]: `That is the whole payment. Use "Resolve for Client" for a full refund, or enter less than ${formatAud(total)}.`,
      }));
      return;
    }

    setDecisionError((prev) => ({ ...prev, [dispute.id]: '' }));
    setUpdating(dispute.id);

    const suggestion = summaries[dispute.id]?.summary?.suggested_outcome ?? null;
    try {
      const res = await callEdgeFunction<{ warning?: string; note?: string }>('resolve-dispute-split', {
        disputeId: dispute.id,
        refundCents: cents,
        reasoning,
        aiSuggestion: suggestion,
        overridden: suggestion?.outcome != null && suggestion.outcome !== 'resolved_split',
      });

      setDisputes((prev) =>
        prev.map((d) =>
          d.id === dispute.id
            ? { ...d, status: 'resolved_split', resolution: reasoning, resolved_by: user.id, resolved_at: new Date().toISOString() }
            : d
        )
      );
      // A deferred payout is the EXPECTED outcome on a recently-charged job —
      // the funds are still clearing with Stripe. Report it plainly, not as a
      // failure, or every normal split looks like something went wrong.
      if (res?.note) {
        setDecisionNote((prev) => ({ ...prev, [dispute.id]: res.note as string }));
      }
      if (res?.warning) {
        setDecisionError((prev) => ({ ...prev, [dispute.id]: res.warning as string }));
      }
    } catch (err) {
      setDecisionError((prev) => ({
        ...prev,
        [dispute.id]: friendlyError(err, 'Could not split this payment. Please try again.'),
      }));
    }
    setUpdating(null);
  };

  const filteredDisputes = disputes.filter((d) => {
    // Filter by tab
    if (filter === 'open' && d.status !== 'open') return false;
    if (filter === 'in_review' && !(d.status !== null && IN_REVIEW_STATUSES.includes(d.status))) return false;
    if (filter === 'resolved' && !isTerminal(d.status)) return false;

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.reason.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        d.opener_name?.toLowerCase().includes(q) ||
        d.against_name?.toLowerCase().includes(q) ||
        d.job_description?.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'open':
        return <AlertTriangle className="w-4 h-4" />;
      case 'under_review':
      case 'platform_review':
        return <Eye className="w-4 h-4" />;
      case 'direct_resolution':
        return <Clock className="w-4 h-4" />;
      case 'resolved_client':
      case 'resolved_tradie':
      case 'resolved_split':
        return <CheckCircle className="w-4 h-4" />;
      case 'dismissed':
        return <XCircle className="w-4 h-4" />;
    }
  };

  return (
    <DashboardLayout wide>
      <Breadcrumbs />
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">Dispute Resolution</h1>
            <p className="text-ct-mute-2 mt-1">Review and resolve disputes between users</p>
          </div>

          <div className="flex items-center gap-2 text-sm text-ct-mute">
            <Clock className="w-4 h-4" />
            <span>
              {disputes.filter((d) => d.status === 'open').length} open dispute
              {disputes.filter((d) => d.status === 'open').length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Search and filter */}
        <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
              <input
                type="text"
                placeholder="Search disputes by reason, user, or job..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-colors"
              />
            </div>

            <div className="flex gap-1 bg-ct-surface-2 rounded-ct-md p-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-2 rounded-ct-sm text-sm font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-ct-surface text-ct-paper shadow-sm'
                      : 'text-ct-mute-2 hover:text-ct-paper'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Disputes list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
          </div>
        ) : filteredDisputes.length === 0 ? (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-ct-mute mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-ct-paper mb-2">No Disputes Found</h3>
            <p className="text-ct-mute">
              {filter === 'all'
                ? 'There are no disputes in the system yet.'
                : `No disputes with status "${FILTER_TABS.find((t) => t.key === filter)?.label}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDisputes.map((dispute) => {
              const isExpanded = expandedId === dispute.id;

              return (
                <div
                  key={dispute.id}
                  className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden"
                >
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : dispute.id)}
                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-ct-surface-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                            (dispute.status && STATUS_COLORS[dispute.status]) || ''
                          }`}
                        >
                          {getStatusIcon(dispute.status)}
                          {(dispute.status && STATUS_LABELS[dispute.status]) || dispute.status}
                        </span>
                        <span className="text-sm font-medium text-ct-paper mr-1">{dispute.reason}</span>
                        {!isTerminal(dispute.status) && (
                          <>
                            <DeadlinePill label="Response" iso={dispute.respond_by} />
                            <DeadlinePill label="Review" iso={dispute.platform_review_by} />
                          </>
                        )}
                        {summaries[dispute.id] && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-ct-surface-2 text-ct-mute-2">
                            <Sparkles className="w-3.5 h-3.5" />
                            Summary ready
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ct-mute-2 truncate">
                        Job: {dispute.job_description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-ct-mute">
                        <span>
                          Filed by: <strong>{dispute.opener_name}</strong>
                        </span>
                        <span>
                          Against: <strong>{dispute.against_name}</strong>
                        </span>
                        <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-ct-mute flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-ct-mute flex-shrink-0" />
                    )}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-ct-line-soft p-5 space-y-5">
                      {(() => {
                        const record = summaries[dispute.id];
                        if (!record) return null;
                        const s = record.summary;
                        const suggestion = s.suggested_outcome;
                        return (
                          <div className="rounded-ct-md border border-ct-line bg-ct-surface-2 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <h4 className="text-sm font-semibold text-ct-mute-2 inline-flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-ct-mute" />
                                AI evidence summary
                              </h4>
                              <span className="text-xs text-ct-mute">
                                {record.model} · {new Date(record.created_at).toLocaleString()}
                              </span>
                            </div>

                            <p className="text-xs text-ct-mute mb-4">
                              Generated from the job records. It decides nothing and moves no money — read it,
                              then make your own call below.
                            </p>

                            {s.overview && (
                              <p className="text-sm text-ct-mute-2 whitespace-pre-wrap mb-4">{s.overview}</p>
                            )}

                            {s.agreed_scope && (
                              <div className="mb-4">
                                <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">
                                  Agreed scope
                                </h5>
                                <p className="text-sm text-ct-mute-2">{s.agreed_scope}</p>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              {s.client_position && (
                                <div>
                                  <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">
                                    Client says
                                  </h5>
                                  <p className="text-sm text-ct-mute-2">{s.client_position}</p>
                                </div>
                              )}
                              {s.tradie_position && (
                                <div>
                                  <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">
                                    Tradie says
                                  </h5>
                                  <p className="text-sm text-ct-mute-2">{s.tradie_position}</p>
                                </div>
                              )}
                            </div>

                            {(s.disputed_points ?? []).length > 0 && (
                              <div className="mb-4">
                                <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">
                                  What is actually disputed
                                </h5>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {(s.disputed_points ?? []).map((p, i) => (
                                    <li key={i} className="text-sm text-ct-mute-2">{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {(s.timeline ?? []).length > 0 && (
                              <div className="mb-4">
                                <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">
                                  Timeline
                                </h5>
                                <ul className="space-y-1">
                                  {(s.timeline ?? []).map((t, i) => (
                                    <li key={i} className="text-sm text-ct-mute-2 flex gap-2">
                                      <span className="text-ct-mute whitespace-nowrap">{t.date}</span>
                                      <span>{t.event}</span>
                                      {t.source && <span className="text-xs text-ct-mute">({t.source})</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {(s.evidence_gaps ?? []).length > 0 && (
                              <div className="mb-4">
                                <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">
                                  Missing evidence
                                </h5>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {(s.evidence_gaps ?? []).map((g, i) => (
                                    <li key={i} className="text-sm text-ct-mute-2">{g}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {suggestion?.outcome && (
                              <div className="rounded-ct-sm border border-ct-line bg-ct-surface p-3">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                  <span className="text-xs font-medium text-ct-mute uppercase tracking-wide">
                                    Suggested — not applied
                                  </span>
                                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-surface-2 text-ct-mute-2">
                                    {SUGGESTION_LABELS[suggestion.outcome] || suggestion.outcome}
                                  </span>
                                  {suggestion.confidence && (
                                    <span
                                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        CONFIDENCE_COLORS[suggestion.confidence] || 'bg-ct-surface-2 text-ct-mute-2'
                                      }`}
                                    >
                                      {suggestion.confidence} confidence
                                    </span>
                                  )}
                                </div>
                                {suggestion.rationale && (
                                  <p className="text-sm text-ct-mute-2">{suggestion.rationale}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div>
                        <h4 className="text-sm font-semibold text-ct-mute-2 mb-2">Full Description</h4>
                        <p className="text-sm text-ct-mute-2 whitespace-pre-wrap">
                          {dispute.description}
                        </p>
                      </div>

                      {dispute.evidence_urls && dispute.evidence_urls.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-ct-mute-2 mb-2">Evidence</h4>
                          <div className="space-y-1.5">
                            {dispute.evidence_urls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-ct-mute-2 hover:text-ct-mute-2 hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {url.length > 60 ? url.substring(0, 60) + '...' : url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {dispute.admin_notes && (
                        <div>
                          <h4 className="text-sm font-semibold text-ct-mute-2 mb-2">
                            Previous Admin Notes
                          </h4>
                          <p className="text-sm text-ct-mute-2 bg-ct-surface-2 rounded-ct-sm p-3">
                            {dispute.admin_notes}
                          </p>
                        </div>
                      )}

                      {dispute.resolution && (
                        <div>
                          <h4 className="text-sm font-semibold text-ct-mute-2 mb-2">Resolution</h4>
                          <p className="text-sm text-ct-mute-2 bg-ct-teal/[0.14] rounded-ct-sm p-3">
                            {dispute.resolution}
                          </p>
                        </div>
                      )}

                      {/* Outcome note — deliberately OUTSIDE the actions block
                          below, which unmounts the moment a dispute becomes
                          terminal. A split resolves it, so a note rendered in
                          there would vanish at the exact moment it mattered. */}
                      {decisionNote[dispute.id] && (
                        <p className="text-sm text-ct-mute-2 bg-ct-surface-2 rounded-ct-sm p-3">
                          {decisionNote[dispute.id]}
                        </p>
                      )}

                      {/* Admin actions */}
                      {!isTerminal(dispute.status) && (() => {
                        const reasoning = (adminNotes[dispute.id] || '').trim();
                        const busy = updating === dispute.id;
                        const blocked = busy || reasoning.length === 0;
                        const err = decisionError[dispute.id];
                        return (
                        <div className="border-t border-ct-line-soft pt-5">
                          <h4 className="text-sm font-semibold text-ct-mute-2 mb-3">Your decision</h4>

                          <div className="mb-4">
                            <label
                              htmlFor={`notes-${dispute.id}`}
                              className="block text-sm font-medium text-ct-mute-2 mb-1.5"
                            >
                              Reason for this decision
                            </label>
                            <textarea {...proseInputProps}
                              id={`notes-${dispute.id}`}
                              value={adminNotes[dispute.id] || ''}
                              onChange={(e) => {
                                setAdminNotes((prev) => ({ ...prev, [dispute.id]: e.target.value }));
                                if (decisionError[dispute.id]) {
                                  setDecisionError((prev) => ({ ...prev, [dispute.id]: '' }));
                                }
                              }}
                              rows={3}
                              placeholder="What did you conclude, and what did you base it on? Both parties can be told this."
                              className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-colors resize-none text-sm"
                            />
                            <p className="text-xs text-ct-mute mt-1.5">
                              Required. Recorded permanently against your name, alongside the AI suggestion and
                              whether you went a different way.
                            </p>
                          </div>

                          {err && (
                            <p className="text-sm text-ct-rose mb-3">{err}</p>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {dispute.status === 'open' && (
                              <button
                                onClick={() => updateDisputeStatus(dispute.id, 'under_review')}
                                disabled={busy}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-medium hover:bg-ct-teal-deep transition-colors disabled:opacity-50"
                              >
                                {busy ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                                Mark Under Review
                              </button>
                            )}

                            <button
                              onClick={() => recordDecision(dispute, 'resolved_client')}
                              disabled={blocked}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-medium hover:brightness-110 transition-colors disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Resolve for Client
                            </button>

                            <button
                              onClick={() => recordDecision(dispute, 'resolved_tradie')}
                              disabled={blocked}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-medium hover:brightness-110 transition-colors disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4" />
                              )}
                              Resolve for Tradie
                            </button>

                            <button
                              onClick={() => recordDecision(dispute, 'dismissed')}
                              disabled={blocked}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-medium hover:bg-ct-teal-deep transition-colors disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                              Dismiss
                            </button>
                          </div>

                          {/* Split. Shown only where the money is still in the tradie's
                              Stripe balance (a completed job_funding destination charge) —
                              the same filter the edge function applies, so the control
                              never offers something it cannot carry out. */}
                          {splittable[dispute.job_id] != null && (
                            <div className="mt-4 pt-4 border-t border-ct-line-soft">
                              <h5 className="text-xs font-medium text-ct-mute uppercase tracking-wide mb-2">
                                Or split the payment
                              </h5>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ct-mute">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={splitAmount[dispute.id] || ''}
                                    onChange={(e) => {
                                      setSplitAmount((prev) => ({ ...prev, [dispute.id]: e.target.value }));
                                      if (decisionError[dispute.id]) {
                                        setDecisionError((prev) => ({ ...prev, [dispute.id]: '' }));
                                      }
                                    }}
                                    placeholder="0.00"
                                    aria-label="Amount to return to the client"
                                    className="w-36 pl-7 pr-3 py-2 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-colors text-sm"
                                  />
                                </div>
                                <button
                                  onClick={() => recordSplit(dispute)}
                                  disabled={blocked}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-md text-sm font-medium hover:bg-ct-teal-deep transition-colors disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Scale className="w-4 h-4" />
                                  )}
                                  Return this to the client
                                </button>
                              </div>
                              <p className="text-xs text-ct-mute mt-2">
                                {formatAud(splittable[dispute.job_id])} is held for this job. The client is
                                refunded the amount above and the tradie is paid the rest, less our fee on
                                their share only. This moves money immediately and cannot be undone here.
                              </p>
                            </div>
                          )}

                          <p className="text-xs text-ct-mute mt-3">
                            Resolving unfreezes this job&apos;s payout. Other than a split, it does not
                            itself move money — a released payment is still clawed back from
                            Admin → Payments.
                          </p>
                        </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
