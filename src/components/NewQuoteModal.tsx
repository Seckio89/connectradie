// ─────────────────────────────────────────────────────────────────────────────
// NewQuoteModal — compose a quote for an off-app client contact. Creates the job
// + quote (recorded in the app), then emails the client a token link to view and
// accept it. If the contact has no email, the tradie can copy the link to share.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Loader2, Send, Copy, CheckCircle2, Check, Sparkles } from 'lucide-react';
import Modal from './Modal';
import QuoteEstimator from './QuoteEstimator';
import { supabase } from '../lib/supabase';
import type { ClientContact } from '../types/database';

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

  const handleSend = async () => {
    if (!title.trim()) { setError('Add a short job title.'); return; }
    const priceNum = parseFloat(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) { setError('Enter a valid price.'); return; }

    setSending(true);
    setError('');

    let createdJobId: string | null = null;
    try {
      // 1. Record the job against the off-app contact.
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          tradie_id: tradieId,
          client_contact_id: contact.id,
          title: title.trim(),
          description: description.trim() || title.trim(),
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
        message: message.trim() || null,
        status: 'pending',
        public_token: token,
        sent_to_email: contact.email,
      });
      if (quoteError) throw quoteError;

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
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quote sent</h2>
              <p className="text-sm text-gray-500 mt-1">
                {emailed
                  ? `Emailed to ${contact.email}. `
                  : contact.email
                    ? 'We couldn’t email it automatically — share the link below. '
                    : 'This contact has no email — share the link below. '}
                The job is now recorded in your app.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <span className="flex-1 text-xs text-gray-600 truncate text-left">{sentLink}</span>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
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
            <div>
              <h2 className="text-lg font-semibold text-gray-900">New quote</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                For {contact.full_name}{contact.email ? ` · ${contact.email}` : ''}
              </p>
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
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What the job involves…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
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
                {showEstimator && (
                  <div className="mt-3">
                    <QuoteEstimator
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
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Anything you'd like them to know…"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
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
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {contact.email ? 'Send quote' : 'Create quote'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
