import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Shield, Sparkles, Lightbulb, Wrench, AlertTriangle, CheckCircle2, Users, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Insert } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';

interface PlatformUpdate {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  is_active: boolean;
  requires_acknowledgment: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
}

interface UpdateStats {
  update_id: string;
  read_count: number;
  acknowledged_count: number;
}

const typeOptions = [
  { value: 'tos', label: 'Terms of Service', icon: Shield },
  { value: 'policy', label: 'Policy Update', icon: Shield },
  { value: 'feature', label: 'New Feature', icon: Sparkles },
  { value: 'recommendation', label: 'Recommendation', icon: Lightbulb },
  { value: 'maintenance', label: 'Maintenance', icon: Wrench },
];

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'bg-ct-line text-ct-mute-2' },
  { value: 'normal', label: 'Normal', color: 'bg-ct-surface-2 text-ct-mute-2' },
  { value: 'high', label: 'High', color: 'bg-ct-amber/[0.13] text-ct-amber' },
  { value: 'critical', label: 'Critical', color: 'bg-ct-rose/[0.13] text-ct-rose' },
];

const typeColors: Record<string, string> = {
  tos: 'bg-ct-surface-2 text-ct-mute-2',
  policy: 'bg-ct-surface-2 text-ct-mute-2',
  feature: 'bg-ct-amber/[0.13] text-ct-amber',
  recommendation: 'bg-ct-amber/[0.13] text-ct-amber',
  maintenance: 'bg-ct-surface-2 text-ct-mute-2',
};

