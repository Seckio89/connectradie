import { proseInputProps } from '../lib/proseInput';
// ─────────────────────────────────────────────────────────────────────────────
// TradieQuoteActions — tradie-side UI surface for a v2 (3-stage) quote.
//
// Renders the status badge + the actions available to the tradie at this
// quote's current state (per getTradieActions). The two non-trivial actions
// open small forms in modals:
//   - "Mark site visit complete" → posts to complete-site-visit (T5)
//   - "Submit final quote"       → posts to submit-final-quote (T2 / T9)
//
// The component is a no-op on flow_version=1 jobs so it can be dropped into
// any surface that already shows tradie-owned quotes without changing v1 UX.
//
// Spec: docs/three-stage-quote-flow.md
// Helpers: src/lib/quoteFlow.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { CheckCircle2, FileText, Loader2, AlertTriangle, X } from 'lucide-react';
import Modal from './Modal';
import QuoteStatusBadge from './QuoteStatusBadge';
import TrustSignals from './TrustSignals';
import {
  getTradieActions,
  getQuoteStatusDescription,
  finalPriceExceedsAdvisory,
  PRICE_ADVISORY_FACTOR,
} from '../lib/quoteFlow';
import { callEdgeFunction } from '../lib/edgeFn';
import type { Quote, Job } from '../types/database';

const DEFAULT_VALIDITY_DAYS = 14;

// Trade-relevant example for the visit-notes field, so a cleaning job shows a
// cleaning example, a plumbing job a plumbing one, etc.
function visitNotesPlaceholder(trade?: string): string {
  const t = (trade || '').toLowerCase();
  if (t.includes('clean')) return 'e.g. Walked through all rooms — kitchen and two bathrooms need a deep clean; lounge carpet is heavily soiled.';
  if (t.includes('plumb')) return 'e.g. Inspected under the sink — the mixer tap and flexible hoses need replacing; no leak in the wall.';
  if (t.includes('electric')) return 'e.g. Checked the switchboard — needs an RCD and two extra power points in the kitchen.';
  if (t.includes('paint')) return 'e.g. Assessed the walls — two coats needed, with filling and sanding in the hallway first.';
  if (t.includes('garden') || t.includes('landscap') || t.includes('lawn')) return 'e.g. Looked over the yard — hedges need trimming and two beds to weed and mulch.';
  if (t.includes('carpent') || t.includes('build')) return 'e.g. Measured the deck — about 12m² to replace; several joists are sound and can stay.';
  if (t.includes('tile')) return 'e.g. Inspected the bathroom — the original tiles can stay; only the floor needs replacing.';
  if (t.includes('pest')) return 'e.g. Inspected inside and out — signs of ants in the kitchen; recommend a perimeter treatment.';
  if (t.includes('roof')) return 'e.g. Got up on the roof — three cracked tiles and the chimney flashing needs resealing.';
  if (t.includes('hvac') || t.includes('air') || t.includes('heat') || t.includes('cool')) return 'e.g. Checked the unit — filters need replacing and the outdoor coil is due for a clean.';
  return 'e.g. Inspected the site and confirmed the scope of work required.';
}

interface TradieQuoteActionsProps {
  quote: Quote;
  job: Pick<Job, 'id' | 'flow_version'>;
  /** Trade/category of the job — drives a relevant example in the visit-notes field. */
  tradeCategory?: string;
  /** Fired after a successful action so the parent can refetch / refresh. */
  onChange?: () => void;
}

