// ─────────────────────────────────────────────────────────────────────────────
// NewQuoteModal — compose a quote for an off-app client contact. Creates the job
// + quote (recorded in the app), then emails the client a token link to view and
// accept it. If the contact has no email, the tradie can copy the link to share.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Loader2, Send, Copy, CheckCircle2, Check, Sparkles, FileText, Repeat, Plus } from 'lucide-react';
import Modal from './Modal';
import QuoteEstimator from './QuoteEstimator';
import { supabase } from '../lib/supabase';
import { createRecurringJob, calculateNextDueDate, FREQ_WEEKLY, FREQ_FORTNIGHTLY } from '../lib/recurringJobs';
import { proseInputProps } from '../lib/proseInput';
import { composeDescription } from '../lib/jobDescription';
import type { ClientContact } from '../types/database';

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', months: FREQ_WEEKLY },
  { key: 'fortnightly', label: 'Fortnightly', months: FREQ_FORTNIGHTLY },
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: 'quarterly', label: 'Quarterly', months: 3 },
];

// Common cleaning tasks — tick to add as scope bullets (cleaning jobs only).
const CLEANING_TASKS = [
  'Floor mopping', 'Vacuuming', 'Bathroom clean', 'Kitchen clean',
  'Rubbish removal', 'Window cleaning', 'Dusting surfaces', 'Empty bins', 'Oven clean',
];

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
  const [consumables, setConsumables] = useState<'client' | 'tradie_billed'>('client');
  const [siteNotes, setSiteNotes] = useState('');

  const firstName = contact.full_name.split(' ')[0] || 'them';

  // Cleaning jobs get a quick tick-list that composes the description into bullets.
  const isCleaning = /clean/i.test(title);
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

  const handleSend = async () => {
    if (!title.trim()) { setError('Add a short job title.'); return; }
    const priceNum = parseFloat(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) { setError('Enter a valid price.'); return; }

    setSending(true);
    setError('');

    // Compose the stored description: scope lines (one per line) + optional site notes.
    const scopeSource = description.trim() || title.trim();
    const finalDescription = composeDescription(scopeSource.split('\n'), siteNotes);

    let createdJobId: string | null = null;
    try {
      // 1. Record the job against the off-app contact.
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          tradie_id: tradieId,
          client_contact_id: contact.id,
          title: title.trim(),
          description: finalDescription,
          status: 'pending',
          location_address: contact.address,
          latitude: contact.latitude,
          longitude: contact.longitude,
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
        sent_to_email: contact.email,
      });
      if (quoteError) throw quoteError;

      // 2b. Recurring: register an ongoing service (the price becomes per-visit).
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
          agreed_price: priceNum,
          consumables_provider: consumables,
        });
      }

      const link = `${window.location.origin}/quote/${token}`;
      setSentLink(link);

      // 3. Email the client the accept link (best-effort — the link still works
      //    even if the email fails, and can be copied manually).
      if (contact.email) {
        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            to: contact.email,
            subject: `Your quote for ${title.trim()}`,
            body: `Hi ${contact.full_name.split(' ')[0]}, here's your quote for ${title.trim()}. Tap below to view the details and accept.`,
            notificationType: 'QUOTE_RECEIVED',
            metadata: { amount: `$${priceNum.toLocaleString('en-AU')}`, link },
          },
        });
        setEmailed(!emailError);
      }

      onSent();
    } catch {
      // Roll back the orphaned job so a failed quote doesn't leave a stray job.
      if (createdJobId) {
        await supabase.from('jobs').delete().eq('id', createdJobId);
      }
      setError('Could not send the quote. Please try again.');
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
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Quote sent</h2>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                {emailed
                  ? `Emailed to ${contact.email}. `
                  : contact.email
                    ? 'We couldn’t email it automatically — share the link below. '
                    : 'No email on file — share the link below. '}
                We’ll notify you as soon as {firstName} accepts.
              </p>
            </div>

            {/* Recap of what was sent */}
            <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-gray-900 truncate">{title.trim() || 'Quote'}</span>
              {price && (
                <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{`$${Number(price).toLocaleString('en-AU')}`}</span>
              )}
            </div>

            {/* Shareable link — the fallback / manual way to deliver the quote */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Or share this link</p>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2 pl-3">
                <span className="flex-1 text-xs text-gray-600 truncate text-left">{sentLink}</span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-warm-500 text-white rounded-xl font-medium hover:bg-warm-600 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-secondary-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">New quote</h2>
                <p className="text-sm text-gray-500 mt-0.5 truncate">
                  For <span className="font-medium text-gray-700">{contact.full_name}</span>{contact.email ? ` · ${contact.email}` : ''}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {contact.email
                    ? 'They’ll get an email with a link to view and accept — no account needed.'
                    : 'No email on file — you’ll get a shareable link to send them.'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Job title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fortnightly house clean"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  {...proseInputProps}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder={'One task per line, e.g.\nCourt side clean\nRubbish removal\nBathrooms cleaned'}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <p className="mt-1 text-xs text-gray-500">One task per line — these show as a bullet-point scope of work.</p>
                {isCleaning && (
                  <div className="mt-2.5">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Quick add cleaning tasks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CLEANING_TASKS.map((task) => {
                        const active = taskActive(task);
                        return (
                          <button
                            key={task}
                            type="button"
                            onClick={() => toggleTask(task)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              active ? 'bg-warm-50 border-warm-300 text-warm-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
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
                  <label className="block text-sm font-medium text-gray-700">Price (AUD)</label>
                  <button
                    type="button"
                    onClick={() => setShowEstimator((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {showEstimator ? 'Hide pricing helper' : 'Help me price this'}
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Enter your total price including labour and materials.</p>
                {showEstimator && (
                  <div className="mt-3">
                    <QuoteEstimator
                      contact={contact}
                      onApply={(suggested, summary) => {
                        setPrice(String(suggested));
                        setDescription((prev) => (prev.trim() ? `${prev.trim()}\n\n${summary}` : summary));
                        setShowEstimator(false);
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Note to client <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  {...proseInputProps}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Anything you'd like them to know…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Site notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  {...proseInputProps}
                  value={siteNotes}
                  onChange={(e) => setSiteNotes(e.target.value)}
                  rows={2}
                  placeholder="Conditions & access — parking, gate code, pets… (not duties)"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <p className="mt-1 text-xs text-gray-500">Kept separate from the scope of work.</p>
              </div>

              {/* Recurring service — turns the quote into an ongoing service */}
              <div className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Repeat className="w-4 h-4 text-secondary-600" /> Recurring service
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsRecurring((v) => !v)}
                    aria-label={isRecurring ? 'Turn off recurring' : 'Turn on recurring'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isRecurring ? 'bg-warm-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Turn on for regular clients you visit weekly or fortnightly.</p>
                {isRecurring && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500">
                      The price above becomes the <span className="font-medium">per-visit</span> price. This creates an ongoing service you can track and re-bill.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {FREQUENCIES.map((f) => (
                        <button key={f.key} type="button" onClick={() => setFrequency(f.key)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            frequency === f.key ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>{f.label}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-gray-500">Consumables:</span>
                      {(['client', 'tradie_billed'] as const).map((c) => (
                        <button key={c} type="button" onClick={() => setConsumables(c)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            consumables === c ? 'bg-secondary-100 border-secondary-300 text-secondary-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>{c === 'client' ? 'Client supplies' : 'I supply & bill'}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-3 bg-warm-500 text-white rounded-xl font-medium hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