export default function AdminUpdates() {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [stats, setStats] = useState<Map<string, UpdateStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<PlatformUpdate | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [totalUsers, setTotalUsers] = useState(0);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('feature');
  const [priority, setPriority] = useState('normal');
  const [requiresAck, setRequiresAck] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    fetchUpdates();
    fetchTotalUsers();
  }, [filter]);

  const fetchTotalUsers = async () => {
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    setTotalUsers(count || 0);
  };

  const fetchUpdates = async () => {
    setLoading(true);

    let query = supabase
      .from('platform_updates')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter === 'active') query = query.eq('is_active', true);
    if (filter === 'inactive') query = query.eq('is_active', false);

    const { data } = await query;
    setUpdates(data || []);

    // Fetch read stats for each update
    if (data && data.length > 0) {
      const statsMap = new Map<string, UpdateStats>();
      for (const update of data) {
        const { count: readCount } = await supabase
          .from('user_update_reads')
          .select('*', { count: 'exact', head: true })
          .eq('update_id', update.id);

        const { count: ackCount } = await supabase
          .from('user_update_reads')
          .select('*', { count: 'exact', head: true })
          .eq('update_id', update.id)
          .not('acknowledged_at', 'is', null);

        statsMap.set(update.id, {
          update_id: update.id,
          read_count: readCount || 0,
          acknowledged_count: ackCount || 0,
        });
      }
      setStats(statsMap);
    }

    setLoading(false);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setType('feature');
    setPriority('normal');
    setRequiresAck(false);
    setExpiresAt('');
    setEditingUpdate(null);
  };

  const openCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEdit = (update: PlatformUpdate) => {
    setTitle(update.title);
    setContent(update.content);
    setType(update.type);
    setPriority(update.priority);
    setRequiresAck(update.requires_acknowledgment);
    setExpiresAt(update.expires_at ? update.expires_at.split('T')[0] : '');
    setEditingUpdate(update);
    setShowCreateModal(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !user) return;
    setSaving(true);

    // Annotated so every key is column-checked — see the `Insert`/`Update` note
    // in types/database.ts. `Insert` (the stricter of the two) because the same
    // payload feeds both branches below.
    const payload: Insert<'platform_updates'> = {
      title: title.trim(),
      content: content.trim(),
      type,
      priority,
      requires_acknowledgment: requiresAck,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (editingUpdate) {
      await supabase
        .from('platform_updates')
        .update(payload)
        .eq('id', editingUpdate.id);
    } else {
      const insertPayload: Insert<'platform_updates'> = { ...payload, created_by: user.id };
      await supabase
        .from('platform_updates')
        .insert(insertPayload);
    }

    setSaving(false);
    setShowCreateModal(false);
    resetForm();
    fetchUpdates();
  };

  const toggleActive = async (update: PlatformUpdate) => {
    await supabase
      .from('platform_updates')
      .update({ is_active: !update.is_active, updated_at: new Date().toISOString() })
      .eq('id', update.id);
    fetchUpdates();
  };

  const deleteUpdate = async (id: string) => {
    if (!confirm('Delete this update permanently?')) return;
    try {
      const { error: readsError } = await supabase.from('user_update_reads').delete().eq('update_id', id);
      if (readsError) throw readsError;
      const { error: updateError } = await supabase.from('platform_updates').delete().eq('id', id);
      if (updateError) throw updateError;
      fetchUpdates();
    } catch (err) {
      console.error('Failed to delete update:', err);
    }
  };

  return (
    <DashboardLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">Platform Updates</h1>
            <p className="text-sm text-ct-mute mt-1">Manage announcements, policy changes, and feature updates</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink rounded-ct-md hover:bg-ct-teal/[0.14] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Update
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 mb-4 bg-ct-surface-2 rounded-ct-sm p-1 w-fit">
          {(['active', 'inactive', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-ct-xs text-sm font-medium transition-colors capitalize ${
                filter === f ? 'bg-ct-surface text-ct-paper shadow-sm' : 'text-ct-mute hover:text-ct-mute-2'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
          </div>
        ) : updates.length === 0 ? (
          <div className="text-center py-16 bg-ct-surface rounded-ct-lg border border-ct-line">
            <Sparkles className="w-10 h-10 text-ct-mute mx-auto mb-3" />
            <p className="text-ct-mute text-sm">No {filter !== 'all' ? filter : ''} updates yet</p>
            <button
              onClick={openCreate}
              className="mt-3 text-sm font-medium text-ct-mute-2 hover:text-ct-mute-2"
            >
              Create your first update
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((update) => {
              const stat = stats.get(update.id);
              const readPct = totalUsers > 0 && stat ? Math.round((stat.read_count / totalUsers) * 100) : 0;
              const pConfig = priorityOptions.find(p => p.value === update.priority);

              return (
                <div
                  key={update.id}
                  className={`bg-ct-surface rounded-ct-lg border border-ct-line p-4 transition-opacity ${
                    !update.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase ${typeColors[update.type] || 'bg-ct-surface-2 text-ct-mute-2'}`}>
                          {typeOptions.find(t => t.value === update.type)?.label || update.type}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${pConfig?.color || ''}`}>
                          {update.priority}
                        </span>
                        {update.requires_acknowledgment && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-rose/[0.13] text-ct-rose border border-ct-rose/[0.34]">
                            Requires Acknowledgment
                          </span>
                        )}
                        {!update.is_active && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-surface-2 text-ct-mute">
                            Inactive
                          </span>
                        )}
                      </div>

                      <h3 className="font-semibold text-ct-paper text-sm">{update.title}</h3>
                      <p className="text-xs text-ct-mute mt-1 line-clamp-2">{update.content}</p>

                      <div className="flex items-center gap-4 mt-3 text-[0.6875rem] text-ct-mute">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(update.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {update.expires_at && (
                          <span>
                            Expires: {new Date(update.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {stat?.read_count || 0} read ({readPct}%)
                        </span>
                        {update.requires_acknowledgment && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {stat?.acknowledged_count || 0} acknowledged
                          </span>
                        )}
                      </div>

                      {/* Read progress bar */}
                      <div className="mt-2 h-1 bg-ct-surface-2 rounded-full overflow-hidden w-48">
                        <div
                          className="h-full bg-ct-surface-2 rounded-full transition-all"
                          style={{ width: `${readPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(update)}
                        className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                        title={update.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {update.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEdit(update)}
                        className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteUpdate(update.id)}
                        className="p-2 text-ct-mute hover:text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-ct-paper mb-4">
              {editingUpdate ? 'Edit Update' : 'Create Platform Update'}
            </h2>

            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {typeOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setType(opt.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-ct-sm border text-sm font-medium transition-colors ${
                          type === opt.value
                            ? 'border-ct-teal bg-ct-surface-2 text-ct-mute-2'
                            : 'border-ct-line text-ct-mute-2 hover:border-ct-line'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Updated Privacy Policy"
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Content</label>
                <textarea {...proseInputProps}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Describe the update in detail..."
                  rows={5}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal resize-none"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Priority</label>
                <div className="flex gap-2">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value)}
                      className={`px-4 py-2 rounded-ct-sm border text-sm font-medium transition-colors ${
                        priority === opt.value
                          ? 'border-ct-teal bg-ct-surface-2 text-ct-mute-2'
                          : 'border-ct-line text-ct-mute-2 hover:border-ct-line'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresAck}
                    onChange={(e) => setRequiresAck(e.target.checked)}
                    className="w-4 h-4 rounded-ct-xs border-ct-line text-ct-mute-2 focus:ring-ct-teal"
                  />
                  <span className="text-sm text-ct-mute-2">Requires acknowledgment</span>
                </label>
              </div>

              {/* Expires */}
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
                  Expires on <span className="text-ct-mute font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
                />
              </div>

              {/* Info for ToS/Policy */}
              {(type === 'tos' || type === 'policy') && !requiresAck && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm">
                  <AlertTriangle className="w-4 h-4 text-ct-amber flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-ct-amber">
                    ToS and policy updates typically require user acknowledgment. Consider enabling "Requires acknowledgment" so users must confirm they've read the changes.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="px-5 py-2 text-sm font-medium text-ct-mute-2 hover:text-ct-paper transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!title.trim() || !content.trim() || saving}
                className="inline-flex items-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink rounded-ct-md hover:bg-ct-teal/[0.14] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingUpdate ? 'Save Changes' : 'Publish Update'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
