import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, User, Clock, MapPin, Loader2, Pause, AlertTriangle, X, Briefcase, MoreVertical, Plus, CheckCircle2, CheckCheck, FileText as FileTextIcon, Handshake, ChevronDown, RotateCcw, MessageCircle, Building2, Send, Package, Trash2, CreditCard, Camera, Eye } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { TRADE_OPTIONS, getSupplySuggestions, SUPPLY_DEFAULT_UNITS } from '../lib/tradeCategories';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getRecurringJobs,
  getUpcomingSessions,
  pauseRecurringJob,
  cancelRecurringJob,
  createRecurringJob,
  requestQuoteForRecurringJob,
  suggestRecurringJob,
  getKeywordSuggestions,
  RECURRING_SERVICE_SUBCATEGORIES,
  RECURRING_SERVICE_DESCRIPTIONS,
} from '../lib/recurringJobs';
import type { RecurringJob, RecurringSession, KeywordSuggestion, CancellationCategory } from '../lib/recurringJobs';
import CancelServiceModal from './CancelServiceModal';
import { getActiveAgreements } from '../lib/ongoingServices';
import type { ServiceAgreement, SupplyItem } from '../types/database';
import RecurringSessionCard from './RecurringSessionCard';
import RecurringInvoiceCard from './RecurringInvoiceCard';
import type { RecurringInvoice } from './RecurringInvoiceCard';
import AddressAutocomplete from './AddressAutocomplete';
import BecsSetupForm from './BecsSetupForm';
import SavedPaymentMethod from './SavedPaymentMethod';
import { useToast } from '../hooks/useToast';
import { callEdgeFunction } from '../lib/edgeFn';
import { acceptAndPay } from '../lib/stripePayments';
import { notifyTradiesForNewLead } from '../lib/notifications';
import type { Job } from '../types/database';

interface ActiveOneOffJob {
  id: string;
  title: string;
  description: string;
  status: string;
  location_address: string | null;
  budget_amount: number | null;
  created_at: string;
  tradie?: { full_name: string } | null;
}

const TRADE_TO_PROFESSION: Record<string, string> = {
  cleaning: 'Cleaner', cleaner: 'Cleaner',
  plumbing: 'Plumber', plumber: 'Plumber',
  electrician: 'Electrician', electrical: 'Electrician',
  builder: 'Builder', building: 'Builder',
  painter: 'Painter', painting: 'Painter',
  landscaper: 'Landscaper', landscaping: 'Landscaper', gardener: 'Landscaper', gardening: 'Landscaper',
  carpenter: 'Carpenter', carpentry: 'Carpenter',
  roofer: 'Roofer', roofing: 'Roofer',
  concreter: 'Concreter', concreting: 'Concreter',
  bricklayer: 'Bricklayer', bricklaying: 'Bricklayer',
  fencer: 'Fencer', fencing: 'Fencer',
  tiler: 'Tiler', tiling: 'Tiler',
  locksmith: 'Locksmith',
  hvac: 'HVAC', 'air conditioning': 'HVAC',
  'pest control': 'Pest Control', pest: 'Pest Control',
};

function tradeProfession(category: string): string {
  const lower = category.toLowerCase().replace(/_/g, ' ');
  if (TRADE_TO_PROFESSION[lower]) return TRADE_TO_PROFESSION[lower];
  for (const [key, value] of Object.entries(TRADE_TO_PROFESSION)) {
    if (lower.includes(key)) return value;
  }
  // Fallback: capitalize as-is
  return lower.replace(/\b\w/g, c => c.toUpperCase());
}

const HOLD_REASONS = [
  'Going on holiday',
  'Budget reasons',
  'Seasonal — not needed right now',
  'Trying a different provider',
  'Other',
];

// ── Quick inline chat for messaging a tradie from service card ──

