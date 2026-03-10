import { useState, useEffect } from 'react';
import { X, Plus, Trash2, FileText, Calculator } from 'lucide-react';
import Modal from './Modal';
import AddressAutocomplete from './AddressAutocomplete';
import { supabase } from '../lib/supabase';

interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
}

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId?: string;
  milestoneId?: string;
  milestoneSubcontractorId?: string;
  prefillBusinessName?: string;
  onInvoiceCreated: (invoice: {
    id: string;
    business_name: string;
    invoice_number: string;
    total_amount: number;
  }) => void;
}

export default function CreateInvoiceModal({
  isOpen,
  onClose,
  jobId,
  milestoneId,
  milestoneSubcontractorId,
  prefillBusinessName,
  onInvoiceCreated,
}: CreateInvoiceModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [businessAbn, setBusinessAbn] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [billToName, setBillToName] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [includeGst, setIncludeGst] = useState(true);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: '1', unit_price: '' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (prefillBusinessName) setBusinessName(prefillBusinessName);
      loadTradieDetails();
    }
  }, [isOpen, prefillBusinessName]);

  const loadTradieDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, address, email')
        .eq('id', user.id)
        .maybeSingle();

      const { data: tradieDetails } = await supabase
        .from('tradie_details')
        .select('business_name, abn')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (tradieDetails?.business_name && !businessName && !prefillBusinessName) {
        setBusinessName(tradieDetails.business_name);
      }
      if (tradieDetails?.abn && !businessAbn) setBusinessAbn(tradieDetails.abn);
      if (profile?.phone && !businessPhone) setBusinessPhone(profile.phone);
      if (profile?.address && !businessAddress) setBusinessAddress(profile.address);
      if (profile?.email && !businessEmail) setBusinessEmail(profile.email);

      if (jobId) {
        const { data: jobData } = await supabase
          .from('jobs')
          .select('client_id, contact_name, location_address')
          .eq('id', jobId)
          .maybeSingle();

        if (jobData) {
          if (jobData.contact_name && !billToName) setBillToName(jobData.contact_name);
          if (jobData.location_address && !billToAddress) setBillToAddress(jobData.location_address);

          if (!billToName && jobData.client_id) {
            const { data: clientProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', jobData.client_id)
              .maybeSingle();
            if (clientProfile?.full_name) setBillToName(clientProfile.full_name);
          }
        }
      }
    } catch {
      // no-op
    }
  };

  const calculateSubtotal = () => {
    return lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      return sum + qty * price;
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const gstAmount = includeGst ? subtotal * 0.1 : 0;
  const totalAmount = subtotal + gstAmount;

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: '1', unit_price: '' }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!businessName.trim()) {
      alert('Please enter a business name');
      return;
    }
    if (!invoiceNumber.trim()) {
      alert('Please enter an invoice number');
      return;
    }

    const validItems = lineItems.filter(
      (item) => item.description.trim() && parseFloat(item.unit_price) > 0
    );
    if (validItems.length === 0) {
      alert('Please add at least one line item with a description and price');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          created_by: user.id,
          job_id: jobId || null,
          milestone_id: milestoneId || null,
          milestone_subcontractor_id: milestoneSubcontractorId || null,
          business_name: businessName.trim(),
          business_abn: businessAbn.trim(),
          business_address: businessAddress.trim(),
          business_phone: businessPhone.trim(),
          business_email: businessEmail.trim(),
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          bill_to_name: billToName.trim(),
          bill_to_address: billToAddress.trim(),
          subtotal,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          notes: notes.trim(),
          status: 'sent',
        })
        .select('id')
        .single();

      if (invoiceError) throw invoiceError;

      const lineItemInserts = validItems.map((item, idx) => ({
        invoice_id: invoice.id,
        description: item.description.trim(),
        quantity: parseFloat(item.quantity) || 1,
        unit_price: parseFloat(item.unit_price) || 0,
        amount: (parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0),
        sort_order: idx,
      }));

      const { error: lineError } = await supabase
        .from('invoice_line_items')
        .insert(lineItemInserts);

      if (lineError) throw lineError;

      onInvoiceCreated({
        id: invoice.id,
        business_name: businessName.trim(),
        invoice_number: invoiceNumber.trim(),
        total_amount: totalAmount,
      });

      resetForm();
      onClose();
    } catch {
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setBusinessName('');
    setBusinessAbn('');
    setBusinessAddress('');
    setBusinessPhone('');
    setBusinessEmail('');
    setInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setBillToName('');
    setBillToAddress('');
    setNotes('');
    setIncludeGst(true);
    setLineItems([{ description: '', quantity: '1', unit_price: '' }]);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { resetForm(); onClose(); }} maxWidth="3xl" closeOnBackdrop={false}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Create Invoice</h2>
              <p className="text-sm text-gray-600">Fill in the details below</p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                From (Your Details)
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g., Smith Electrical Pty Ltd"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ABN</label>
                <input
                  type="text"
                  value={businessAbn}
                  onChange={(e) => setBusinessAbn(e.target.value)}
                  placeholder="e.g., 12 345 678 901"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <AddressAutocomplete
                  value={businessAddress}
                  onChange={(value) => setBusinessAddress(value)}
                  placeholder="Business address"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="text"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
                Bill To
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={billToName}
                  onChange={(e) => setBillToName(e.target.value)}
                  placeholder="Client name"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <AddressAutocomplete
                  value={billToAddress}
                  onChange={(value) => setBillToAddress(value)}
                  placeholder="Billing address"
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
              Invoice Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number *
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g., INV-001"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Line Items
              </h3>
              <button
                type="button"
                onClick={addLineItem}
                className="text-xs font-medium text-secondary-600 hover:text-secondary-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-0 bg-gray-50 border-b border-gray-200">
                <div className="px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Description
                </div>
                <div className="px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide text-center">
                  Qty
                </div>
                <div className="px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">
                  Unit Price
                </div>
                <div className="px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">
                  Amount
                </div>
                <div />
              </div>

              {lineItems.map((item, idx) => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                const lineTotal = qty * price;

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-0 border-b border-gray-100 last:border-b-0 items-center"
                  >
                    <div className="px-2 py-1.5">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                        placeholder="Item description"
                        className="w-full px-2 py-1.5 border-0 bg-transparent text-sm focus:ring-0 focus:outline-none"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                        className="w-full px-2 py-1.5 border-0 bg-transparent text-sm text-center focus:ring-0 focus:outline-none"
                      />
                    </div>
                    <div className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(idx, 'unit_price', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 border-0 bg-transparent text-sm text-right focus:ring-0 focus:outline-none"
                      />
                    </div>
                    <div className="px-3 py-1.5 text-sm text-right font-medium text-gray-700">
                      ${lineTotal.toFixed(2)}
                    </div>
                    <div className="px-1 py-1.5 flex justify-center">
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeGst}
                      onChange={(e) => setIncludeGst(e.target.checked)}
                      className="rounded border-gray-300 text-secondary-600 focus:ring-secondary-500"
                    />
                    GST (10%)
                  </label>
                  <span className="font-medium text-gray-900">${gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base pt-2 border-t border-gray-300">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900 text-lg">${totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes, payment terms, bank details..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-transparent text-sm resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-secondary-600 text-white rounded-xl hover:bg-secondary-700 disabled:bg-gray-400 font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Calculator className="w-4 h-4" />
              {saving ? 'Creating...' : 'Create Invoice'}
            </button>
            <button
              onClick={() => { resetForm(); onClose(); }}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
