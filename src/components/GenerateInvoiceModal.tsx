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
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {generatedInvoice ? 'Invoice Generated' : 'Generate Invoice'}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
          ) : visits.length === 0 && !generatedInvoice ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No uninvoiced visits</p>
              <p className="text-xs text-gray-400 mt-1">Log some visits first, then come back to invoice.</p>
            </div>
          ) : !generatedInvoice ? (
            <>
              {/* Client & Service */}
              <div className="mb-5 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">{agreement.title}</p>
                <p className="text-xs text-gray-500">{agreement.client?.full_name || 'Client'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{agreement.address}</p>
              </div>

              {/* Period */}
              <p className="text-xs text-gray-500 mb-3">
                Period: {formatDate(periodStart)} — {formatDate(periodEnd)}
              </p>

              {/* Visits List */}
              <div className="mb-5 divide-y divide-gray-100">
                {visits.map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{formatDate(visit.visit_date)}</p>
                      <p className="text-xs text-gray-500">
                        {visit.visit_type === 'extra' ? 'Extra visit' : 'Regular visit'}
                        {visit.notes && ` — ${visit.notes}`}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-gray-900">${visit.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="p-4 bg-emerald-50 rounded-lg mb-5">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{visits.length} visit{visits.length !== 1 ? 's' : ''}</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600 mb-2">
                  <span>GST (10%)</span>
                  <span>${gst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-gray-900 pt-2 border-t border-emerald-200">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full px-4 py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {isGenerating ? 'Generating...' : 'Generate Invoice'}
              </button>
            </>
          ) : (
            <>
              {/* Invoice Preview */}
              <div className="mb-5 p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-gray-500">Invoice</p>
                    <p className="text-lg font-semibold text-gray-900">{generatedInvoice.invoice_number}</p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                    Draft
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Period</span>
                    <span className="text-gray-900">{formatDate(generatedInvoice.period_start)} — {formatDate(generatedInvoice.period_end)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Visits</span>
                    <span className="text-gray-900">{generatedInvoice.visit_count}</span>
                  </div>
                  {generatedInvoice.due_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Due</span>
                      <span className="text-gray-900">{formatDate(generatedInvoice.due_date)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="font-medium text-gray-900">Total</span>
                    <span className="font-semibold text-gray-900">${generatedInvoice.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSend}
                disabled={isSending}
                className="w-full px-4 py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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
