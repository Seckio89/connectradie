// ─────────────────────────────────────────────────────────────────────────────
// ClientContactModal — add / edit a tradie's CRM client contact (on- or off-app).
// Captures name, email, phone, a geocoded address (for service-area + geofencing)
// and notes. Coordinates come from Google Places when an address is picked.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Loader2, User, Mail, Phone, StickyNote, Landmark, CreditCard } from 'lucide-react';
import Modal from './Modal';
import AddressAutocomplete from './AddressAutocomplete';
import { supabase } from '../lib/supabase';
import type { ClientContact } from '../types/database';

interface ClientContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  ownerId: string;
  editContact: ClientContact | null;
}

export default function ClientContactModal({
  isOpen, onClose, onSaved, ownerId, editContact,
}: ClientContactModalProps) {
  const [fullName, setFullName] = useState(editContact?.full_name ?? '');
  const [email, setEmail] = useState(editContact?.email ?? '');
  const [phone, setPhone] = useState(editContact?.phone ?? '');
  const [address, setAddress] = useState(editContact?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    editContact?.latitude != null && editContact?.longitude != null
      ? { lat: editContact.latitude, lng: editContact.longitude }
      : null,
  );
  const [details, setDetails] = useState<{ suburb?: string; postcode?: string; state?: string }>({
    suburb: editContact?.suburb ?? undefined,
    postcode: editContact?.postcode ?? undefined,
    state: editContact?.state ?? undefined,
  });
  const [notes, setNotes] = useState(editContact?.notes ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'external'>(
    editContact?.payment_method ?? 'external',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError('Please enter the client’s name.');
      return;
    }
    // Catch typos like "admi @domain.com" before they're saved — a bad address
    // means quotes and invoices silently never reach the client.
    const emailTrimmed = email.trim();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setError('That email address doesn’t look right — check for typos or spaces.');
      return;
    }
    setSaving(true);
    setError('');

    const row = {
      owner_id: ownerId,
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      suburb: details.suburb ?? null,
      state: details.state ?? null,
      postcode: details.postcode ?? null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      notes: notes.trim() || null,
      payment_method: paymentMethod,
    };

    try {
      let saveError;
      if (editContact) {
        ({ error: saveError } = await supabase
          .from('client_contacts')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', editContact.id));
      } else {
        ({ error: saveError } = await supabase.from('client_contacts').insert(row));
      }

      if (saveError) {
        setError(
          saveError.code === '23505'
            ? 'You already have a client with that email.'
            : 'Could not save this client. Please try again.',
        );
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Could not save this client. Please try again.');
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {editContact ? 'Edit client' : 'Add a client'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Save a client’s details to quote them and assign workers — they don’t need an account.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Thompson"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="04xx xxx xxx"
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
            <AddressAutocomplete
              value={address}
              onChange={(value, coordinates, addressDetails) => {
                setAddress(value);
                setCoords(coordinates ?? null);
                if (addressDetails) {
                  setDetails({
                    suburb: addressDetails.suburb,
                    postcode: addressDetails.postcode,
                    state: addressDetails.state,
                  });
                }
              }}
              placeholder="Client’s address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <div className="relative">
              <StickyNote className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Gate code, pets, preferences…"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">How does this client pay?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                {
                  value: 'external' as const,
                  icon: Landmark,
                  title: 'Bank transfer / cash',
                  desc: 'You invoice them and mark it paid yourself.',
                },
                {
                  value: 'stripe' as const,
                  icon: CreditCard,
                  title: 'Card pay link',
                  desc: 'They pay by card through the app.',
                },
              ]).map(({ value, icon: Icon, title, desc }) => {
                const active = paymentMethod === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethod(value)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? 'border-warm-500 bg-warm-50 ring-1 ring-warm-500'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${active ? 'text-warm-600' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${active ? 'text-warm-700' : 'text-gray-700'}`}>{title}</span>
                    </span>
                    <span className="block mt-1 text-xs text-gray-500">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-warm-500 text-white rounded-xl font-medium hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editContact ? 'Save changes' : 'Add client'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
