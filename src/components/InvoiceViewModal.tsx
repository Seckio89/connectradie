import { useState, useEffect, useRef } from 'react';
import { X, Printer, FileText, Download, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';

interface InvoiceData {
  id: string;
  business_name: string;
  business_abn: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  bill_to_name: string;
  bill_to_address: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  notes: string;
  status: string;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

interface InvoiceViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string | null;
  viewerRole?: 'tradie' | 'client';
}

export default function InvoiceViewModal({ isOpen, onClose, invoiceId, viewerRole }: InvoiceViewModalProps) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && invoiceId) {
      fetchInvoice();
    }
  }, [isOpen, invoiceId]);

  const fetchInvoice = async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .maybeSingle();

      if (invError) throw invError;
      setInvoice(inv as InvoiceData | null);

      const { data: items, error: itemsError } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true });

      if (itemsError) throw itemsError;
      setLineItems((items || []) as InvoiceLineItem[]);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoice?.invoice_number || ''}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              color: #26201E;
              padding: 40px;
              background: white;
            }
            .invoice-header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .invoice-header h1 { font-size: 32px; color: #6D9B8B; font-weight: 800; letter-spacing: -0.5px; }
            .company-name { font-size: 20px; font-weight: 700; color: #26201E; margin-bottom: 4px; }
            .company-details { font-size: 12px; color: #A08B86; line-height: 1.6; }
            .invoice-meta { text-align: right; }
            .invoice-meta .label { font-size: 11px; color: #8C7CA7; text-transform: uppercase; letter-spacing: 0.5px; }
            .invoice-meta .value { font-size: 14px; font-weight: 600; color: #26201E; margin-bottom: 8px; }
            .bill-to { margin-bottom: 32px; padding: 20px; background: #F5F0EF; border-radius: 8px; }
            .bill-to .label { font-size: 11px; color: #8C7CA7; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .bill-to .name { font-size: 16px; font-weight: 600; color: #26201E; }
            .bill-to .address { font-size: 13px; color: #A08B86; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            thead th {
              padding: 12px 16px;
              text-align: left;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #A08B86;
              border-bottom: 2px solid #EBE1DF;
              background: #F5F0EF;
            }
            thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
            tbody td {
              padding: 12px 16px;
              font-size: 14px;
              color: #5C4F4B;
              border-bottom: 1px solid #EBE1DF;
            }
            tbody td:nth-child(2), tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
            .totals { display: flex; justify-content: flex-end; }
            .totals-table { width: 280px; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
            .totals-row .label { color: #A08B86; }
            .totals-row .value { font-weight: 600; color: #26201E; }
            .totals-row.total { border-top: 2px solid #6D9B8B; padding-top: 12px; margin-top: 4px; }
            .totals-row.total .label { font-size: 16px; font-weight: 700; color: #26201E; }
            .totals-row.total .value { font-size: 20px; font-weight: 800; color: #6D9B8B; }
            .notes { margin-top: 32px; padding: 16px; background: #F5F0EF; border-radius: 8px; border-left: 3px solid #6D9B8B; }
            .notes .label { font-size: 11px; color: #8C7CA7; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .notes p { font-size: 13px; color: #A08B86; line-height: 1.6; white-space: pre-wrap; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current || pdfLoading) return;
    setPdfLoading(true);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm';

    const printContents = printRef.current.innerHTML;
    container.innerHTML = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #26201E; padding: 40px; background: white;">
        <style>
          .invoice-header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .invoice-header h1 { font-size: 32px; color: #6D9B8B; font-weight: 800; letter-spacing: -0.5px; }
          .company-name { font-size: 20px; font-weight: 700; color: #26201E; margin-bottom: 4px; }
          .company-details { font-size: 12px; color: #A08B86; line-height: 1.6; }
          .invoice-meta { text-align: right; }
          .invoice-meta .label { font-size: 11px; color: #8C7CA7; text-transform: uppercase; letter-spacing: 0.5px; }
          .invoice-meta .value { font-size: 14px; font-weight: 600; color: #26201E; margin-bottom: 8px; }
          .bill-to { margin-bottom: 32px; padding: 20px; background: #F5F0EF; border-radius: 8px; }
          .bill-to .label { font-size: 11px; color: #8C7CA7; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .bill-to .name { font-size: 16px; font-weight: 600; color: #26201E; }
          .bill-to .address { font-size: 13px; color: #A08B86; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          thead th {
            padding: 12px 16px;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #A08B86;
            border-bottom: 2px solid #EBE1DF;
            background: #F5F0EF;
          }
          thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
          tbody td {
            padding: 12px 16px;
            font-size: 14px;
            color: #5C4F4B;
            border-bottom: 1px solid #EBE1DF;
          }
          tbody td:nth-child(2), tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
          .totals { display: flex; justify-content: flex-end; }
          .totals-table { width: 280px; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
          .totals-row .label { color: #A08B86; }
          .totals-row .value { font-weight: 600; color: #26201E; }
          .totals-row.total { border-top: 2px solid #6D9B8B; padding-top: 12px; margin-top: 4px; }
          .totals-row.total .label { font-size: 16px; font-weight: 700; color: #26201E; }
          .totals-row.total .value { font-size: 20px; font-weight: 800; color: #6D9B8B; }
          .notes { margin-top: 32px; padding: 16px; background: #F5F0EF; border-radius: 8px; border-left: 3px solid #6D9B8B; }
          .notes .label { font-size: 11px; color: #8C7CA7; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .notes p { font-size: 13px; color: #A08B86; line-height: 1.6; white-space: pre-wrap; }
        </style>
        ${printContents}
      </div>
    `;

    document.body.appendChild(container);

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `Invoice-${invoice?.invoice_number || 'draft'}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container)
        .save();
    } finally {
      document.body.removeChild(container);
      setPdfLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="3xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-secondary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Invoice</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="flex items-center gap-2 px-4 py-2 border border-secondary-600 text-secondary-600 rounded-lg hover:bg-secondary-50 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {pdfLoading ? 'Generating...' : 'Download PDF'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invoice ? (
          <div ref={printRef} className="bg-white">
            <div className="invoice-header flex justify-between items-start mb-8">
              <div>
                <h1 className="text-3xl font-extrabold text-secondary-600 tracking-tight mb-6">
                  INVOICE
                </h1>
                <div className="company-name text-lg font-bold text-gray-900">
                  {invoice.business_name}
                </div>
                <div className="company-details text-xs text-gray-500 leading-relaxed">
                  {invoice.business_abn && <div>ABN: {invoice.business_abn}</div>}
                  {invoice.business_address && <div>{invoice.business_address}</div>}
                  {invoice.business_phone && <div>{invoice.business_phone}</div>}
                  {invoice.business_email && <div>{invoice.business_email}</div>}
                </div>
              </div>
              <div className="invoice-meta text-right space-y-2">
                <div>
                  <div className="label text-xs text-gray-400 uppercase tracking-wider">
                    Invoice No.
                  </div>
                  <div className="value text-sm font-semibold text-gray-900">
                    {invoice.invoice_number}
                  </div>
                </div>
                <div>
                  <div className="label text-xs text-gray-400 uppercase tracking-wider">
                    Date
                  </div>
                  <div className="value text-sm font-semibold text-gray-900">
                    {formatDate(invoice.invoice_date)}
                  </div>
                </div>
                {invoice.due_date && (
                  <div>
                    <div className="label text-xs text-gray-400 uppercase tracking-wider">
                      Due Date
                    </div>
                    <div className="value text-sm font-semibold text-gray-900">
                      {formatDate(invoice.due_date)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(invoice.bill_to_name || invoice.bill_to_address) && (
              <div className="bill-to mb-8 p-4 bg-gray-50 rounded-xl">
                <div className="label text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Bill To
                </div>
                {invoice.bill_to_name && (
                  <div className="name text-base font-semibold text-gray-900">
                    {invoice.bill_to_name}
                  </div>
                )}
                {invoice.bill_to_address && (
                  <div className="address text-sm text-gray-600">{invoice.bill_to_address}</div>
                )}
              </div>
            )}

            <table className="w-full mb-6">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-sm text-gray-700">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                      {Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">
                      ${Number(item.unit_price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      ${Number(item.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals flex justify-end mb-6">
              <div className="totals-table w-72 space-y-1">
                <div className="totals-row flex justify-between py-1.5 text-sm">
                  <span className="label text-gray-600">Subtotal</span>
                  <span className="value font-semibold text-gray-900">
                    ${Number(invoice.subtotal).toFixed(2)}
                  </span>
                </div>
                {Number(invoice.gst_amount) > 0 && (
                  <div className="totals-row flex justify-between py-1.5 text-sm">
                    <span className="label text-gray-600">GST (10%)</span>
                    <span className="value font-semibold text-gray-900">
                      ${Number(invoice.gst_amount).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="totals-row total flex justify-between pt-3 mt-1 border-t-2 border-secondary-500">
                  <span className="label text-lg font-bold text-gray-900">Total</span>
                  <span className="value text-xl font-extrabold text-secondary-600">
                    ${Number(invoice.total_amount).toFixed(2)}
                  </span>
                </div>
                {viewerRole === 'tradie' && (
                  <>
                    <div className="totals-row flex justify-between py-1.5 text-sm mt-2">
                      <span className="label text-green-700 font-medium">Your Payout</span>
                      <span className="value font-semibold text-green-700">
                        ${Number(invoice.total_amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                        100% Payout
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {invoice.notes && (
              <div className="notes p-4 bg-gray-50 rounded-xl border-l-3 border-secondary-500">
                <div className="label text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Notes
                </div>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {invoice.notes}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-600">Invoice not found</div>
        )}
      </div>
    </Modal>
  );
}
