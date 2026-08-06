// ─────────────────────────────────────────────────────────────────────────────
// NewQuoteModal — compose a quote for an off-app client contact. Creates the job
// + quote (recorded in the app), then emails the client a token link to view and
// accept it. If the contact has no email, the tradie can copy the link to share.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Loader2, Send, Copy, CheckCircle2, Check, Sparkles, FileText, Repeat, Plus, Layers, BookmarkPlus, Trash2, ChevronDown, Zap } from 'lucide-react';
import Modal from './Modal';
import QuoteEstimator from './QuoteEstimator';
import QuoteFeeDisclosure from './QuoteFeeDisclosure';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createRecurringJob, calculateNextDueDate, FREQ_WEEKLY, FREQ_FORTNIGHTLY } from '../lib/recurringJobs';
import { proseInputProps } from '../lib/proseInput';
import { composeDescription } from '../lib/jobDescription';
import { getJobHints } from '../lib/jobDescriptionHints';
import { getQuickQuotePresets } from '../lib/quoteQuickAdd';
import { listQuoteTemplates, saveQuoteTemplate, deleteQuoteTemplate } from '../lib/pricingHelper';
import { listClientSites, createClientSite } from '../lib/clientSites';
import type { ClientContact, ClientSite, QuoteTemplate } from '../types/database';

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', months: FREQ_WEEKLY },
  { key: 'fortnightly', label: 'Fortnightly', months: FREQ_FORTNIGHTLY },
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: 'quarterly', label: 'Quarterly', months: 3 },
];

// Per-cycle visit scheduling for recurring services (e.g. a weekly office
// clean that needs Mon + Thu). Days map to JS getDay() numbers for day_of_week.
const DAY_OPTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_TO_DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const HOUR_OPTS = Array.from({ length: 13 }, (_, i) => i); // 0–12
const MIN_OPTS = [0, 15, 30, 45];

interface VisitSlot { day: string; hours: string; mins: string }

// "3h" / "1h 30m" / "45m" / '' from a slot's hours+minutes.
function slotDuration(s: VisitSlot): string {
  const h = Number(s.hours) || 0, m = Number(s.mins) || 0;
  if (!h && !m) return '';
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

// "Mon (3h), Thu (1h 30m)" — a human summary of the visit slots.
function scheduleSummary(slots: VisitSlot[]): string {
  return slots.map((s) => { const d = slotDuration(s); return d ? `${s.day} (${d})` : s.day; }).join(', ');
}

const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

// Feature flag: the one-tap Quick Quote preset row. Hidden for now — flip to
// true to re-enable (presets live in src/lib/quoteQuickAdd.ts).
const SHOW_QUICK_QUOTE = false;

// Lightweight trade categorisation for the recurring service record.
function deriveTrade(title: string): string {
  const t = title.toLowerCase();
  if (/clean/.test(t)) return 'cleaning';
  if (/paint/.test(t)) return 'painting';
  if (/lawn|mow|garden|landscap/.test(t)) return 'gardening';
  if (/plumb/.test(t)) return 'plumbing';
  if (/electric/.test(t)) return 'electrical';
  return 'general';
}

interface NewQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
  tradieId: string;
  contact: ClientContact;
}

