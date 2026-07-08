// ─────────────────────────────────────────────────────────────────────────────
// Clients — a tradie's CRM address book. Add on- or off-app clients, then quote
// them and assign workers. Off-app clients need no ConnecTradie account.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react';
import { Users, Plus, Mail, Phone, MapPin, Pencil, Trash2, Search, UserCheck, Loader2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import ClientContactModal from '../components/ClientContactModal';
import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import type { ClientContact } from '../types/database';

export default function Clients() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<ClientContact | null>(null);
  const [toDelete, setToDelete] = useState<ClientContact | null>(null);

  const fetchContacts = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('owner_id', user.id)
      .order('full_name');
    setContacts((data as ClientContact[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.full_name, c.email, c.phone, c.address, c.suburb]
        .some((f) => f?.toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  const handleDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    const { error } = await supabase.from('client_contacts').delete().eq('id', target.id);
    if (error) {
      showToast('Could not remove client. Please try again.', true);
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== target.id));
    showToast(`${target.full_name} removed`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Clients</h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">
              Your client address book — quote them and assign workers, no account needed on their end.
            </p>
          </div>
          <button
            onClick={() => { setEditContact(null); setShowModal(true); }}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 transition-colors text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Client</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {contacts.length > 0 && (
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading clients…</span>
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your existing clients to quote them and assign workers. They don’t need a ConnecTradie account."
            actionLabel="Add your first client"
            onAction={() => { setEditContact(null); setShowModal(true); }}
          />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">No clients match “{search}”.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((c) => (
              <div key={c.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 group">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-secondary-100 to-secondary-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-secondary-800">
                      {c.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{c.full_name}</span>
                      {c.linked_profile_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <UserCheck className="w-3 h-3" />
                          On app
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {c.email && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-600 truncate">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" /> {c.email}
                        </p>
                      )}
                      {c.phone && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" /> {c.phone}
                        </p>
                      )}
                      {c.address && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {c.address}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditContact(c); setShowModal(true); }}
                      className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setToDelete(c)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {c.notes && (
                  <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{c.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && user && (
        <ClientContactModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditContact(null); }}
          onSaved={fetchContacts}
          ownerId={user.id}
          editContact={editContact}
        />
      )}

      {toDelete && (
        <ConfirmModal
          type="danger"
          title="Remove client"
          message={`Remove ${toDelete.full_name} from your clients? This won’t affect any jobs already created.`}
          confirmText="Remove"
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </DashboardLayout>
  );
}
