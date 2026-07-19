// ─────────────────────────────────────────────────────────────────────────────
// ClientSitesSection — "Locations" on the client detail page. One CRM client can
// have several sites (home / office / rental), each with its own address,
// optional site-specific email/phone (falling back to the client's main
// details), access instructions and notes. The default site mirrors the
// client's original address.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { MapPin, Plus, Pencil, Trash2, Star, Loader2, KeyRound, Mail, Phone } from 'lucide-react';
import Modal from './Modal';
import AddressAutocomplete from './AddressAutocomplete';
import { listClientSites, createClientSite, updateClientSite, deleteClientSite, setDefaultSite, type SiteInput } from '../lib/clientSites';
import type { ClientSite } from '../types/database';

interface Props {
  contactId: string;
  /** Called after any change so parents (e.g. quote modal) can refresh. */
  onChanged?: () => void;
}

function SiteModal({
  isOpen, onClose, contactId, site, onSaved,
}: { isOpen: boolean; onClose: () => void; contactId: string; site: ClientSite | null; onSaved: () => void }) {
  const [siteName, setSiteName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [access, setAccess] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSiteName(site?.site_name ?? '');
    setAddress(site?.address ?? '');
    setCoords(site?.latitude != null && site?.longitude != null ? { lat: site.latitude, lng: site.longitude } : null);
    setEmail(site?.contact_email ?? '');
    setPhone(site?.contact_phone ?? '');
    setAccess(site?.access_instructions ?? '');
    setNotes(site?.notes ?? '');
    setError('');
  }, [isOpen, site]);

  const save = async () => {
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('That email address doesn’t look right.');
      return;
    }
    setSaving(true); setError('');
    const input: SiteInput = {
      siteName,
      address,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      contactEmail: email,
      contactPhone: phone,
      accessInstructions: access,
      notes,
    };
    const r = site ? await updateClientSite(site.id, input) : await createClientSite(contactId, input);
    setSaving(false);
    if (r.ok) { onSaved(); onClose(); } else setError(r.error || 'Could not save the location.');
  };

  const input = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-secondary-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{site ? 'Edit location' : 'Add location'}</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Location name</label>
          <input type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)}
            placeholder="e.g. Home, Office, Warehouse, Rental" className={input} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
          <AddressAutocomplete
            value={address}
            onChange={(value, coordinates) => { setAddress(value); if (coordinates) setCoords(coordinates); }}
            placeholder="Site address"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact email <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Defaults to main email" className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Defaults to main phone" className={input} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Access instructions <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" value={access} onChange={(e) => setAccess(e.target.value)}
            placeholder="e.g. Gate code 1234, key in lockbox…" className={input} />
          <p className="mt-1 text-[11px] text-gray-400">Copied onto jobs at this site — where they’re PIN-protected like all access details.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything about this site…" className={input} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} {site ? 'Save changes' : 'Add location'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ClientSitesSection({ contactId, onChanged }: Props) {
  const [sites, setSites] = useState<ClientSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientSite | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSites(await listClientSites(contactId));
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };

  const makeDefault = async (site: ClientSite) => {
    setBusyId(site.id);
    await setDefaultSite(contactId, site.id);
    setBusyId(null);
    changed();
  };

  const remove = async (site: ClientSite) => {
    setBusyId(site.id);
    await deleteClientSite(site.id);
    setBusyId(null);
    changed();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Locations</h2>
          {sites.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{sites.length}</span>
          )}
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-4 h-4 text-secondary-600" /> Add location
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading locations…</div>
      ) : sites.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-8 text-center">
          <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No locations saved. Add their home, office or any site you work at.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {sites.map((s) => (
            <div key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{s.site_name}</span>
                    {s.is_default && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary-100 text-secondary-700">
                        <Star className="w-3 h-3" /> Default
                      </span>
                    )}
                    {s.access_instructions && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
                        <KeyRound className="w-3 h-3" /> Access notes
                      </span>
                    )}
                  </div>
                  {s.address && (
                    <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> <span className="truncate">{s.address}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap mt-0.5">
                    {s.contact_email && (
                      <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3 text-gray-400" /> {s.contact_email}</span>
                    )}
                    {s.contact_phone && (
                      <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3 text-gray-400" /> {s.contact_phone}</span>
                    )}
                  </div>
                  {s.notes && <p className="text-xs text-gray-400 mt-1">{s.notes}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!s.is_default && (
                    <button onClick={() => makeDefault(s)} disabled={busyId === s.id} aria-label={`Make ${s.site_name} the default`}
                      title="Make default"
                      className="p-2 text-gray-300 hover:text-secondary-600 rounded-lg transition-colors">
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => { setEditing(s); setModalOpen(true); }} aria-label={`Edit ${s.site_name}`}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  {sites.length > 1 && (
                    <button onClick={() => remove(s)} disabled={busyId === s.id} aria-label={`Delete ${s.site_name}`}
                      className="p-2 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
                      {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SiteModal isOpen={modalOpen} onClose={() => setModalOpen(false)} contactId={contactId} site={editing} onSaved={changed} />
    </div>
  );
}