export default function NewQuoteModal({ isOpen, onClose, onSent, tradieId, contact }: NewQuoteModalProps) {
  const { tradieDetails } = useAuth();
  const tradeCategory = tradieDetails?.trade_category ?? null;
  const quickAddTasks = getJobHints(tradeCategory);
  const quickQuotePresets = getQuickQuotePresets(tradeCategory);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showEstimator, setShowEstimator] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [visitsPerCycle, setVisitsPerCycle] = useState(1);
  const [visitSlots, setVisitSlots] = useState<VisitSlot[]>([{ day: 'Mon', hours: '', mins: '' }]);
  const [priceBasis, setPriceBasis] = useState<'per_visit' | 'per_cycle'>('per_visit');
  const [consumables, setConsumables] = useState<'client' | 'tradie_billed'>('client');
  // Tradie-only: site conditions, assumptions, pricing rationale. Stored on
  // jobs.notes — never in the description, never returned to the client.
  const [internalNotes, setInternalNotes] = useState('');
  const [emailFailReason, setEmailFailReason] = useState('');

  // Estimator trade/property — tags the quote so it can feed anonymised area stats.
  const [estTrade, setEstTrade] = useState<string | null>(null);
  const [estProperty, setEstProperty] = useState<string | null>(null);

  // Client sites — one client, many locations. The selected site drives the
  // job's address/coords, the quote's recipient email, and seeds the job's
  // (PIN-protected) access instructions.
  const [sites, setSites] = useState<ClientSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [addingSite, setAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    listClientSites(contact.id).then((s) => {
      setSites(s);
      setSelectedSiteId((prev) => prev ?? (s.find((x) => x.is_default)?.id ?? s[0]?.id ?? null));
    });
  }, [isOpen, contact.id]);

  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  // Effective delivery details: site-specific first, then the client's main.
  const effectiveEmail = selectedSite?.contact_email || contact.email;
  const effectiveAddress = selectedSite?.address || contact.address;

  const quickAddSite = async () => {
    if (!newSiteName.trim()) return;
    setSavingSite(true);
    const r = await createClientSite(contact.id, { siteName: newSiteName, address: newSiteAddress });
    setSavingSite(false);
    if (r.ok && r.site) {
      setSites((prev) => [...prev, r.site!]);
      setSelectedSiteId(r.site.id);
      setAddingSite(false);
      setNewSiteName('');
      setNewSiteAddress('');
    }
  };

  // Reusable quote templates.
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    listQuoteTemplates(tradieId).then(setTemplates);
  }, [isOpen, tradieId]);

  const applyTemplate = (t: QuoteTemplate) => {
    setTitle((t.title || t.name || '').trim());
    if (t.scope) setDescription(t.scope);
    if (t.price != null) setPrice(String(t.price));
    if (t.internal_notes) setInternalNotes(t.internal_notes);
    if (t.message) setMessage(t.message);
    setEstTrade(t.trade_category ?? null);
    setEstProperty(t.property_type ?? null);
    setShowTemplates(false);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateError(null);
    const r = await saveQuoteTemplate(tradieId, {
      name: templateName.trim(),
      title: title.trim() || null,
      scope: description.trim() || null,
      internalNotes: internalNotes.trim() || null,
      message: message.trim() || null,
      price: parseFloat(price) || null,
      propertyType: estProperty,
      tradeCategory: estTrade,
    });
    setSavingTemplate(false);
    if (r.ok) {
      setTemplateSaved(true);
      setShowSaveTemplate(false);
      setTemplateName('');
      listQuoteTemplates(tradieId).then(setTemplates);
    } else {
      // Previously discarded, so a failed save looked identical to no click.
      setTemplateError(r.error ?? 'Could not save the template.');
    }
  };

  const removeTemplate = async (id: string) => {
    await deleteQuoteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const firstName = contact.full_name.split(' ')[0] || 'them';

  // Grow/shrink the per-visit rows to match the chosen visits-per-cycle count.
  const setVisits = (n: number) => {
    const count = Math.min(7, Math.max(1, n));
    setVisitsPerCycle(count);
    setVisitSlots((prev) => {
      const next = [...prev];
      while (next.length < count) next.push({ day: DAY_OPTS[next.length % 7], hours: '', mins: '' });
      return next.slice(0, count);
    });
  };
  const updateSlot = (i: number, patch: Partial<VisitSlot>) =>
    setVisitSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  // Live per-visit / per-cycle figures derived from the entered price + basis.
  const priceNum = parseFloat(price) || 0;
  const freqLabel = FREQUENCIES.find((f) => f.key === frequency)?.label ?? 'Weekly';
  const perVisitPrice = priceBasis === 'per_cycle' && visitsPerCycle > 0 ? priceNum / visitsPerCycle : priceNum;
  const cyclePrice = priceBasis === 'per_visit' ? priceNum * visitsPerCycle : priceNum;

  // Trade-based quick-add: tap a chip to add the task as a description line,
  // tap again to remove it. Same task lists the client-side booking form uses.
  const norm = (s: string) => s.replace(/^[••\-*]\s*/, '').trim().toLowerCase();
  const taskActive = (task: string) =>
    description.split('\n').some((l) => norm(l) === task.toLowerCase());
  const toggleTask = (task: string) => {
    setDescription((prev) => {
      const lines = prev.split('\n').map((l) => l.trim()).filter(Boolean);
      const idx = lines.findIndex((l) => norm(l) === task.toLowerCase());
      if (idx >= 0) { lines.splice(idx, 1); return lines.join('\n'); }
      return [...lines, task].join('\n');
    });
  };

  // Quick Quote — one tap pre-fills title, scope and a ballpark price.
  const applyQuickQuote = (p: { title: string; tasks: string[]; price: number }) => {
    setTitle(p.title);
    setDescription(p.tasks.join('\n'));
    setPrice(String(p.price));
  };

  const handleSend = async () => {
    if (!title.trim()) { setError('Add a short job title.'); return; }
    if (!price || priceNum <= 0) { setError('Enter a valid price.'); return; }

    // The stored description is the CLIENT-VISIBLE scope of work only. For a
    // recurring service the visit cadence + days are client-relevant, so they
    // go here; the pricing basis / rationale stays in the tradie-only notes.
    const scopeLines = (description.trim() || title.trim()).split('\n').map((l) => l.trim()).filter(Boolean);
    if (isRecurring) {
      scopeLines.push(`Recurring: ${freqLabel} · ${visitsPerCycle} visit${visitsPerCycle > 1 ? 's' : ''} per cycle`);
      scopeLines.push(`Visit days: ${scheduleSummary(visitSlots)}`);
    }
    const finalDescription = composeDescription(scopeLines);

    // DB constraint jobs_description_not_empty requires > 10 chars — catch it
    // HERE with a useful message instead of a generic failure after submit.
    // The scope is also what the client sees on their quote, so it's worth having.
    if (finalDescription.trim().length <= 10) {
      setError('Describe the work in a line or two — this is the scope your client sees on the quote (at least 11 characters).');
      return;
    }

    setSending(true);
    setError('');

    // Internal notes (tradie-only): fold in the recurring pricing basis + schedule.
    let finalNotes = internalNotes.trim();
    if (isRecurring) {
      const basisLine = priceBasis === 'per_visit'
        ? `Pricing: ${aud(perVisitPrice)}/visit × ${visitsPerCycle} = ${aud(cyclePrice)} per ${freqLabel.toLowerCase()} cycle`
        : `Pricing: ${aud(cyclePrice)} per ${freqLabel.toLowerCase()} cycle (≈ ${aud(perVisitPrice)}/visit)`;
      const block = `Recurring schedule: ${scheduleSummary(visitSlots)}\n${basisLine}`;
      finalNotes = finalNotes ? `${finalNotes}\n\n${block}` : block;
    }

    let createdJobId: string | null = null;
    try {
      // 1. Record the job against the off-app contact.
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          tradie_id: tradieId,
          client_contact_id: contact.id,
          // If this contact's email belongs to a registered account, deliver the
          // job on-app too: it appears in THEIR dashboard where they can accept
          // and pay through escrow. The emailed public-token link still works.
          client_id: contact.linked_profile_id ?? null,
          title: title.trim(),
          description: finalDescription,
          notes: finalNotes || null,
          status: 'pending',
          // Site-first: the chosen location's address/coords, else the client's main.
          location_address: effectiveAddress,
          latitude: selectedSite?.latitude ?? contact.latitude,
          longitude: selectedSite?.longitude ?? contact.longitude,
          // Site access notes seed the job's access instructions — the DB trigger
          // relocates them into the PIN-gated job_access_details table.
          access_instructions: selectedSite?.access_instructions ?? null,
        })
        .select('id')
        .single();
      if (jobError || !job) throw jobError ?? new Error('Failed to create job');
      createdJobId = job.id;

      // 2. Create the quote with a shareable public token.
      const token = crypto.randomUUID();
      const { error: quoteError } = await supabase.from('quotes').insert({
        job_id: job.id,
        tradie_id: tradieId,
        price_min: priceNum,
        price_max: priceNum,
        firm_price: priceNum,
        message: message.trim(), // column is NOT NULL — empty string, never null
        status: 'pending',
        public_token: token,
        sent_to_email: effectiveEmail,
        // Anonymised area stats source — populated only when the estimator ran.
        trade_category: estTrade ? estTrade.toLowerCase() : null,
        property_type: estProperty ? estProperty.toLowerCase() : null,
      });
      if (quoteError) throw quoteError;

      // 2b. Recurring: register an ongoing service. agreed_price is stored
      // per-visit (derived from the cycle total when priced per-cycle), and the
      // first visit's weekday seeds day_of_week for scheduling.
      if (isRecurring) {
        const freq = FREQUENCIES.find((f) => f.key === frequency) ?? FREQUENCIES[0];
        await createRecurringJob({
          client_contact_id: contact.id,
          client_id: contact.linked_profile_id ?? undefined,
          tradie_id: tradieId,
          trade_category: deriveTrade(title),
          description: finalDescription,
          frequency_months: freq.months,
          next_due_date: calculateNextDueDate(new Date(), freq.months).toISOString().split('T')[0],
          reminder_days_before: 14,
          is_active: true,
          original_job_id: createdJobId,
          location: contact.address ?? undefined,
          agreed_price: Math.round(perVisitPrice),
          day_of_week: DAY_TO_DOW[visitSlots[0]?.day] ?? undefined,
          consumables_provider: consumables,
        });
      }

      const link = `${window.location.origin}/quote/${token}`;
      setSentLink(link);

      // 3. Email the client the accept link (best-effort — the link still works
      //    even if the email fails, and can be copied manually).
      if (effectiveEmail) {
        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            to: effectiveEmail,
            subject: `Your quote for ${title.trim()}`,
            body: `Hi ${contact.full_name.split(' ')[0]}, here's your quote for ${title.trim()}. Tap below to view the details and accept.`,
            notificationType: 'QUOTE_RECEIVED',
            metadata: { amount: `$${priceNum.toLocaleString('en-AU')}`, link },
          },
        });
        setEmailed(!emailError);
        if (emailError) {
          // Surface WHY it failed instead of a silent fallback.
          let reason = '';
          try { reason = (await (emailError as { context?: Response }).context?.json())?.error || ''; } catch { /* opaque */ }
          setEmailFailReason(reason);
          console.error('Quote email failed:', reason || emailError);
        } else {
          // Confirmation copy to the tradie so they KNOW it went out (and to
          // which address). recipientUserId resolves their address server-side.
          supabase.functions.invoke('send-email', {
            body: {
              recipientUserId: tradieId,
              subject: `Quote sent to ${contact.full_name} — ${title.trim()}`,
              body: `Your quote "${title.trim()}" ($${priceNum.toLocaleString('en-AU')}) was emailed to ${contact.full_name} at ${effectiveEmail}. You'll be notified when they accept.`,
            },
          }).catch(() => { /* best-effort */ });
        }
      }

      onSent();
    } catch (err) {
      // Roll back the orphaned job so a failed quote doesn't leave a stray job.
      if (createdJobId) {
        await supabase.from('jobs').delete().eq('id', createdJobId);
      }
      // Surface the REAL reason for known failures instead of a generic shrug —
      // a constraint name in the message tells us exactly what to say.
      const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
      console.error('Quote send failed:', err);
      // A dropped/timed-out request (patchy mobile signal) throws a fetch/network
      // error, not a DB rejection — tell the tradie it's their connection, not a
      // broken quote, so a signal blip doesn't read as an app failure.
      const isNetworkError =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        /failed to fetch|network ?error|network request failed|load failed|time?d? ?out/i.test(msg);
      if (msg.includes('jobs_description_not_empty')) {
        setError('Describe the work in a line or two — this is the scope your client sees on the quote (at least 11 characters).');
      } else if (msg.includes('jobs_budget_positive')) {
        setError('Enter a price greater than zero.');
      } else if (isNetworkError) {
        setError('Couldn’t reach the server — check your connection and try again. Your quote wasn’t sent.');
      } else {
        setError('Could not send the quote. Please try again.');
      }
    }
    setSending(false);
  };

  const copyLink = async () => {
    if (!sentLink) return;
    try {
      await navigator.clipboard.writeText(sentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — user can select manually */ }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <div className="p-6 space-y-5">
        {sentLink ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-ct-teal/[0.14] flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-ct-teal" />
              </div>
              <h2 className="text-lg font-semibold text-ct-paper">Quote sent</h2>
              <p className="text-sm text-ct-mute mt-1 max-w-sm mx-auto">
                {emailed
                  ? `Emailed to ${effectiveEmail}. `
                  : effectiveEmail
                    ? `We couldn’t email it automatically${emailFailReason ? ` (${emailFailReason})` : ''} — share the link below. `
                    : 'No email on file — share the link below. '}
                We’ll notify you as soon as {firstName} accepts.
              </p>
            </div>

            {/* Recap of what was sent */}
            <div className="flex items-center justify-between gap-3 bg-ct-surface-2 border border-ct-line rounded-ct-md px-4 py-3">
              <span className="text-sm font-medium text-ct-paper truncate">{title.trim() || 'Quote'}</span>
              {price && (
                <span className="text-sm font-semibold text-ct-paper flex-shrink-0">{`$${Number(price).toLocaleString('en-AU')}`}</span>
              )}
            </div>

            {/* Shareable link — the fallback / manual way to deliver the quote */}
            <div>
              <p className="text-xs font-medium text-ct-mute mb-1.5">Or share this link</p>
              <div className="flex items-center gap-2 bg-ct-surface border border-ct-line rounded-ct-md p-2 pl-3">
                <span className="flex-1 text-xs text-ct-mute-2 truncate text-left">{sentLink}</span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface border border-ct-line rounded-ct-sm text-xs font-medium text-ct-mute-2 hover:bg-ct-surface-2 flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-ct-teal" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Save this quote as a reusable template */}
            {templateSaved ? (
              <p className="text-xs text-ct-teal flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved as a template — reuse it on your next quote.
              </p>
            ) : showSaveTemplate ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name, e.g. Standard office clean"
                    className="flex-1 px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                  />
                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate || !templateName.trim()}
                    className="px-3 py-2 rounded-ct-sm bg-ct-teal text-ct-ink text-sm font-medium hover:bg-ct-teal-deep disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                  >
                    {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />} Save
                  </button>
                </div>
                {templateError && <p className="text-xs text-ct-rose">{templateError}</p>}
              </div>
            ) : (
              <button
                onClick={() => { setTemplateName(title.trim()); setShowSaveTemplate(true); }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-ct-line rounded-ct-md text-sm font-medium text-ct-mute-2 hover:bg-ct-surface-2 transition-colors"
              >
                <BookmarkPlus className="w-4 h-4 text-ct-mute-2" /> Save as template
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 bg-ct-teal text-ct-ink rounded-ct-md font-medium hover:brightness-110 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-ct-md bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-ct-mute-2" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ct-paper">New quote</h2>
                <p className="text-sm text-ct-mute mt-0.5 truncate">
                  For <span className="font-medium text-ct-mute-2">{contact.full_name}</span>{contact.email ? ` · ${contact.email}` : ''}
                </p>
                <p className="text-xs text-ct-mute mt-1">
                  {contact.email
                    ? 'They’ll get an email with a link to view and accept — no account needed.'
                    : 'No email on file — you’ll get a shareable link to send them.'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Which location is this job for? — sites drive address + email */}
              {sites.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Which location is this job for?</label>
                  <div className="space-y-1.5">
                    {sites.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSiteId(s.id)}
                        className={`w-full flex items-start gap-2.5 text-left rounded-ct-md border px-3 py-2.5 transition-colors ${
                          selectedSiteId === s.id ? 'border-ct-line bg-ct-surface-2' : 'border-ct-line bg-ct-surface hover:bg-ct-surface-2'
                        }`}
                      >
                        <span className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                          selectedSiteId === s.id ? 'border-ct-teal' : 'border-ct-line'
                        }`}>
                          {selectedSiteId === s.id && <span className="w-2 h-2 rounded-full bg-ct-surface-2" />}
                        </span>
                        <span className="min-w-0">
                          <span className="text-sm font-medium text-ct-paper">{s.site_name}</span>
                          {s.address && <span className="block text-xs text-ct-mute truncate">{s.address}</span>}
                          {s.contact_email && <span className="block text-[0.6875rem] text-ct-mute truncate">Quote emails go to {s.contact_email}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                  {addingSite ? (
                    <div className="mt-2 rounded-ct-md border border-ct-line p-3 space-y-2">
                      <input
                        type="text"
                        value={newSiteName}
                        onChange={(e) => setNewSiteName(e.target.value)}
                        placeholder="Location name, e.g. Office"
                        className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                      />
                      <input
                        type="text"
                        value={newSiteAddress}
                        onChange={(e) => setNewSiteAddress(e.target.value)}
                        placeholder="Address"
                        className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setAddingSite(false)}
                          className="flex-1 px-3 py-1.5 border border-ct-line rounded-ct-sm text-xs font-medium text-ct-mute-2 hover:bg-ct-surface-2">Cancel</button>
                        <button type="button" onClick={quickAddSite} disabled={savingSite || !newSiteName.trim()}
                          className="flex-1 px-3 py-1.5 bg-ct-teal text-ct-ink rounded-ct-sm text-xs font-medium hover:bg-ct-teal-deep disabled:opacity-50 flex items-center justify-center gap-1">
                          {savingSite && <Loader2 className="w-3 h-3 animate-spin" />} Save location
                        </button>
                      </div>
                      <p className="text-[0.6875rem] text-ct-mute">Add full details (site email, access notes) later on the client page.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingSite(true)}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add new location
                    </button>
                  )}
                </div>
              )}

              {/* Quick Quote — one tap pre-fills a common job (adjust price & send).
                  Behind SHOW_QUICK_QUOTE; hidden for now, flip the flag to restore. */}
              {SHOW_QUICK_QUOTE && quickQuotePresets.length > 0 && (
                <div className="rounded-ct-md border border-ct-line-soft bg-ct-surface-2/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ct-mute-2 mb-2">
                    <Zap className="w-3.5 h-3.5 text-ct-mute-2" /> Quick Quote — one tap, then adjust the price
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickQuotePresets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyQuickQuote(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ct-sm bg-ct-surface border border-ct-line text-xs font-medium text-ct-mute-2 hover:bg-ct-surface-2 transition-colors"
                      >
                        {p.label} <span className="text-ct-mute">· ${p.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Your saved quotes — reuse a template to pre-fill the form */}
              {templates.length > 0 && (
                <div className="border border-ct-line rounded-ct-md">
                  <button
                    type="button"
                    onClick={() => setShowTemplates((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-ct-mute-2"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-ct-mute-2" /> Your saved quotes
                      <span className="text-xs text-ct-mute font-normal">({templates.length})</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-ct-mute transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
                  </button>
                  {showTemplates && (
                    <div className="px-3 pb-3 space-y-1.5">
                      {templates.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 rounded-ct-sm border border-ct-line-soft bg-ct-surface-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ct-paper truncate">{t.name}</p>
                            <p className="text-xs text-ct-mute truncate">
                              {[t.title, t.price != null ? aud(Number(t.price)) : null, t.property_type].filter(Boolean).join(' · ') || 'Saved quote'}
                            </p>
                          </div>
                          <button type="button" onClick={() => applyTemplate(t)}
                            className="flex-shrink-0 px-2.5 py-1.5 rounded-ct-sm bg-ct-surface border border-ct-line text-xs font-medium text-ct-mute-2 hover:bg-ct-surface-2">Use</button>
                          <button type="button" onClick={() => removeTemplate(t.id)} aria-label="Delete template"
                            className="flex-shrink-0 p-1.5 text-ct-mute hover:text-ct-rose"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Job title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fortnightly house clean"
                  className="w-full px-4 py-3 bg-ct-ink text-ct-paper placeholder:text-ct-placeholder border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Description</label>
                <textarea
                  {...proseInputProps}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder={'One task per line, e.g.\nCourt side clean\nRubbish removal\nBathrooms cleaned'}
                  className="w-full px-4 py-3 bg-ct-ink text-ct-paper placeholder:text-ct-placeholder border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal resize-none"
                />
                <p className="mt-1 text-xs text-ct-mute">One task per line — these show as a bullet-point scope of work.</p>
                {quickAddTasks.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-xs font-medium text-ct-mute mb-1.5">Quick-add tasks — tap to add, tap again to remove</p>
                    <div className="flex flex-wrap gap-1.5">
                      {quickAddTasks.map((task) => {
                        const active = taskActive(task);
                        return (
                          <button
                            key={task}
                            type="button"
                            onClick={() => toggleTask(task)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              active ? 'bg-ct-teal/[0.14] border-ct-teal/30 text-ct-teal' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                            }`}
                          >
                            {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            {task}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-ct-mute-2">Price (AUD)</label>
                  <button
                    type="button"
                    onClick={() => setShowEstimator((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {showEstimator ? 'Hide pricing helper' : 'Help me price this'}
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ct-mute">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-3 bg-ct-ink text-ct-paper placeholder:text-ct-placeholder border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal"
                  />
                </div>
                <p className="mt-1 text-xs text-ct-mute">Enter your total price including labour and materials.</p>
                {/* Fee transparency for the tradie (never shown to the client) */}
                {/* This form has no materials field, so the whole price is
                    treated as labour — the same all-labour fallback the charge
                    path uses when no split is recorded. */}
                <QuoteFeeDisclosure labourDollars={parseFloat(price) || 0} className="mt-2" />
                {showEstimator && (
                  <div className="mt-3">
                    <QuoteEstimator
                      contact={contact}
                      onApply={(suggested, extras) => {
                        setPrice(String(suggested));
                        if (extras.trade) setEstTrade(extras.trade);
                        if (extras.property) setEstProperty(extras.property);
                        // Duties → client-visible scope; assumptions/hours → internal notes.
                        if (extras.scope.length) {
                          setDescription((prev) => {
                            const existing = prev.split('\n').map((l) => l.trim()).filter(Boolean);
                            const fresh = extras.scope.filter((s) => !existing.some((l) => l.toLowerCase() === s.toLowerCase()));
                            return [...existing, ...fresh].join('\n');
                          });
                        }
                        if (extras.internal) {
                          setInternalNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${extras.internal}` : extras.internal));
                        }
                        setShowEstimator(false);
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
                  Note to client <span className="text-ct-mute font-normal">(optional)</span>
                </label>
                <textarea
                  {...proseInputProps}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Anything you'd like them to know…"
                  className="w-full px-4 py-3 bg-ct-ink text-ct-paper placeholder:text-ct-placeholder border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
                  Internal notes / conditions <span className="text-ct-mute font-normal">(never shown to the client)</span>
                </label>
                <textarea
                  {...proseInputProps}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="Site conditions, assumptions, pricing rationale, access…"
                  className="w-full px-4 py-3 bg-ct-ink text-ct-paper placeholder:text-ct-placeholder border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal resize-none"
                />
                <p className="mt-1 text-xs text-ct-mute">For your records only — the client sees just the scope of work above.</p>
              </div>

              {/* Recurring service — turns the quote into an ongoing service */}
              <div className="border border-ct-line rounded-ct-md p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-ct-mute-2">
                    <Repeat className="w-4 h-4 text-ct-mute-2" /> Recurring service
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsRecurring((v) => !v)}
                    role="switch"
                    aria-checked={isRecurring}
                    aria-label={isRecurring ? 'Turn off recurring' : 'Turn on recurring'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isRecurring ? 'bg-ct-teal' : 'bg-ct-line'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-ct-surface shadow-sm transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <p className="text-xs text-ct-mute mt-1">Turn on for regular clients you visit weekly or fortnightly.</p>
                {isRecurring && (
                  <div className="mt-3 space-y-3">
                    {/* Frequency */}
                    <div>
                      <p className="text-[0.6875rem] font-medium text-ct-mute uppercase tracking-wide mb-1.5">Frequency</p>
                      <div className="flex flex-wrap gap-1.5">
                        {FREQUENCIES.map((f) => (
                          <button key={f.key} type="button" onClick={() => setFrequency(f.key)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              frequency === f.key ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                            }`}>{f.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Visits per cycle */}
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-[0.6875rem] font-medium text-ct-mute uppercase tracking-wide">Visits per {freqLabel.toLowerCase()} cycle</p>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setVisits(visitsPerCycle - 1)} disabled={visitsPerCycle <= 1}
                            aria-label="Fewer visits"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-ct-sm border border-ct-line text-ct-mute-2 hover:bg-ct-surface-2 disabled:opacity-40">−</button>
                          <span className="w-6 text-center text-sm font-semibold text-ct-paper tabular-nums">{visitsPerCycle}</span>
                          <button type="button" onClick={() => setVisits(visitsPerCycle + 1)} disabled={visitsPerCycle >= 7}
                            aria-label="More visits"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-ct-sm border border-ct-line text-ct-mute-2 hover:bg-ct-surface-2 disabled:opacity-40">+</button>
                        </div>
                      </div>
                      <p className="text-[0.6875rem] text-ct-mute mt-1">e.g. a weekly office clean with a full clean on Monday and a light one on Thursday.</p>
                    </div>

                    {/* Per-visit day + duration */}
                    <div className="space-y-1.5">
                      {visitSlots.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[0.6875rem] text-ct-mute w-12 flex-shrink-0">Visit {i + 1}</span>
                          <select value={s.day} onChange={(e) => updateSlot(i, { day: e.target.value })} aria-label={`Visit ${i + 1} day`}
                            className="flex-1 px-2 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal">
                            {DAY_OPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <select value={s.hours} onChange={(e) => updateSlot(i, { hours: e.target.value })} aria-label={`Visit ${i + 1} hours`}
                            className="w-20 px-2 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal">
                            <option value="">Hrs</option>
                            {HOUR_OPTS.map((h) => <option key={h} value={h}>{h} h</option>)}
                          </select>
                          <select value={s.mins} onChange={(e) => updateSlot(i, { mins: e.target.value })} aria-label={`Visit ${i + 1} minutes`}
                            className="w-20 px-2 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal">
                            <option value="">Min</option>
                            {MIN_OPTS.map((m) => <option key={m} value={m}>{m} m</option>)}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Price basis */}
                    <div>
                      <p className="text-[0.6875rem] font-medium text-ct-mute uppercase tracking-wide mb-1.5">The price above is</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {([['per_visit', 'Per visit'], ['per_cycle', `Per ${freqLabel.toLowerCase()} cycle`]] as const).map(([key, label]) => (
                          <button key={key} type="button" onClick={() => setPriceBasis(key)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              priceBasis === key ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                            }`}>{label}</button>
                        ))}
                      </div>
                      {priceNum > 0 && visitsPerCycle > 1 && (
                        <p className="text-[0.6875rem] text-ct-mute mt-1.5">
                          {priceBasis === 'per_visit'
                            ? <>≈ <span className="font-medium text-ct-mute-2">{aud(cyclePrice)}</span> per {freqLabel.toLowerCase()} cycle ({visitsPerCycle} × {aud(perVisitPrice)})</>
                            : <>≈ <span className="font-medium text-ct-mute-2">{aud(perVisitPrice)}</span> per visit ({aud(cyclePrice)} ÷ {visitsPerCycle})</>}
                        </p>
                      )}
                    </div>

                    {/* Consumables */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.6875rem] text-ct-mute">Consumables:</span>
                      {(['client', 'tradie_billed'] as const).map((c) => (
                        <button key={c} type="button" onClick={() => setConsumables(c)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            consumables === c ? 'bg-ct-surface-2 border-ct-line text-ct-mute-2' : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:bg-ct-surface-2'
                          }`}>{c === 'client' ? 'Client supplies' : 'I supply & bill'}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md text-sm text-ct-rose">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-ct-line text-ct-mute-2 rounded-ct-md font-medium hover:bg-ct-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-3 bg-ct-teal text-ct-ink rounded-ct-md font-medium hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecurring ? <Repeat className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                Send Quote
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
