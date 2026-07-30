import { useState, useEffect } from 'react';
import { X, FileText, Send, Loader2 } from 'lucide-react';
import { getUninvoicedVisits, generateInvoice, sendInvoice } from '../lib/ongoingServices';
import type { ServiceAgreement, ServiceVisit, ServiceInvoice } from '../types/database';

interface GenerateInvoiceModalProps {
  isOpen: boolean;
  agreement: ServiceAgreement & { client?: { full_name: string } };
  onClose: () => void;
  onSuccess: () => void;
}

export default function GenerateInvoiceModal({ isOpen, agreement, onClose, onSuccess }: GenerateInvoiceModalProps) {
  const [visits, setVisits] = useState<ServiceVisit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<ServiceInvoice | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setGeneratedInvoice(null);
    getUninvoicedVisits(agreement.id)
      .then(setVisits)
      .catch(() => setVisits([]))
      .finally(() => setIsLoading(false));
  }, [agreement.id, isOpen]);

  if (!isOpen) return null;

  const subtotal = visits.reduce((sum, v) => sum + v.amount, 0);
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + gst;

  const periodStart = visits.length > 0 ? visits[0].visit_date : '';
  const periodEnd = visits.length > 0 ? visits[visits.length - 1].visit_date : '';

  const formatDate = (date: string) =>
    new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });

  const handleGenerate = async () => {
    if (visits.length === 0) return;
    setIsGenerating(true);
    try {
      const result = await generateInvoice(agreement.id, periodStart, periodEnd);
      setGeneratedInvoice(result.invoice);
    } catch (err) {
      console.error('Failed to generate invoice:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!generatedInvoice) return;
    setIsSending(true);
    try {
      await sendInvoice(generatedInvoice.id);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to send invoice:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-ct-surface rounded-ct-lg shadow-2xl z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-ct-surface border-b border-ct-line-soft p-5 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-ct-paper">
            {generatedInvoice ? 'Invoice Generated' : 'Generate Invoice'}
          </h2>
          <button onClick={onClose} className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-ct-teal animate-spin" />
            </div>
          ) : visits.length === 0 && !generatedInvoice ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-ct-mute mx-auto mb-3" />
              <p className="text-sm text-ct-mute">No uninvoiced visits</p>
              <p className="text-xs text-ct-mute mt-1">Log some visits first, then come back to invoice.</p>
            </div>
          ) : !generatedInvoice ? (
            <>
              {/* Client & Service */}
              <div className="mb-5 p-3 bg-ct-surface-2 rounded-ct-sm">
                <p className="text-sm font-medium text-ct-paper">{agreement.title}</p>
                <p className="text-xs text-ct-mute">{agreement.client?.full_name || 'Client'}</p>
                <p className="text-xs text-ct-mute mt-0.5">{agreement.address}</p>
              </div>

              {/* Period */}
              <p className="text-xs text-ct-mute mb-3">
                Period: {formatDate(periodStart)} — {formatDate(periodEnd)}
              </p>

              {/* Visits List */}
              <div className="mb-5 divide-y divide-ct-line-soft">
                {visits.map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-ct-paper">{formatDate(visit.visit_date)}</p>
                      <p className="text-xs text-ct-mute">
                        {visit.visit_type === 'extra' ? 'Extra visit' : 'Regular visit'}
                        {visit.notes && ` — ${visit.notes}`}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-ct-paper">${visit.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="p-4 bg-ct-teal/[0.14] rounded-ct-sm mb-5">
                <div className="flex justify-between text-xs text-ct-mute-2 mb-1">
                  <span>{visits.length} visit{visits.length !== 1 ? 's' : ''}</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-ct-mute-2 mb-2">
                  <span>GST (10%)</span>
                  <span>${gst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-ct-paper pt-2 border-t border-ct-teal/30">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full px-4 py-3 bg-ct-teal text-ct-ink font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {isGenerating ? 'Generating...' : 'Generate Invoice'}
              </button>
            </>
          ) : (
            <>
              {/* Invoice Preview */}
              <div className="mb-5 p-4 border border-ct-line rounded-ct-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-ct-mute">Invoice</p>
                    <p className="text-lg font-semibold text-ct-paper">{generatedInvoice.invoice_number}</p>
                  </div>
                  <span className="px-3 py-1 bg-ct-amber/[0.13] text-ct-amber text-xs font-medium rounded-full">
                    Draft
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ct-mute">Period</span>
                    <span className="text-ct-paper">{formatDate(generatedInvoice.period_start)} — {formatDate(generatedInvoice.period_end)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ct-mute">Visits</span>
                    <span className="text-ct-paper">{generatedInvoice.visit_count}</span>
                  </div>
                  {generatedInvoice.due_date && (
                    <div className="flex justify-between">
                      <span className="text-ct-mute">Due</span>
                      <span className="text-ct-paper">{formatDate(generatedInvoice.due_date)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-ct-line">
                    <span className="font-medium text-ct-paper">Total</span>
                    <span className="font-semibold text-ct-paper">${generatedInvoice.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSend}
                disabled={isSending}
                className="w-full px-4 py-3 bg-ct-teal text-ct-ink font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSending ? 'Sending...' : 'Send to Client'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