// ── Client supplies management — add/edit/remove supply items ──
function ClientSuppliesManager({ jobId, supplies, tradeCategory, onUpdate }: { jobId: string; supplies: SupplyItem[]; tradeCategory?: string; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<SupplyItem[]>(supplies);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // Sync items when supplies prop changes (e.g. tradie updated stock)
  useEffect(() => {
    if (!editing) setItems(supplies);
  }, [supplies, editing]);

  // New item form
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newProvidedBy, setNewProvidedBy] = useState<'tradie' | 'client'>('tradie');
  const [newStock, setNewStock] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const suggestions = getSupplySuggestions(tradeCategory || '');
  const availableSuggestions = suggestions.filter(s => !items.some(item => item.name.toLowerCase() === s.toLowerCase()));

  const handleAddItem = () => {
    if (!newName.trim()) return;
    const item: SupplyItem = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      unit: newUnit.trim() || undefined,
      provided_by: newProvidedBy,
      stock_level: newStock && !isNaN(Number(newStock)) ? Number(newStock) : null,
      restock_threshold: newThreshold && !isNaN(Number(newThreshold)) ? Number(newThreshold) : null,
      restock_notified_at: null,
      notes: newNotes.trim() || undefined,
    };
    setItems(prev => [...prev, item]);
    setNewName(''); setNewUnit(''); setNewStock(''); setNewThreshold(''); setNewNotes('');
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(s => s.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('recurring_jobs').update({ supplies: items }).eq('id', jobId);
      showToast('Supplies updated');
      setEditing(false);
      onUpdate();
    } catch {
      showToast('Failed to save supplies', true);
    } finally {
      setSaving(false);
    }
  };

  const lowStockItems = items.filter(s =>
    s.stock_level != null && s.restock_threshold != null && s.stock_level <= s.restock_threshold
  );

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide inline-flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-gray-400" />
          Supplies ({items.length})
          {lowStockItems.length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold normal-case">
              {lowStockItems.length} low stock
            </span>
          )}
        </p>
        <button
          onClick={() => { setEditing(!editing); setItems(supplies); }}
          className="text-xs text-secondary-600 hover:text-secondary-700 font-medium"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Read-only list */}
      {!editing && items.length > 0 && (
        <div className="space-y-1">
          {items.map(item => {
            const isLow = item.stock_level != null && item.restock_threshold != null && item.stock_level <= item.restock_threshold;
            return (
              <div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isLow ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <span className="font-medium text-gray-800 flex-1">{item.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  item.provided_by === 'tradie' ? 'bg-secondary-50 text-secondary-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {item.provided_by === 'tradie' ? 'Tradie supplies' : 'You supply'}
                </span>
                {item.stock_level != null && (
                  <span className={`text-xs font-semibold ${isLow ? 'text-amber-700' : 'text-gray-600'}`}>
                    {item.stock_level} {item.unit || ''}
                  </span>
                )}
                {isLow && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      )}

      {!editing && items.length === 0 && (
        <p className="text-xs text-gray-400">No supplies listed. Click Edit to add items your tradie needs to bring.</p>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-3 mt-2">
          {/* Existing items */}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs font-medium text-gray-800 flex-1">{item.name}</span>
              {item.stock_level != null && (
                <span className="text-xs text-gray-500">{item.stock_level} {item.unit || ''}</span>
              )}
              <span className="text-[10px] text-gray-400">{item.provided_by}</span>
              <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Add new item form */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1">Item Name</label>
                <select
                  value={availableSuggestions.slice(0, 5).includes(newName) ? newName : newName === '' ? '' : '__other__'}
                  onChange={e => {
                    if (e.target.value === '__other__') {
                      setNewName('');
                      setNewUnit('');
                      setTimeout(() => {
                        const el = document.getElementById(`client-custom-supply-${jobId}`);
                        if (el) el.focus();
                      }, 50);
                    } else {
                      setNewName(e.target.value);
                      setNewUnit(SUPPLY_DEFAULT_UNITS[e.target.value] || '');
                    }
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">Select an item...</option>
                  {availableSuggestions.slice(0, 5).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="__other__">Other (type your own)</option>
                </select>
                {!availableSuggestions.slice(0, 5).includes(newName) && (
                  <input
                    id={`client-custom-supply-${jobId}`}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Enter item name..."
                    className="w-full mt-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                )}
              </div>
              <div>
                <label className="block text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1">Unit</label>
                <input
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  placeholder="rolls, bottles, packs..."
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1">Supplied By</label>
                <select
                  value={newProvidedBy}
                  onChange={e => setNewProvidedBy(e.target.value as 'tradie' | 'client')}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="tradie">Tradie supplies</option>
                  <option value="client">I supply</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1">Stock Qty</label>
                <input
                  type="number"
                  value={newStock}
                  onChange={e => setNewStock(e.target.value)}
                  placeholder="e.g. 10"
                  min="0"
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1">Alert When ≤</label>
                <input
                  type="number"
                  value={newThreshold}
                  onChange={e => setNewThreshold(e.target.value)}
                  placeholder="e.g. 3"
                  min="0"
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1">Notes</label>
              <input
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Brand, size, where to find it..."
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleAddItem}
              disabled={!newName.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Item
            </button>
          </div>

          {/* Save */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Save Supplies
            </button>
            <button onClick={() => { setEditing(false); setItems(supplies); }} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickChat({ tradieId, tradieName, userId, recurringJobId }: { tradieId: string; tradieName: string; userId: string; recurringJobId: string }) {
  const [messages, setMessages] = useState<{ id: string; content: string; sender_id: string; created_at: string; read_at: string | null }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      try {
        // Find conversation scoped to this specific recurring job
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('recurring_job_id', recurringJobId)
          .maybeSingle();

        if (cancelled) return;

        if (conv) {
          setConversationId(conv.id);
          const { data: msgs } = await supabase
            .from('messages')
            .select('id, content, sender_id, created_at, read_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(20);
          if (!cancelled && msgs) setMessages(msgs.reverse());
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [userId, tradieId, recurringJobId]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const { data: conv } = await supabase
          .from('conversations')
          .insert({ created_by: userId, title: `Chat with ${tradieName}`, recurring_job_id: recurringJobId })
          .select()
          .single();
        if (!conv) throw new Error('Failed to create conversation');
        await supabase.from('conversation_participants').insert([
          { conversation_id: conv.id, user_id: userId },
          { conversation_id: conv.id, user_id: tradieId },
        ]);
        convId = conv.id;
        setConversationId(convId);
      }
      const { data: msg } = await supabase
        .from('messages')
        .insert({ conversation_id: convId, sender_id: userId, receiver_id: tradieId, content: newMessage.trim() })
        .select('id, content, sender_id, created_at, read_at')
        .single();
      if (msg) setMessages(prev => [...prev, msg]);
      setNewMessage('');
    } catch { /* ignore */ }
    setSending(false);
  };

  return (
    <div className="border-t border-gray-100">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Chat with {tradieName}</span>
          {conversationId && (
            <button
              onClick={() => navigate(`/messages?conversation=${conversationId}`)}
              className="text-xs text-secondary-500 hover:text-secondary-700 font-medium"
            >
              Open full chat
            </button>
          )}
        </div>
        <div ref={chatContainerRef} className="bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto p-3 space-y-2 mb-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No messages yet. Start the conversation!</p>
          ) : (
            messages.map(msg => {
              const isOwn = msg.sender_id === userId;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-1.5 rounded-lg text-xs ${
                    isOwn
                      ? 'bg-secondary-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-700'
                  }`}>
                    {msg.content}
                    {isOwn && (
                      <div className="flex justify-end mt-0.5">
                        <CheckCheck
                          className={`w-3 h-3 ${msg.read_at ? 'text-emerald-300' : 'text-secondary-200'}`}
                          aria-label={msg.read_at ? 'Seen' : 'Sent'}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="px-3 py-2 bg-secondary-500 text-white rounded-lg hover:bg-secondary-600 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline Schedule Service Form ──────────────────────────────

function InlineScheduleForm({ userId, onDone, onCancel, prefill }: {
  userId: string;
  onDone: () => void;
  onCancel: () => void;
  prefill?: { category?: string; subtype?: string; description?: string; location?: string; frequency?: number; budget?: string };
}) {
  const [category, setCategory] = useState(prefill?.category || '');
  const [serviceSubtype, setServiceSubtype] = useState(prefill?.subtype || '');
  const [customSubtype, setCustomSubtype] = useState('');
  const [description, setDescription] = useState(prefill?.description || '');
  const [location, setLocation] = useState(prefill?.location || '');
  const [budget, setBudget] = useState(prefill?.budget || '');
  const [budgetType, setBudgetType] = useState<'quote' | 'set'>(prefill?.budget ? 'set' : 'quote');
  const [frequency, setFrequency] = useState(prefill?.frequency || 12);
  const [preferredTime, setPreferredTime] = useState('');
  const [nextDate, setNextDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }));
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState<KeywordSuggestion[]>([]);
  const [success, setSuccess] = useState(false);
  const [allowsSiteInspection, setAllowsSiteInspection] = useState(true);
  // 'client' (default) = client keeps consumables stocked themselves.
  // 'tradie_billed'    = tradie picks them up and adds to the next invoice.
  // Tradie's own working equipment (vacuum, mop, chemicals) is always implicit.
  const [consumablesProvider, setConsumablesProvider] = useState<'client' | 'tradie_billed'>('client');
  const [selectedSupplies, setSelectedSupplies] = useState<string[]>([]);
  const [customSupplyName, setCustomSupplyName] = useState('');
  const [selectedTradieId, setSelectedTradieId] = useState('');
  const [savedTradies, setSavedTradies] = useState<{ id: string; full_name: string; trade_category: string | null }[]>([]);

  const tradeKeys = Object.keys(RECURRING_SERVICE_SUBCATEGORIES);
  const subcategories = category ? (RECURRING_SERVICE_SUBCATEGORIES[category] ?? null) : null;
  const hasSubcategories = subcategories !== null && subcategories.length > 0;
  const suggestion = category ? suggestRecurringJob(category) : null;
  const resolvedSubtype = hasSubcategories ? serviceSubtype : customSubtype.trim();

  useEffect(() => {
    if (suggestion) setFrequency(suggestion.frequencyMonths);
    setServiceSubtype('');
    setCustomSubtype('');
    setDescription('');
  }, [category]);

  useEffect(() => {
    if (serviceSubtype && RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype]) {
      setDescription(RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype]);
    } else if (serviceSubtype) {
      setDescription('');
    }
  }, [serviceSubtype]);

  useEffect(() => {
    if (!serviceSubtype) { setKeywords([]); return; }
    let cancelled = false;
    getKeywordSuggestions(serviceSubtype).then(r => { if (!cancelled) setKeywords(r); });
    return () => { cancelled = true; };
  }, [serviceSubtype]);

  // Fetch saved tradies for preferred tradie selector
  useEffect(() => {
    const fetchSavedTradies = async () => {
      const { data: saves } = await supabase
        .from('my_trades')
        .select('tradie_id')
        .eq('client_id', userId);
      if (!saves || saves.length === 0) return;
      const tradieIds = saves.map(s => s.tradie_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', tradieIds);
      const { data: details } = await supabase
        .from('tradie_details')
        .select('profile_id, trade_category')
        .in('profile_id', tradieIds);
      const detailsMap = new Map((details || []).map(d => [d.profile_id, d.trade_category]));
      setSavedTradies((profiles || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Tradie',
        trade_category: detailsMap.get(p.id) || null,
      })));
    };
    fetchSavedTradies();
  }, [userId]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      if (photos.length >= 5) break;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos((prev) => (prev.length >= 5 ? prev : [...prev, { file, preview: ev.target?.result as string }]));
      };
      reader.readAsDataURL(file);
    }
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!category || !description.trim()) return;
    if (hasSubcategories && !serviceSubtype) return;
    if (!hasSubcategories && !customSubtype.trim()) return;
    setSaving(true);
    try {
      const serviceLabel = resolvedSubtype || category.replace(/_/g, ' ');

      // 1. Create a job record so it enters the quote pipeline (same as one-off)
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .insert({
          client_id: userId,
          title: serviceLabel,
          description: `[${tradeProfession(category)}] ${description.trim()}`,
          status: 'pending',
          location_address: location.trim() || null,
          budget_type: budget ? 'fixed_budget' : 'request_quote',
          budget_amount: budget ? Number(budget) : null,
          is_emergency: false,
          priority: 'normal',
          max_quotes: 3,
          scheduled_date: nextDate,
          preferred_time_slot: preferredTime || null,
          parking_available: parkingAvailable,
          allows_site_inspection: allowsSiteInspection,
        })
        .select('id, description, location_address, client_id')
        .single();

      if (jobErr) throw new Error(jobErr.message);

      // Upload any photos to the job-attachments bucket and link them to the job.
      if (photos.length > 0) {
        // Store the in-bucket path, not a public URL — keeps things working
        // when the bucket is private and signed URLs become required.
        const uploadResults = await Promise.all(
          photos.map(async (photo, i) => {
            const ext = photo.file.name.split('.').pop() || 'jpg';
            const filePath = `${userId}/${job.id}-${i}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('job-attachments')
              .upload(filePath, photo.file, { cacheControl: '3600', upsert: false });
            if (upErr) return null;
            return filePath;
          }),
        );
        const imageUrls = uploadResults.filter((u): u is string => u !== null);
        if (imageUrls.length > 0) {
          await supabase.from('jobs').update({ images_url: imageUrls }).eq('id', job.id);
        }
      }

      // 2. Build initial supplies list from selection. Only meaningful when the
      // tradie is the one buying (otherwise the list is just informational for
      // the client themselves, which we don't need to persist server-side yet).
      const initialSupplies: SupplyItem[] = consumablesProvider === 'tradie_billed'
        ? selectedSupplies.map(name => ({
            id: crypto.randomUUID(),
            name,
            provided_by: 'tradie' as const,
            stock_level: null,
            restock_threshold: null,
            restock_notified_at: null,
          }))
        : [];

      // 3. Create the recurring job linked to the job record
      await createRecurringJob({
        client_id: userId,
        tradie_id: selectedTradieId || null,
        trade_category: category,
        service_subtype: resolvedSubtype || undefined,
        description: description.trim(),
        frequency_months: frequency,
        next_due_date: nextDate,
        reminder_days_before: 14,
        location: location.trim(),
        agreed_price: budget ? Number(budget) : undefined,
        preferred_time: preferredTime || undefined,
        original_job_id: job.id,
        supplies: initialSupplies.length > 0 ? initialSupplies : undefined,
        consumables_provider: consumablesProvider,
      });

      // 3. Notify matching tradies about the new ongoing service lead
      notifyTradiesForNewLead(job as unknown as Job).catch(() => {});

      setSuccess(true);
    } catch (err) {
      console.error('createRecurringJob error:', err);
      showToast(
        err instanceof Error ? `Couldn't schedule service: ${err.message}` : 'Couldn\'t schedule service. Please try again.',
        true,
      );
    }
    setSaving(false);
  };

  if (success) {
    const tradeLabel = resolvedSubtype || category.replace(/_/g, ' ');
    const selectedTradie = savedTradies.find(t => t.id === selectedTradieId);
    return (
      <div className="bg-white rounded-xl border border-emerald-200 p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 capitalize">{tradeLabel} Scheduled</h3>
        <p className="text-sm text-gray-500 mt-1">
          {selectedTradie
            ? `Your ongoing service has been set up and assigned to ${selectedTradie.full_name}.`
            : 'Your ongoing service has been set up. Tradies will be notified.'}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          {!selectedTradieId && (
            <Link
              to={`/search?trade=${encodeURIComponent(
                TRADE_OPTIONS.find(t => t.label.toLowerCase() === category.toLowerCase())?.value || category
              )}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Find a Tradie
            </Link>
          )}
          <button
            onClick={onDone}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              selectedTradieId
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-secondary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule a Service</h1>
          <p className="text-gray-600">Set up a recurring service and we'll match you with the right tradie</p>
        </div>
      </div>

      {/* ── Section 1: Service Details ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Service Details</h2>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Trade</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 bg-white"
              >
                <option value="">Select a trade...</option>
                {tradeKeys.map(trade => (
                  <option key={trade} value={trade}>{trade}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Type</label>
              {hasSubcategories ? (
                <select
                  value={serviceSubtype}
                  onChange={e => setServiceSubtype(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 bg-white"
                >
                  <option value="">Select a service type...</option>
                  {subcategories.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              ) : category ? (
                <input
                  type="text"
                  value={customSubtype}
                  onChange={e => setCustomSubtype(e.target.value)}
                  placeholder="e.g., Annual roof inspection"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
                />
              ) : (
                <input
                  type="text"
                  disabled
                  placeholder="Select a trade first"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-400"
                />
              )}
            </div>
          </div>

          {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the job in detail — size, materials, access, timeline... (no need to include contact info — tradies will message you through the platform)"
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-y min-h-[10rem] focus:outline-none focus:ring-2 focus:ring-secondary-500"
                />
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {keywords.map(kw => {
                      const insertText = kw.detail || kw.keyword;
                      const included = description.toLowerCase().includes(insertText.toLowerCase());
                      return (
                        <button
                          key={kw.keyword}
                          type="button"
                          onClick={() => {
                            if (!included) setDescription(p => p.trim() ? `${p.trim()}\n• ${insertText}` : `• ${insertText}`);
                          }}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            included
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-default'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-secondary-50 hover:text-secondary-700 hover:border-secondary-300'
                          }`}
                        >
                          {kw.keyword}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                <AddressAutocomplete
                  value={location}
                  onChange={setLocation}
                  placeholder="Where is the job?"
                />
                <label className="mt-2.5 inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={parkingAvailable}
                    onChange={(e) => setParkingAvailable(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">Parking available on site for the tradie</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Photos <span className="text-gray-400 font-normal">(optional — helps tradies quote accurately)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 group/photo">
                      <img src={p.preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded-md hover:bg-black/80 transition-colors opacity-0 group-hover/photo:opacity-100"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="w-16 h-16 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 border border-dashed border-gray-300 rounded-lg hover:border-secondary-400 hover:bg-secondary-50/30 transition-colors group"
                    >
                      <Camera className="w-4 h-4 text-gray-400 group-hover:text-secondary-600 transition-colors" />
                      <span className="text-[10px] text-gray-400 group-hover:text-secondary-600">
                        {photos.length === 0 ? 'Add' : `${photos.length}/5`}
                      </span>
                    </button>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section 2: Schedule ── */}
      {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && description.trim() && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">How often do you need this?</h2>
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { value: -3, label: 'Daily' },
                { value: -1, label: 'Weekly' },
                { value: -2, label: 'Fortnightly' },
                { value: 1, label: 'Monthly' },
                { value: 3, label: 'Quarterly' },
                { value: 6, label: '6 Monthly' },
                { value: 12, label: 'Annually' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                    frequency === opt.value
                      ? 'border-secondary-300 bg-secondary-50 text-secondary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">First date</label>
                <input
                  type="date"
                  value={nextDate}
                  min={new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })}
                  onChange={e => setNextDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred time</label>
                <input
                  type="time"
                  value={preferredTime}
                  onChange={e => setPreferredTime(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for flexible timing</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Budget & Preferences ── */}
      {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && description.trim() && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Budget & Preferences</h2>
          <div className="space-y-5">
            <div>
              <div className="flex gap-3 mb-2">
                <button
                  type="button"
                  onClick={() => { setBudgetType('quote'); setBudget(''); }}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                    budgetType === 'quote'
                      ? 'border-secondary-300 bg-secondary-50 text-secondary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Open to Quotes
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetType('set')}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                    budgetType === 'set'
                      ? 'border-secondary-300 bg-secondary-50 text-secondary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Set a Budget
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {budgetType === 'quote'
                  ? 'Tradies will price based on your job details.'
                  : 'Tradies will see your budget and tailor their quote.'}
              </p>
              {budgetType === 'set' && (
                <div className="relative mt-3">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={budget}
                    onChange={e => setBudget(e.target.value)}
                    placeholder={suggestion?.priceRange ? `${suggestion.priceRange.min} – ${suggestion.priceRange.max} per visit` : 'Enter budget per visit (AUD)'}
                    min="0"
                    step="10"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
                  />
                </div>
              )}
            </div>

            <label
              className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-secondary-300 cursor-pointer transition-colors"
              htmlFor="recurring-site-inspection"
            >
              <input
                id="recurring-site-inspection"
                type="checkbox"
                checked={allowsSiteInspection}
                onChange={(e) => setAllowsSiteInspection(e.target.checked)}
                className="w-4 h-4 text-secondary-600 rounded border-gray-300 focus:ring-secondary-500 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Allow on-site quote</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Let the tradie visit before giving a firm price. Recommended for complex or first-time jobs.
                </p>
              </div>
            </label>

            {/* Preferred Tradie */}
            {savedTradies.length > 0 && (() => {
              const matchingTradies = savedTradies.filter(t =>
                t.trade_category?.toLowerCase() === category.toLowerCase()
              );
              const otherTradies = savedTradies.filter(t =>
                t.trade_category?.toLowerCase() !== category.toLowerCase()
              );
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Preferred Tradie
                    {matchingTradies.length > 0 && (
                      <span className="text-warm-600 ml-1 text-xs">({matchingTradies.length} matching)</span>
                    )}
                  </label>
                  <select
                    value={selectedTradieId}
                    onChange={e => setSelectedTradieId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-secondary-500 bg-white"
                  >
                    <option value="">Any available tradie</option>
                    {matchingTradies.length > 0 && (
                      <optgroup label={`Matching ${category.replace(/_/g, ' ')} tradies`}>
                        {matchingTradies.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.full_name} — {t.trade_category?.replace(/_/g, ' ') || 'Tradie'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherTradies.length > 0 && (
                      <optgroup label="Other saved tradies">
                        {otherTradies.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.full_name} — {t.trade_category?.replace(/_/g, ' ') || 'Tradie'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Supplies & Materials ── */}
      {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && description.trim() && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Supplies &amp; Materials</h2>
          <p className="text-xs text-gray-500 mb-4">
            Your tradie always brings their own equipment for the job (vacuum, mop, chemicals, etc.) —
            already covered by the agreed price.
          </p>

          <p className="text-sm font-medium text-gray-700 mb-2">
            Household consumables <span className="text-gray-400 font-normal">(toilet paper, soap, dish liquid)</span>
          </p>
          <div className="space-y-2">
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                consumablesProvider === 'client'
                  ? 'border-emerald-400 bg-emerald-50/50'
                  : 'border-gray-200 hover:border-emerald-300'
              }`}
            >
              <input
                type="radio"
                name="consumables-provider"
                value="client"
                checked={consumablesProvider === 'client'}
                onChange={() => setConsumablesProvider('client')}
                className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">I'll keep these stocked at home</span>
                <p className="text-xs text-gray-500 mt-0.5">Tradie uses what's already there.</p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                consumablesProvider === 'tradie_billed'
                  ? 'border-emerald-400 bg-emerald-50/50'
                  : 'border-gray-200 hover:border-emerald-300'
              }`}
            >
              <input
                type="radio"
                name="consumables-provider"
                value="tradie_billed"
                checked={consumablesProvider === 'tradie_billed'}
                onChange={() => setConsumablesProvider('tradie_billed')}
                className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Tradie picks them up — adds to my invoice</span>
                <p className="text-xs text-gray-500 mt-0.5">Costs are itemised on each billing cycle.</p>
              </div>
            </label>
          </div>

          {consumablesProvider === 'tradie_billed' && (() => {
            const supplySuggestions = getSupplySuggestions(category);
            return (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-gray-600">What should they pick up? <span className="font-normal text-gray-400">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {supplySuggestions.map(name => {
                    const isSelected = selectedSupplies.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setSelectedSupplies(prev =>
                          isSelected ? prev.filter(s => s !== name) : [...prev, name]
                        )}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    value={customSupplyName}
                    onChange={e => setCustomSupplyName(e.target.value)}
                    placeholder="Add other item..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customSupplyName.trim()) {
                        e.preventDefault();
                        if (!selectedSupplies.includes(customSupplyName.trim())) {
                          setSelectedSupplies(prev => [...prev, customSupplyName.trim()]);
                        }
                        setCustomSupplyName('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customSupplyName.trim() && !selectedSupplies.includes(customSupplyName.trim())) {
                        setSelectedSupplies(prev => [...prev, customSupplyName.trim()]);
                        setCustomSupplyName('');
                      }
                    }}
                    disabled={!customSupplyName.trim()}
                    className="px-3 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {selectedSupplies.length > 0 && (
                  <p className="text-xs text-emerald-600 font-medium">{selectedSupplies.length} item{selectedSupplies.length !== 1 ? 's' : ''} selected</p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Submit ── */}
      {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && description.trim() && (
        <div className="space-y-2">
          <button
            onClick={handleSubmit}
            disabled={saving || !description.trim() || (hasSubcategories ? !serviceSubtype : !customSubtype.trim())}
            className="w-full py-3.5 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-lg bg-secondary-500 text-white hover:bg-secondary-600 shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Scheduling Service...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Schedule Recurring Service
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function ClientServicesTab() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const routerLocation = useLocation();

  const [recurringJobs, setRecurringJobs] = useState<RecurringJob[]>([]);
  const [sessionsByJob, setSessionsByJob] = useState<Map<string, RecurringSession[]>>(new Map());
  const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
  const [oneOffJobs, setOneOffJobs] = useState<ActiveOneOffJob[]>([]);
  const [agreements, setAgreements] = useState<(ServiceAgreement & { tradie?: { full_name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdTarget, setHoldTarget] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [collapsedServiceIds, setCollapsedServiceIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showPastServices, setShowPastServices] = useState(false);
  const [savedMethods, setSavedMethods] = useState<Map<string, { id: string; bsb_last4: string | null; account_last4: string | null; mandate_status: string }>>(new Map());
  const [becsSetupJobId, setBecsSetupJobId] = useState<string | null>(null);
  const [becsClientSecret, setBecsClientSecret] = useState<string | null>(null);
  const [becsLoading, setBecsLoading] = useState<string | null>(null);
  const [formPrefill, setFormPrefill] = useState<{ category?: string; subtype?: string; description?: string; location?: string; frequency?: number; budget?: string } | undefined>();

  // Auto-open form from "Make Recurring" button or "Post a Job → Ongoing Work"
  useEffect(() => {
    const state = routerLocation.state as { prefillRecurring?: { category?: string; description?: string; location?: string; budget?: string; tradieId?: string }; openScheduleForm?: boolean } | null;
    if (state?.prefillRecurring) {
      const p = state.prefillRecurring;
      setFormPrefill({
        category: p.category,
        description: p.description,
        location: p.location,
        budget: p.budget,
      });
      setShowForm(true);
      window.history.replaceState({}, document.title);
    } else if (state?.openScheduleForm) {
      setShowForm(true);
      window.history.replaceState({}, document.title);
    }
  }, [routerLocation.state]);
  const [chatOpenJobId, setChatOpenJobId] = useState<string | null>(null);
  const [expandedSessionsJobId, setExpandedSessionsJobId] = useState<string | null>(null);
  const [setAllTimeJobId, setSetAllTimeJobId] = useState<string | null>(null);
  const [allStartTime, setAllStartTime] = useState('');
  const [allEndTime, setAllEndTime] = useState('');
  const [savingAllTime, setSavingAllTime] = useState(false);
  const [pendingQuoteJobIds, setPendingQuoteJobIds] = useState<Set<string>>(new Set());
  const [requestingQuoteId, setRequestingQuoteId] = useState<string | null>(null);
  const [originalJobQuotes, setOriginalJobQuotes] = useState<Map<string, { count: number; topPrice: number; topTradie: string; originalJobId: string; quoteId: string; message: string | null; estimatedDuration: string | null; includesMaterials: boolean; businessName: string | null; avgRating: number | null; reviewCount: number; isPro: boolean }>>(new Map());
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);
  const [expandedQuoteServiceId, setExpandedQuoteServiceId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    try {
      const jobs = await getRecurringJobs(user.id);
      setRecurringJobs(jobs);
      const sessMap = new Map<string, RecurringSession[]>();
      await Promise.all(
        jobs.map(async (job) => {
          try {
            const sessions = await getUpcomingSessions(job.id);
            if (sessions.length > 0) sessMap.set(job.id, sessions);
          } catch { /* ignore */ }
        })
      );
      setSessionsByJob(sessMap);

      // Track which recurring services already have an open quote request in flight.
      // Only count jobs in 'pending' status — the original placeholder job created at service
      // setup is in 'accepted' status with no quote/payment and shouldn't be treated as a request.
      const unpricedIds = jobs.filter(j => j.agreed_price == null || j.agreed_price <= 0).map(j => j.id);
      const originalJobIds = new Set(jobs.map(j => j.original_job_id).filter(Boolean) as string[]);
      if (unpricedIds.length > 0) {
        try {
          const { data: pendingJobs } = await supabase
            .from('jobs')
            .select('id, recurring_job_id')
            .in('recurring_job_id', unpricedIds)
            .eq('status', 'pending')
            .is('deleted_at', null);
          const ids = (pendingJobs || [])
            .filter(p => !originalJobIds.has(p.id) && p.recurring_job_id)
            .map(p => p.recurring_job_id as string);
          setPendingQuoteJobIds(new Set(ids));
        } catch { /* ignore */ }
      } else {
        setPendingQuoteJobIds(new Set());
      }

      // Fetch pending quotes on original jobs linked to recurring services.
      // This lets clients see quotes submitted on the one-time job that spawned
      // a recurring service (e.g. tradie quoted on the original job).
      const origIds = Array.from(originalJobIds);
      if (origIds.length > 0) {
        try {
          const { data: origQuotes } = await supabase
            .from('quotes')
            .select('id, job_id, price_min, price_max, firm_price, message, estimated_duration, includes_materials, status, tradie_id, tradie:profiles!quotes_tradie_id_fkey(full_name, is_premium)')
            .in('job_id', origIds)
            .in('status', ['pending', 'site_visit_scheduled', 'site_visit_completed', 'final_submitted']);

          // Fetch tradie details + ratings for quote authors
          const tradieIds = [...new Set((origQuotes || []).map(q => q.tradie_id).filter(Boolean))];
          let tradieDetailsMap = new Map<string, { business_name: string | null; subscription_tier: string | null }>();
          let tradieRatingsMap = new Map<string, { avg: number | null; count: number }>();
          if (tradieIds.length > 0) {
            const [detailsRes, ratingsRes] = await Promise.all([
              supabase.from('tradie_details').select('profile_id, business_name, subscription_tier').in('profile_id', tradieIds),
              supabase.from('reviews').select('tradie_id, rating').in('tradie_id', tradieIds),
            ]);
            for (const d of detailsRes.data || []) tradieDetailsMap.set(d.profile_id, d);
            const ratingAcc = new Map<string, number[]>();
            for (const r of ratingsRes.data || []) {
              if (!ratingAcc.has(r.tradie_id)) ratingAcc.set(r.tradie_id, []);
              ratingAcc.get(r.tradie_id)!.push(r.rating);
            }
            for (const [tid, ratings] of ratingAcc) {
              tradieRatingsMap.set(tid, { avg: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length });
            }
          }

          const quoteMap = new Map<string, { count: number; topPrice: number; topTradie: string; originalJobId: string; quoteId: string; message: string | null; estimatedDuration: string | null; includesMaterials: boolean; businessName: string | null; avgRating: number | null; reviewCount: number; isPro: boolean }>();
          for (const q of origQuotes || []) {
            const price = q.firm_price ?? q.price_max ?? q.price_min ?? 0;
            const tradieProfile = q.tradie as { full_name: string; is_premium?: boolean } | null;
            const tradieName = tradieProfile?.full_name || 'A tradie';
            const td = tradieDetailsMap.get(q.tradie_id) || null;
            const tr = tradieRatingsMap.get(q.tradie_id) || null;
            const rj = jobs.find(j => j.original_job_id === q.job_id);
            if (!rj) continue;
            const existing = quoteMap.get(rj.id);
            if (!existing || price > existing.topPrice) {
              quoteMap.set(rj.id, {
                count: (existing?.count || 0) + 1,
                topPrice: price,
                topTradie: tradieName,
                originalJobId: q.job_id,
                quoteId: q.id,
                message: q.message,
                estimatedDuration: q.estimated_duration,
                includesMaterials: q.includes_materials ?? false,
                businessName: td?.business_name || null,
                avgRating: tr?.avg ? Math.round(tr.avg * 10) / 10 : null,
                reviewCount: tr?.count || 0,
                isPro: td?.subscription_tier === 'pro' || !!tradieProfile?.is_premium,
              });
            } else {
              quoteMap.set(rj.id, { ...existing, count: existing.count + 1 });
            }
          }
          setOriginalJobQuotes(quoteMap);
        } catch { /* ignore */ }
      } else {
        setOriginalJobQuotes(new Map());
      }
    } catch { /* ignore */ }
  }, [user]);

  const handleRequestQuote = useCallback(async (job: RecurringJob) => {
    if (!user) return;
    setRequestingQuoteId(job.id);
    try {
      const clientName = profile?.full_name || 'A client';
      await requestQuoteForRecurringJob(job, clientName);
      setPendingQuoteJobIds(prev => new Set(prev).add(job.id));
      showToast(job.tradie_id ? 'Quote request sent to your tradie' : 'Quote request sent');
    } catch (err) {
      console.error('requestQuoteForRecurringJob error:', err);
      showToast('Failed to send quote request', true);
    } finally {
      setRequestingQuoteId(null);
    }
  }, [user, profile, showToast]);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype, agreed_price), tradie:profiles!recurring_invoices_tradie_id_fkey(full_name)')
        .eq('homeowner_id', user.id)
        .in('status', ['pending_approval', 'disputed', 'sent', 'overdue', 'processing', 'paid'])
        .order('created_at', { ascending: false });

      // Fetch business names from tradie_details for each unique tradie
      const invoices = (data ?? []) as RecurringInvoice[];
      const tradieIds = [...new Set(invoices.map(inv => inv.tradie_id))];
      if (tradieIds.length > 0) {
        const { data: details } = await supabase
          .from('tradie_details')
          .select('profile_id, business_name')
          .in('profile_id', tradieIds);
        if (details) {
          const bizMap = new Map(details.map(d => [d.profile_id, d.business_name]));
          for (const inv of invoices) {
            const bizName = bizMap.get(inv.tradie_id);
            if (bizName && inv.tradie) {
              (inv.tradie as { full_name: string; business_name?: string }).business_name = bizName;
            }
          }
        }
      }
      setInvoices(invoices);
    } catch { /* ignore */ }
  }, [user]);

  const fetchAgreements = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getActiveAgreements(user.id, 'client');
      setAgreements(data as (ServiceAgreement & { tradie?: { full_name: string } })[]);
    } catch { /* ignore */ }
  }, [user]);

  const fetchOneOffJobs = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, description, status, location_address, budget_amount, created_at, tradie:profiles!jobs_tradie_id_fkey(full_name)')
        .eq('client_id', user.id)
        .in('status', ['funded', 'in_progress'])
        .is('deleted_at', null)
        .is('recurring_job_id', null)
        .order('created_at', { ascending: false });
      setOneOffJobs((data as unknown as ActiveOneOffJob[]) || []);
    } catch { /* ignore */ }
  }, [user]);

  const fetchSavedMethods = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('saved_payment_methods')
        .select('id, recurring_job_id, bsb_last4, account_last4, mandate_status')
        .eq('client_id', user.id);
      const map = new Map<string, { id: string; bsb_last4: string | null; account_last4: string | null; mandate_status: string }>();
      for (const m of data || []) {
        map.set(m.recurring_job_id, m);
      }
      setSavedMethods(map);
    } catch { /* ignore */ }
  }, [user]);

  const handleBecsSetup = async (recurringJobId: string) => {
    const scrollY = window.scrollY;
    setBecsLoading(recurringJobId);
    try {
      const result = await callEdgeFunction<{ clientSecret: string }>('setup-becs-payment', { recurringJobId });
      setBecsClientSecret(result.clientSecret);
      setBecsSetupJobId(recurringJobId);
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('already exists')) {
        await fetchSavedMethods();
        showToast('Direct debit is already set up');
      } else {
        showToast(msg || 'Failed to start Direct Debit setup', true);
      }
    } finally {
      setBecsLoading(null);
    }
  };

  const handleBecsRemove = async (recurringJobId: string) => {
    const scrollY = window.scrollY;
    try {
      await callEdgeFunction('remove-becs-payment', { recurringJobId });
      showToast('Direct debit removed');
      await fetchSavedMethods();
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    } catch {
      showToast('Failed to remove direct debit', true);
    }
  };

  const handleSetAllTime = async (jobId: string) => {
    if (!allStartTime) return;
    setSavingAllTime(true);
    try {
      const startVal = allStartTime + ':00';
      const endVal = allEndTime ? allEndTime + ':00' : null;

      // Update the job's preferred_time
      await supabase
        .from('recurring_jobs')
        .update({ preferred_time: startVal })
        .eq('id', jobId);

      // Update all upcoming scheduled/pending sessions for this job
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      await supabase
        .from('recurring_sessions')
        .update({ start_time: startVal, end_time: endVal })
        .eq('recurring_job_id', jobId)
        .in('status', ['scheduled', 'pending_confirmation'])
        .gte('scheduled_date', today);

      showToast('Time set for all upcoming visits');
      setSetAllTimeJobId(null);
      setAllStartTime('');
      setAllEndTime('');
      fetchJobs();
    } catch {
      showToast('Failed to update times', true);
    } finally {
      setSavingAllTime(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchInvoices(), fetchOneOffJobs(), fetchAgreements(), fetchSavedMethods()]);
      setLoading(false);
    };
    load();
  }, [fetchJobs, fetchInvoices, fetchOneOffJobs, fetchAgreements, fetchSavedMethods]);

  const handlePause = async (jobId: string) => {
    try {
      await pauseRecurringJob(jobId, 'client');
      showToast('Service put on hold — you can resume anytime');
      setHoldTarget(null);
      setHoldReason('');
      fetchJobs();
    } catch {
      showToast('Something went wrong', true);
    }
  };

  const handleCancel = async (
    jobId: string,
    payload?: { category?: CancellationCategory; reason?: string },
  ) => {
    try {
      await cancelRecurringJob(jobId, 'client', payload);
      showToast('Service ended');
      setCancelTarget(null);
      fetchJobs();
    } catch {
      showToast('Something went wrong', true);
    }
  };

  // Active services include those still finding a tradie (tradie_id null) — a freshly
  // scheduled service has no tradie yet but must still be visible to the client.
  const activeJobs = recurringJobs.filter(j => j.is_active && !j.cancelled_at);
  const pausedJobs = recurringJobs.filter(j => !j.is_active && !j.cancelled_at);
  const cancelledJobs = recurringJobs.filter(j => !j.is_active && !!j.cancelled_at);

  const freqLabel = (months?: number) => {
    if (!months) return null;
    const map: Record<number, string> = {
      [-3]: 'Daily', [-1]: 'Weekly', [-2]: 'Fortnightly',
      1: 'Monthly', 3: 'Quarterly', 6: 'Every 6 months', 12: 'Annually',
    };
    return map[months] || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (recurringJobs.length === 0 && oneOffJobs.length === 0) {
    return (
      <div className="space-y-6">
        {showForm ? (
          <InlineScheduleForm
            userId={user?.id || ''}
            onDone={() => { setShowForm(false); setFormPrefill(undefined); fetchJobs(); }}
            onCancel={() => { setShowForm(false); setFormPrefill(undefined); }}
            prefill={formPrefill}
          />
        ) : (
          <div className="text-center py-16">
            <RefreshCw className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900">No Ongoing Services</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Schedule regular cleaning, lawn mowing, pool maintenance and more — all managed in one place.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Schedule a Service
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Add new service ── */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Schedule a Service'}
        </button>
      </div>

      {/* ── Inline Schedule Form ── */}
      {showForm && (
        <InlineScheduleForm
          userId={user?.id || ''}
          onDone={() => { setShowForm(false); setFormPrefill(undefined); fetchJobs(); }}
          onCancel={() => { setShowForm(false); setFormPrefill(undefined); }}
          prefill={formPrefill}
        />
      )}

      {/* ── Active Services ── */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          {activeJobs.map((job) => {
            const sessions = sessionsByJob.get(job.id) || [];
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
            const upcoming = sessions.filter(s =>
              (s.status === 'scheduled' || s.status === 'pending_confirmation' || s.status === 'extra' || s.status === 'rescheduled') && s.scheduled_date >= today
            );
            const overdue = sessions.filter(s => (s.status === 'scheduled' || s.status === 'extra') && s.scheduled_date < today);
            const completed = sessions.filter(s => s.status === 'completed');
            const skipped = sessions.filter(s => s.status === 'skipped');
            const label = job.service_subtype || job.trade_category.replace(/_/g, ' ');
            const freq = freqLabel(job.frequency_months);
            const tradieName = job.tradie_id
              ? ((job as Record<string, unknown> & { tradie?: { full_name?: string } }).tradie?.full_name || 'Tradie')
              : 'Finding a tradie';
            const taskLines = (job.description || '')
              .split('\n')
              .map(l => l.replace(/^\d+\.\s*/, '').trim())
              .filter(Boolean);

            const isExpanded = !collapsedServiceIds.has(job.id);
            const toggleExpanded = () => {
              setCollapsedServiceIds(prev => {
                const next = new Set(prev);
                if (next.has(job.id)) next.delete(job.id);
                else next.add(job.id);
                return next;
              });
            };

            return (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Service header — clickable to expand/collapse */}
                <button
                  onClick={toggleExpanded}
                  className="w-full px-4 py-3 bg-gray-50 text-left hover:bg-gray-100 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                        <p className="text-sm font-semibold text-gray-900 capitalize">{label}</p>
                        {/* Mobile: show Active badge inline with title */}
                        <span className="sm:hidden px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded-full ml-auto">
                          Active
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 ml-6">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          {tradieName}
                        </span>
                        {freq && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {freq}
                          </span>
                        )}
                        {job.agreed_price != null && job.agreed_price > 0 && (
                          <span className="sm:hidden inline-flex items-center text-xs font-semibold text-emerald-600">
                            ${job.agreed_price.toFixed(2)}/visit
                          </span>
                        )}
                        {job.location && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[200px] sm:max-w-[220px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {job.location.split(',')[0]}
                          </span>
                        )}
                        {!isExpanded && upcoming.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-secondary-600">
                            {upcoming.length} upcoming
                          </span>
                        )}
                        {savedMethods.has(job.id) && savedMethods.get(job.id)!.mandate_status === 'active' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-secondary-600 bg-secondary-50 border border-secondary-200 px-1.5 py-0.5 rounded-md">
                            <Building2 className="w-2.5 h-2.5" />
                            Direct Debit
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                      {job.agreed_price != null && job.agreed_price > 0 ? (
                        <span className="text-sm font-semibold text-emerald-600">
                          ${job.agreed_price.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400 ml-0.5">per visit</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          Awaiting quote
                        </span>
                      )}
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                        Active
                      </span>
                    </div>
                  </div>
                </button>

                {/* Collapsed: show nothing below header. Expanded: show full details */}
                {isExpanded && (
                  <>
                  {/* Awaiting-quote CTA — only when no price is set */}
                  {(job.agreed_price == null || job.agreed_price <= 0) && (
                    <div className="px-4 py-3 border-t border-gray-100 bg-amber-50/60">
                      {pendingQuoteJobIds.has(job.id) ? (
                        <div className="flex items-center gap-2 text-xs text-amber-700">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Quote request sent — waiting on {tradieName || 'tradie'} to respond.</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3 flex-wrap">
                          <div className="flex items-start gap-2 flex-1 min-w-[200px]">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-amber-800">No price agreed yet</p>
                              <p className="text-xs text-amber-700 mt-0.5">
                                {job.tradie_id
                                  ? `Request a quote from ${tradieName || 'your tradie'} so we can bill and schedule properly.`
                                  : 'Send this out for a quote to lock in a price per visit.'}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRequestQuote(job)}
                            disabled={requestingQuoteId === job.id}
                            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                          >
                            {requestingQuoteId === job.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            {requestingQuoteId === job.id ? 'Sending...' : 'Request a Quote'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Quotes received on the original job */}
                  {originalJobQuotes.has(job.id) && (() => {
                    const qInfo = originalJobQuotes.get(job.id)!;
                    const isExpanded = expandedQuoteServiceId === job.id;
                    const isAccepting = acceptingQuoteId === qInfo.quoteId;
                    return (
                      <div className="border-t border-gray-100">
                        {/* Collapsed: show summary + View Quote button */}
                        <div className="px-4 py-3 bg-secondary-50/60 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileTextIcon className="w-4 h-4 text-secondary-600 flex-shrink-0" />
                            <p className="text-xs font-semibold text-secondary-800">
                              {qInfo.count === 1
                                ? `1 Quote received — $${qInfo.topPrice.toFixed(0)} from ${qInfo.topTradie}`
                                : `${qInfo.count} Quotes received — from $${qInfo.topPrice.toFixed(0)}`}
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedQuoteServiceId(isExpanded ? null : job.id)}
                            className="inline-flex items-center gap-1.5 bg-secondary-500 hover:bg-secondary-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isExpanded ? 'Hide' : 'View'} {qInfo.count === 1 ? 'Quote' : 'Quotes'}
                          </button>
                        </div>

                        {/* Expanded: show full quote details + Accept & Pay */}
                        {isExpanded && (
                          <div className="px-4 py-4 bg-white border-t border-gray-100">
                            {/* Tradie header */}
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="w-5 h-5 text-emerald-700" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-gray-900">{qInfo.topTradie}</p>
                                  {qInfo.isPro && (
                                    <span className="px-2 py-0.5 bg-warm-100 text-warm-700 text-[10px] font-semibold rounded-full">PRO</span>
                                  )}
                                </div>
                                {qInfo.businessName && (
                                  <p className="text-xs text-gray-500">{qInfo.businessName}</p>
                                )}
                                {qInfo.avgRating !== null && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-xs text-amber-500">{'★'.repeat(Math.round(qInfo.avgRating))}</span>
                                    <span className="text-xs text-gray-500">{qInfo.avgRating} ({qInfo.reviewCount} review{qInfo.reviewCount !== 1 ? 's' : ''})</span>
                                  </div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-lg font-bold text-emerald-700">${qInfo.topPrice.toFixed(0)}</p>
                                <p className="text-[10px] text-gray-400">per visit</p>
                              </div>
                            </div>

                            {/* Quote details */}
                            {qInfo.message && (
                              <div className="mt-3 ml-13 p-3 bg-gray-50 rounded-lg">
                                <p className="text-sm text-gray-700 leading-relaxed">{qInfo.message}</p>
                              </div>
                            )}

                            <div className="mt-3 ml-13 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                              {qInfo.estimatedDuration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {qInfo.estimatedDuration}
                                </span>
                              )}
                              {qInfo.includesMaterials && (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Materials included
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-4 ml-13">
                              <button
                                onClick={async () => {
                                  setAcceptingQuoteId(qInfo.quoteId);
                                  try {
                                    const { url } = await acceptAndPay(qInfo.quoteId, qInfo.originalJobId, qInfo.topPrice);
                                    window.location.href = url;
                                  } catch (err) {
                                    console.error('Accept & Pay failed:', err);
                                    showToast(err instanceof Error ? err.message : 'Failed to accept quote', true);
                                    setAcceptingQuoteId(null);
                                  }
                                }}
                                disabled={isAccepting}
                                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                              >
                                {isAccepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Accept & Pay
                              </button>
                              <button
                                onClick={() => setExpandedQuoteServiceId(null)}
                                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>

                            <p className="text-[11px] text-gray-400 mt-2 ml-13">Accepting locks in this price and assigns {qInfo.topTradie} to your service. Payment secured with Stripe.</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Menu actions */}
                  <div className="px-4 py-1.5 border-t border-gray-100 flex justify-end">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === job.id ? null : job.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === job.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
                            <button
                              onClick={() => { setMenuOpen(null); setCancelTarget(null); setHoldTarget(job.id); setHoldReason(''); }}
                              className="w-full px-3 py-2 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2 transition-colors"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              Put on Hold
                            </button>
                            <button
                              onClick={() => { setMenuOpen(null); setHoldTarget(null); setCancelTarget(job.id); }}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              End Service
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                {/* Task requirements */}
                {taskLines.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Task Requirements ({taskLines.length})
                    </p>
                    <ol className="space-y-1.5">
                      {taskLines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="pt-0.5">{line}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Supplies management — only show if supplies were configured */}
                {((job.supplies as SupplyItem[] | undefined) ?? []).length > 0 && (
                  <ClientSuppliesManager
                    jobId={job.id}
                    supplies={(job.supplies as SupplyItem[] | undefined) ?? []}
                    tradeCategory={job.trade_category}
                    onUpdate={fetchJobs}
                  />
                )}

                {/* Message Tradie toggle + inline chat */}
                {job.tradie_id && user && (
                  <>
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <button
                        onClick={() => setChatOpenJobId(chatOpenJobId === job.id ? null : job.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          chatOpenJobId === job.id
                            ? 'bg-secondary-100 text-secondary-700 border border-secondary-300'
                            : 'text-secondary-600 border border-secondary-200 hover:bg-secondary-50'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Message {tradieName}
                      </button>
                    </div>
                    {chatOpenJobId === job.id && (
                      <QuickChat tradieId={job.tradie_id!} tradieName={tradieName} userId={user.id} recurringJobId={job.id} />
                    )}
                  </>
                )}

                {/* Upcoming sessions */}
                {upcoming.length > 0 ? (
                  <div className="p-4 space-y-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center justify-between">
                      <span>Upcoming Visits</span>
                      {upcoming.length > 3 && expandedSessionsJobId === job.id && (
                        <button
                          onClick={() => setExpandedSessionsJobId(null)}
                          className="text-sm font-bold text-gray-900 hover:text-gray-700 transition-colors flex items-center gap-0.5 normal-case tracking-normal"
                        >
                          <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                          Show less
                        </button>
                      )}
                    </p>
                    {(expandedSessionsJobId === job.id ? upcoming : upcoming.slice(0, 3)).map((s, idx) => (
                      <RecurringSessionCard
                        key={s.id}
                        session={s}
                        recurringJobId={job.id}
                        userRole="client"
                        clientId={user?.id}
                        tradieId={job.tradie_id || undefined}
                        preferredTime={job.preferred_time || undefined}
                        agreedPrice={job.agreed_price}
                        serviceName={job.service_subtype || job.trade_category.replace(/_/g, ' ')}
                        showApplyToAll={idx === 0 && !!s.start_time}
                        onApplyToAll={async (start, end) => {
                          const startVal = start.length === 5 ? start + ':00' : start;
                          const endVal = end ? (end.length === 5 ? end + ':00' : end) : null;
                          await supabase.from('recurring_jobs').update({ preferred_time: startVal }).eq('id', job.id);
                          const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
                          await supabase.from('recurring_sessions')
                            .update({ start_time: startVal, end_time: endVal })
                            .eq('recurring_job_id', job.id)
                            .in('status', ['scheduled', 'pending_confirmation'])
                            .gte('scheduled_date', todayStr);
                          showToast('Time applied to all upcoming visits');
                          fetchJobs();
                        }}
                        onUpdate={() => { fetchJobs(); fetchInvoices(); }}
                      />
                    ))}
                    {upcoming.length > 3 && expandedSessionsJobId !== job.id && (
                      <button
                        onClick={() => setExpandedSessionsJobId(job.id)}
                        className="w-full py-2 text-xs font-medium text-secondary-600 hover:text-secondary-700 hover:bg-secondary-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        + {upcoming.length - 3} more scheduled
                      </button>
                    )}
                    {upcoming.length > 3 && expandedSessionsJobId === job.id && (
                      <button
                        onClick={() => setExpandedSessionsJobId(null)}
                        className="w-full py-2 text-sm font-bold text-gray-900 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                        Show less
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-gray-400">No upcoming sessions scheduled</p>
                  </div>
                )}

                {/* Recent Visits (completed + skipped + overdue) */}
                {(completed.length > 0 || skipped.length > 0 || overdue.length > 0) && (() => {
                  // Find invoices for this job to determine payment status per session
                  const jobInvoices = invoices.filter(inv => inv.recurring_job_id === job.id);

                  // Pre-compute which sessions are covered by each paid invoice
                  // An invoice with regular_sessions_count=5 only covers the first 5
                  // sessions (by date) within its billing period — use session ID to avoid
                  // collapsing duplicates on the same date
                  const paidSessionIds = new Set<string>();
                  for (const inv of jobInvoices) {
                    if (!inv.billing_period_start || !inv.billing_period_end) continue;
                    if (inv.status !== 'paid') continue;
                    // Find all completed/overdue sessions in this invoice's billing period
                    const sessionsInPeriod = [...completed, ...overdue]
                      .filter(s => s.scheduled_date >= inv.billing_period_start && s.scheduled_date <= inv.billing_period_end)
                      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
                    // Only the first N sessions (by date) are covered by this invoice
                    const coveredCount = inv.regular_sessions_count + (inv.extra_sessions_count || 0);
                    sessionsInPeriod.slice(0, coveredCount).forEach(s => paidSessionIds.add(s.id));
                  }

                  const hasBecs = savedMethods.has(job.id) && savedMethods.get(job.id)!.mandate_status === 'active';

                  const getPaymentStatus = (sessionId: string, sessionDate: string): { label: string; style: string; method?: string } => {
                    // Check if this session was covered by a paid invoice
                    if (paidSessionIds.has(sessionId)) {
                      // Find the paid invoice to determine payment method
                      const paidInv = jobInvoices.find(inv =>
                        inv.status === 'paid' && inv.billing_period_start && inv.billing_period_end &&
                        sessionDate >= inv.billing_period_start && sessionDate <= inv.billing_period_end
                      );
                      const method = paidInv?.payment_method === 'au_becs_debit' ? 'Direct Debit' : 'Stripe';
                      return { label: 'Paid', style: 'bg-emerald-100 text-emerald-700', method };
                    }
                    // Check non-paid invoices (sent, processing, etc.)
                    const candidates = jobInvoices.filter(inv =>
                      inv.billing_period_start && inv.billing_period_end &&
                      inv.status !== 'paid' &&
                      sessionDate >= inv.billing_period_start && sessionDate <= inv.billing_period_end
                    );
                    const matchingInvoice = candidates.length > 0
                      ? candidates.sort((a, b) => {
                          const spanA = new Date(a.billing_period_end!).getTime() - new Date(a.billing_period_start!).getTime();
                          const spanB = new Date(b.billing_period_end!).getTime() - new Date(b.billing_period_start!).getTime();
                          return spanA !== spanB ? spanA - spanB : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        })[0]
                      : null;
                    if (!matchingInvoice) return { label: 'Awaiting Payment', style: 'bg-amber-100 text-amber-700' };
                    switch (matchingInvoice.status) {
                      case 'processing': return { label: 'Processing', style: 'bg-secondary-100 text-secondary-700', method: matchingInvoice.payment_method === 'au_becs_debit' ? 'Direct Debit' : 'Stripe' };
                      case 'pending_approval': return { label: 'Awaiting Approval', style: 'bg-amber-100 text-amber-700' };
                      case 'sent': return { label: 'Invoice Sent', style: 'bg-amber-100 text-amber-700' };
                      case 'overdue': return { label: 'Overdue', style: 'bg-red-100 text-red-700' };
                      default: return { label: 'Invoiced', style: 'bg-secondary-100 text-secondary-700' };
                    }
                  };

                  return (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Recent Visits ({completed.length + skipped.length + overdue.length})
                      </p>
                      <div className="space-y-1.5">
                        {[...overdue, ...completed, ...skipped]
                          .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
                          .slice(0, 5)
                          .map(s => {
                            const date = new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', {
                              weekday: 'short', day: 'numeric', month: 'short',
                            });
                            const isCompleted = s.status === 'completed';
                            const isOverdue = s.status === 'scheduled' && s.scheduled_date < today;
                            const paymentStatus = isCompleted ? getPaymentStatus(s.id, s.scheduled_date) : null;
                            const isPaid = paymentStatus?.label === 'Paid';
                            return (
                              <div key={s.id} className={`rounded-lg ${isOverdue ? 'bg-red-50' : 'bg-gray-50'}`}>
                                <div className="flex items-center py-2 px-3">
                                  {/* Date */}
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {isOverdue ? (
                                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                    ) : isCompleted ? (
                                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isPaid ? 'text-emerald-500' : 'text-secondary-500'}`} />
                                    ) : (
                                      <X className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${isOverdue ? 'text-red-700 font-medium' : 'text-gray-700'}`}>{date}</span>
                                  </div>
                                  {/* Price | Status | Payment | Method — fixed widths for alignment */}
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className={`w-[58px] text-right text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                                      {(isCompleted || isOverdue) && job.agreed_price != null && job.agreed_price > 0
                                        ? `$${job.agreed_price.toFixed(2)}` : ''}
                                    </span>
                                    <span className={`w-[78px] text-center px-1 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                                      isOverdue ? 'bg-red-100 text-red-700' : isCompleted ? 'bg-secondary-100 text-secondary-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                      {isOverdue ? 'Not Completed' : isCompleted ? 'Completed' : 'Skipped'}
                                    </span>
                                    <span className={`w-[88px] text-center px-1 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                                      isOverdue ? 'bg-red-100 text-red-700' : isCompleted && paymentStatus ? paymentStatus.style : 'bg-transparent text-transparent'
                                    }`}>
                                      {isOverdue ? 'Awaiting Action' : isCompleted && paymentStatus ? paymentStatus.label : '-'}
                                    </span>
                                    <span className={`w-[72px] text-center px-1 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                                      isCompleted && paymentStatus?.method ? 'bg-gray-100 text-gray-500' : 'bg-transparent text-transparent'
                                    }`}>
                                      {isCompleted && paymentStatus?.method ? paymentStatus.method : '-'}
                                    </span>
                                  </div>
                                </div>
                                {s.status === 'skipped' && s.reschedule_reason && (
                                  <p className="px-3 pb-2 text-[10px] text-gray-400 italic truncate">
                                    Reason: {s.reschedule_reason}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })()}

                {/* Payment Method & Invoices */}
                {(() => {
                  const hasBecs = savedMethods.has(job.id) && savedMethods.get(job.id)!.mandate_status === 'active';
                  const isSettingUpBecs = becsSetupJobId === job.id && becsClientSecret;

                  return (
                    <div className="px-4 pb-4">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Payment Method</p>

                      {isSettingUpBecs ? (
                        <BecsSetupForm
                          clientSecret={becsClientSecret!}
                          name={profile?.full_name || ''}
                          email={user?.email || ''}
                          onSuccess={async () => {
                            const scrollY = window.scrollY;
                            showToast('Direct debit set up successfully — loading...');
                            await fetchSavedMethods();
                            setBecsSetupJobId(null);
                            setBecsClientSecret(null);
                            showToast('Direct debit is now active');
                            requestAnimationFrame(() => window.scrollTo(0, scrollY));
                          }}
                          onCancel={() => {
                            const scrollY = window.scrollY;
                            setBecsSetupJobId(null);
                            setBecsClientSecret(null);
                            requestAnimationFrame(() => window.scrollTo(0, scrollY));
                          }}
                        />
                      ) : hasBecs ? (
                        <div className="space-y-2">
                          {/* BECS active */}
                          <SavedPaymentMethod
                            bsbLast4={savedMethods.get(job.id)!.bsb_last4}
                            accountLast4={savedMethods.get(job.id)!.account_last4}
                            mandateStatus={savedMethods.get(job.id)!.mandate_status}
                            onRemove={() => handleBecsRemove(job.id)}
                          />
                          {/* Pay by Card — greyed out */}
                          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg opacity-50">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <CreditCard className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-400">Pay by Card</p>
                              <p className="text-xs text-gray-400">Switch from Direct Debit to use card payments</p>
                            </div>
                            <span className="px-3 py-1 bg-gray-100 text-gray-400 text-xs font-medium rounded-full flex-shrink-0">Inactive</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Stripe card — active */}
                          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <CreditCard className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">Manual Payments</p>
                              <p className="text-xs text-gray-500">Invoices will be sent with a secure Stripe payment link</p>
                            </div>
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full flex-shrink-0">Active</span>
                          </div>
                          {/* BECS upgrade option */}
                          <button
                            onClick={() => handleBecsSetup(job.id)}
                            disabled={becsLoading === job.id}
                            className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-left transition-colors disabled:opacity-50"
                          >
                            <div className="w-8 h-8 bg-secondary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                              {becsLoading === job.id ? (
                                <Loader2 className="w-4 h-4 text-secondary-600 animate-spin" />
                              ) : (
                                <Building2 className="w-4 h-4 text-secondary-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {becsLoading === job.id ? 'Setting up Direct Debit...' : 'Direct Debit'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {becsLoading === job.id ? 'Please wait while we prepare the form' : 'Auto-pay invoices from your bank account · Lower fees'}
                              </p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Outstanding Invoices for this service ── */}
                {(() => {
                  const jobOutstanding = invoices
                    .filter(inv => inv.recurring_job_id === job.id && inv.status !== 'paid')
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  if (jobOutstanding.length === 0) return null;
                  const jobHasBecs = savedMethods.has(job.id) && savedMethods.get(job.id)!.mandate_status === 'active';
                  return (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Outstanding Invoices ({jobOutstanding.length})
                      </p>
                      <div className="space-y-3">
                        {jobOutstanding.map(inv => (
                          <RecurringInvoiceCard
                            key={inv.id}
                            invoice={inv}
                            userRole="client"
                            paymentMethod={jobHasBecs ? 'becs' : 'card'}
                            onApprove={async (invoiceId) => {
                              try {
                                const result = await callEdgeFunction<{ status: string; checkout_url?: string }>('approve-invoice', { invoiceId, action: 'approve', forceCheckout: !jobHasBecs });
                                if (result.checkout_url) {
                                  window.location.href = result.checkout_url;
                                } else {
                                  showToast('Invoice approved — payment is processing');
                                  fetchInvoices();
                                }
                              } catch (err) {
                                console.error('Approve invoice error:', err);
                                showToast(err instanceof Error ? err.message : 'Something went wrong — please try again', true);
                              }
                            }}
                            onDecline={async (invoiceId, reason) => {
                              try {
                                await callEdgeFunction('approve-invoice', { invoiceId, action: 'decline', disputeReason: reason });
                                showToast('Invoice disputed — the tradie has been notified');
                                fetchInvoices();
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : 'Failed to dispute invoice', true);
                              }
                            }}
                            onAcceptResponse={async (invoiceId) => {
                              try {
                                await callEdgeFunction('respond-to-dispute', { invoiceId, action: 'accept_response' });
                                showToast('Response accepted — invoice is ready for approval');
                                fetchInvoices();
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : 'Failed to accept response', true);
                              }
                            }}
                            onEscalate={async (invoiceId) => {
                              try {
                                await callEdgeFunction('respond-to-dispute', { invoiceId, action: 'escalate' });
                                showToast('Dispute escalated to admin for review');
                                fetchInvoices();
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : 'Failed to escalate dispute', true);
                              }
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Paid Invoice History ── */}
                {(() => {
                  const paidInvs = invoices
                    .filter(inv => inv.recurring_job_id === job.id && inv.status === 'paid')
                    .sort((a, b) => new Date(b.paid_at || b.created_at).getTime() - new Date(a.paid_at || a.created_at).getTime());
                  if (paidInvs.length === 0) return null;
                  return (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Payment History ({paidInvs.length})
                      </p>
                      <div className="space-y-1.5">
                        {paidInvs.slice(0, 5).map(inv => {
                          const paidDate = inv.paid_at
                            ? new Date(inv.paid_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—';
                          const method = inv.payment_method === 'au_becs_debit' ? 'Direct Debit' : 'Card';
                          return (
                            <div key={inv.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                <span className="text-xs text-gray-700">{paidDate}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs font-medium text-gray-900">${inv.total.toFixed(2)}</span>
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded">{method}</span>
                              </div>
                            </div>
                          );
                        })}
                        {paidInvs.length > 5 && (
                          <p className="text-[10px] text-gray-400 text-center pt-1">+ {paidInvs.length - 5} older payments</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Hold confirmation panel */}
                {holdTarget === job.id && (
                  <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                        <Pause className="w-3.5 h-3.5" />
                        Why are you putting this on hold?
                      </p>
                      <button onClick={() => { setHoldTarget(null); setHoldReason(''); }} className="text-amber-400 hover:text-amber-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {HOLD_REASONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => setHoldReason(r)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            holdReason === r
                              ? 'bg-amber-200 border-amber-300 text-amber-800'
                              : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handlePause(job.id)}
                      disabled={!holdReason}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Confirm Hold
                    </button>
                  </div>
                )}

                {/* Cancel confirmation now lives in CancelServiceModal — rendered once at component level. */}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active One-Off Jobs ── */}
      {oneOffJobs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Active Jobs</h3>
            <span className="text-xs text-gray-400">{oneOffJobs.length}</span>
          </div>
          <div className="space-y-2">
            {oneOffJobs.map((job) => {
              const tradieName = job.tradie?.full_name || 'Tradie';
              const statusLabel = job.status === 'funded' ? 'Funded' : 'In Progress';
              const statusClasses = job.status === 'funded'
                ? 'bg-secondary-100 text-secondary-700'
                : 'bg-emerald-100 text-emerald-700';

              return (
                <div key={job.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{job.title}</p>
                      <div className="flex items-center gap-x-3 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          {tradieName}
                        </span>
                        {job.location_address && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[220px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {job.location_address}
                          </span>
                        )}
                        {job.budget_amount != null && (
                          <span className="text-xs text-gray-500">${job.budget_amount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full flex-shrink-0 ${statusClasses}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Past Services ── */}
      {(pausedJobs.length > 0 || cancelledJobs.length > 0) && (() => {
        const pastJobs = [...pausedJobs, ...cancelledJobs].sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        return (
          <div>
            <button
              onClick={() => setShowPastServices(!showPastServices)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{pastJobs.length} past service{pastJobs.length !== 1 ? 's' : ''}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPastServices ? 'rotate-180' : ''}`} />
            </button>

            {showPastServices && (
              <div className="mt-3 space-y-2">
                {pastJobs.map(job => {
                  const label = ((job as Record<string, unknown>).service_subtype as string) || job.trade_category.replace(/_/g, ' ');
                  const tradieName = (job as Record<string, unknown> & { tradie?: { full_name?: string } }).tradie?.full_name;
                  const tradieId = job.tradie_id;
                  const price = (job as Record<string, unknown>).agreed_price as number | null;
                  const loc = (job as Record<string, unknown>).location as string | null;
                  const isPaused = !job.cancelled_at;
                  const freq = freqLabel(job.frequency_months);

                  return (
                    <div key={job.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900 capitalize">{label}</p>
                            <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border ${
                              isPaused ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}>
                              {isPaused ? 'Paused' : 'Ended'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            {tradieName && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                <User className="w-3 h-3" />
                                {tradieName}
                              </span>
                            )}
                            {freq && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                <RefreshCw className="w-3 h-3" />
                                {freq}
                              </span>
                            )}
                            {job.times_completed > 0 && (
                              <span className="text-xs text-gray-500">
                                {job.times_completed} session{job.times_completed !== 1 ? 's' : ''} completed
                              </span>
                            )}
                            {price != null && price > 0 && (
                              <span className="text-xs font-medium text-emerald-600">${price.toFixed(2)}/visit</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {tradieId && (
                            <Link
                              to={`/messages?tradie=${tradieId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <MessageCircle className="w-3 h-3" />
                              Message
                            </Link>
                          )}
                          <button
                            onClick={() => {
                              const tradeKeys = Object.keys(RECURRING_SERVICE_SUBCATEGORIES);
                              const rawCat = job.trade_category.replace(/_/g, ' ');
                              const matchedKey = tradeKeys.find(k => k.toLowerCase() === rawCat.toLowerCase() || rawCat.toLowerCase().startsWith(k.toLowerCase())) || rawCat;
                              setFormPrefill({
                                category: matchedKey,
                                subtype: ((job as Record<string, unknown>).service_subtype as string) || undefined,
                                description: job.description || undefined,
                                location: loc || undefined,
                                frequency: job.frequency_months,
                                budget: price ? String(price) : undefined,
                              });
                              setShowForm(true);
                              setShowPastServices(false);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Schedule Again
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Service Agreements ── */}
      {agreements.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Handshake className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Service Agreements</h3>
            <span className="text-xs text-gray-400">{agreements.length}</span>
          </div>
          <div className="space-y-2">
            {agreements.map((ag) => {
              const freq = ag.typical_frequency
                ? ({ daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', as_needed: 'As needed' }[ag.typical_frequency] || ag.typical_frequency)
                : null;
              return (
                <div key={ag.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{ag.title}</p>
                      <div className="flex items-center gap-x-3 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          {ag.tradie?.full_name || 'Tradie'}
                        </span>
                        {freq && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {freq}
                          </span>
                        )}
                        {ag.address && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[220px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {ag.address}
                          </span>
                        )}
                        {ag.rate_per_visit != null && (
                          <span className="text-xs font-medium text-emerald-600">${Number(ag.rate_per_visit).toFixed(2)}/visit</span>
                        )}
                      </div>
                      {ag.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ag.description}</p>
                      )}
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full flex-shrink-0 capitalize">
                      {ag.status}
                    </span>
           