export default function TradieQuoteActions({ quote, job, tradeCategory, onChange }: TradieQuoteActionsProps) {
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);

  // This component is v2-only; v1 surfaces keep their existing UX.
  if (job.flow_version !== 2) return null;

  const actions = getTradieActions(quote, job);
  const description = getQuoteStatusDescription(quote.status, 'tradie');

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <QuoteStatusBadge status={quote.status} role="tradie" />
        {description && (
          <span className="text-xs text-gray-500">{description}</span>
        )}
      </div>

      {(actions.includes('mark_visit_complete') || actions.includes('submit_final')) && (
        <div className="flex items-center gap-2 flex-wrap">
          {actions.includes('mark_visit_complete') && (
            <button
              onClick={() => setShowCompleteModal(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors text-sm shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark site visit complete
            </button>
          )}
          {actions.includes('submit_final') && (
            <button
              onClick={() => setShowFinalModal(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 transition-colors text-sm shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Submit final quote
            </button>
          )}
        </div>
      )}

      <CompleteVisitModal
        isOpen={showCompleteModal}
        quote={quote}
        tradeCategory={tradeCategory}
        onClose={() => setShowCompleteModal(false)}
        onDone={() => { setShowCompleteModal(false); onChange?.(); }}
      />

      <SubmitFinalQuoteModal
        isOpen={showFinalModal}
        quote={quote}
        onClose={() => setShowFinalModal(false)}
        onDone={() => { setShowFinalModal(false); onChange?.(); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Complete-visit modal — T5
// Optional notes; calls complete-site-visit.
// ─────────────────────────────────────────────────────────────────────────────

interface CompleteVisitModalProps {
  isOpen: boolean;
  quote: Quote;
  tradeCategory?: string;
  onClose: () => void;
  onDone: () => void;
}

function CompleteVisitModal({ isOpen, quote, tradeCategory, onClose, onDone }: CompleteVisitModalProps) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await callEdgeFunction('complete-site-visit', {
        quoteId: quote.id,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      setNotes('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark visit complete');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Mark site visit complete</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              The client will be notified. After this, you'll need to submit your final quote.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Notes from the visit <span className="text-gray-400 font-normal">(optional, visible to the client)</span>
        </label>
        <textarea {...proseInputProps}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={visitNotesPlaceholder(tradeCategory)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
        />

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white font-semibold rounded-lg hover:bg-emerald-600 transition-colors text-sm disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark visit complete
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit-final-quote modal — T2 / T9
//
// Required: finalPrice (must be > 0).
// Optional: finalValidUntil (defaults server-side to today + 14 days), message.
//
// When finalPrice triggers the ACL advisory threshold (>125% of price_max),
// the modal:
//   - shows a yellow warning above the message field
//   - requires the message field to be filled (UI gate; the server records
//     the advisory either way per spec §5.5)
// ─────────────────────────────────────────────────────────────────────────────

interface SubmitFinalQuoteModalProps {
  isOpen: boolean;
  quote: Quote;
  onClose: () => void;
  onDone: () => void;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function SubmitFinalQuoteModal({ isOpen, quote, onClose, onDone }: SubmitFinalQuoteModalProps) {
  const initialPrice = quote.firm_price != null
    ? String(quote.firm_price)
    : quote.price_max != null
      ? String(quote.price_max)
      : '';
  const [finalPriceStr, setFinalPriceStr] = useState(initialPrice);
  const [finalValidUntil, setFinalValidUntil] = useState(todayPlus(DEFAULT_VALIDITY_DAYS));
  const [message, setMessage] = useState(quote.message ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalPriceNum = Number(finalPriceStr);
  const isValidPrice = Number.isFinite(finalPriceNum) && finalPriceNum > 0;
  const exceedsAdvisory = isValidPrice
    && finalPriceExceedsAdvisory({ final_price: finalPriceNum, price_max: quote.price_max });
  const messageRequired = exceedsAdvisory;
  const messageOk = !messageRequired || message.trim().length >= 10;

  const todayIso = new Date().toISOString().slice(0, 10);
  const validityOk = !!finalValidUntil && finalValidUntil >= todayIso;

  const canSubmit = isValidPrice && validityOk && messageOk && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await callEdgeFunction('submit-final-quote', {
        quoteId: quote.id,
        finalPrice: finalPriceNum,
        finalValidUntil,
        message: message.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit final quote');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Submit your final quote</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              This is binding under Australian Consumer Law. The client can accept and pay
              up until the validity date — after that, the quote expires and you can submit a new one.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Original estimate context */}
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          <span className="font-semibold">Your original estimate:</span>{' '}
          {quote.firm_price != null
            ? <>${Number(quote.firm_price).toLocaleString()} firm</>
            : <>${Number(quote.price_min).toLocaleString()}–${Number(quote.price_max).toLocaleString()}</>}
          {quote.requires_site_inspection && <> · site visit required</>}
        </div>

        {/* Final price */}
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Final price (AUD) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={finalPriceStr}
            onChange={(e) => setFinalPriceStr(e.target.value)}
            placeholder="0.00"
            className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
          />
        </div>

        {/* ACL advisory */}
        {exceedsAdvisory && (
          <div className="mt-3 p-3 bg-warm-50 border border-warm-200 rounded-lg text-xs text-warm-800 flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">This final is more than 25% above your original estimate range.</span>{' '}
              That's allowed — but the message field below is required so the client understands why.
              ({Math.round((PRICE_ADVISORY_FACTOR - 1) * 100)}% headroom from ${Number(quote.price_max).toLocaleString()}.)
            </span>
          </div>
        )}

        {/* Validity */}
        <label className="block text-sm font-medium text-gray-700 mb-1.5 mt-4">
          Valid until <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          min={todayIso}
          value={finalValidUntil}
          onChange={(e) => setFinalValidUntil(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
        />
        <p className="text-xs text-gray-400 mt-1">Defaults to {DEFAULT_VALIDITY_DAYS} days. Adjust if your pricing depends on materials that move quickly.</p>

        {/* Message */}
        <label className="block text-sm font-medium text-gray-700 mb-1.5 mt-4">
          Message to the client {messageRequired ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
        </label>
        <textarea {...proseInputProps}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={messageRequired
            ? 'Explain why the final differs from the estimate range — concealed damage, harder access, additional materials, etc.'
            : 'Any notes about the price, materials, or scope.'}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 ${
            messageRequired && !messageOk ? 'border-warm-300 bg-warm-50/30' : 'border-gray-200'
          }`}
        />
        {messageRequired && !messageOk && (
          <p className="text-xs text-warm-700 mt-1">Please write at least 10 characters explaining the price.</p>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Value bundle reminder for the tradie at this commitment moment. */}
        <div className="mt-4">
          <TrustSignals role="tradie" />
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Submit final quote
          </button>
        </div>
      </div>
    </Modal>
  );
}
