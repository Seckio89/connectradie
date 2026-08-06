import { useState, useEffect, useMemo } from 'react';
import { Users, Loader2, Check, Search, Briefcase } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import type { Insert } from '../types/database';

// ─────────────────────────────────────────────────────────────────────────────
// NewGroupModal — create a group conversation. Pick participants from the
// tradie's clients + team/subcontractors, optionally name it and link it to a
// job, then create. The multi-participant + RLS foundation already exists; this
// just seeds a conversation (is_group) and its participant rows.
// ─────────────────────────────────────────────────────────────────────────────

interface Candidate {
  userId: string;
  name: string;
  subtitle?: string;
  group: 'Clients' | 'Team';
}

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onCreated: (conversationId: string) => void;
}

export default function NewGroupModal({ isOpen, onClose, currentUserId, onCreated }: NewGroupModalProps) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<{ id: string; title: string | null }[]>([]);
  const [jobId, setJobId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set()); setGroupName(''); setSearch(''); setJobId(''); setError('');
    setLoading(true);
    (async () => {
      const seen = new Set<string>();
      const list: Candidate[] = [];

      // Clients — registered CRM contacts (have a linked account).
      const { data: contacts } = await supabase
        .from('client_contacts')
        .select('full_name, linked_profile_id')
        .eq('tradie_id', currentUserId)
        .not('linked_profile_id', 'is', null);
      for (const c of (contacts as { full_name: string; linked_profile_id: string }[] | null) ?? []) {
        if (c.linked_profile_id === currentUserId || seen.has(c.linked_profile_id)) continue;
        seen.add(c.linked_profile_id);
        list.push({ userId: c.linked_profile_id, name: c.full_name || 'Client', group: 'Clients' });
      }

      // Team members + subcontractors.
      const { data: team } = await supabase
        .from('business_team_members')
        .select('member_profile_id')
        .eq('business_owner_id', currentUserId)
        .not('member_profile_id', 'is', null);
      const teamIds = ((team as { member_profile_id: string }[] | null) ?? [])
        .map((t) => t.member_profile_id)
        .filter((id) => id !== currentUserId && !seen.has(id));
      if (teamIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', teamIds);
        for (const p of (profiles as { id: string; full_name: string; email: string }[] | null) ?? []) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          list.push({ userId: p.id, name: p.full_name || p.email || 'Team member', subtitle: p.email, group: 'Team' });
        }
      }

      setCandidates(list);

      // Live jobs only for the optional link. A group thread is for work still
      // in front of you, so finished and cancelled jobs are excluded — the
      // picker was otherwise dominated by dead jobs. Same status set as
      // recurringJobs.ts:1457.
      const { data: jobRows } = await supabase
        .from('jobs')
        .select('id, title')
        .eq('tradie_id', currentUserId)
        .in('status', ['pending', 'open', 'accepted', 'funded', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(20);
      setJobs((jobRows as { id: string; title: string | null }[] | null) ?? []);
      setLoading(false);
    })();
  }, [isOpen, currentUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q));
  }, [candidates, search]);

  const grouped = useMemo(() => {
    const g: Record<string, Candidate[]> = {};
    for (const c of filtered) { (g[c.group] ??= []).push(c); }
    return g;
  }, [filtered]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const create = async () => {
    if (selected.size < 1) { setError('Pick at least one person to add.'); return; }
    setCreating(true); setError('');
    try {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ created_by: currentUserId, is_group: true, title: groupName.trim() || null, job_id: jobId || null })
        .select('id')
        .single();
      if (convErr || !conv) throw convErr ?? new Error('create failed');

      // Annotated so every key is column-checked — see the `Insert`/`Update`
      // note in types/database.ts.
      const rows: Insert<'conversation_participants'>[] = [
        { conversation_id: conv.id, user_id: currentUserId, is_admin: true },
        // Callback-return annotation: a spread of a `.map()` result is inferred
        // through a naked generic, which erases object-literal freshness.
        ...[...selected].map((uid): Insert<'conversation_participants'> => ({ conversation_id: conv.id, user_id: uid, is_admin: false })),
      ];
      const { error: partErr } = await supabase.from('conversation_participants').insert(rows);
      if (partErr) throw partErr;

      onCreated(conv.id);
      onClose();
    } catch {
      setError('Could not create the group. Please try again.');
    }
    setCreating(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-ct-md bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-ct-mute-2" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ct-paper">New group</h2>
            <p className="text-sm text-ct-mute">Add clients, team members or subcontractors to one thread.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Group name <span className="text-ct-mute font-normal">(optional)</span></label>
          <input
            type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Granville site team"
            className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal"
          />
          <p className="mt-1 text-xs text-ct-mute">Leave blank to name it after the participants.</p>
        </div>

        {jobs.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-ct-mute" /> Link to a job <span className="text-ct-mute font-normal">(optional)</span></label>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}
              className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm bg-ct-surface">
              <option value="">No job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title || 'Untitled job'}</option>)}
            </select>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-ct-mute-2">Participants</label>
            <span className="text-xs text-ct-mute">{selected.size} selected</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…"
              className="w-full pl-9 pr-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal bg-ct-surface-2" />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-ct-md border border-ct-line divide-y divide-ct-line-soft">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-ct-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-ct-mute">
                {candidates.length === 0 ? 'No registered clients or team members yet.' : 'No matches.'}
              </div>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ct-mute bg-ct-surface-2">{group}</p>
                  {items.map((c) => {
                    const on = selected.has(c.userId);
                    return (
                      <button key={c.userId} type="button" onClick={() => toggle(c.userId)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-ct-surface-2">
                        <span className={`w-5 h-5 rounded-ct-xs border flex items-center justify-center flex-shrink-0 ${on ? 'bg-ct-teal border-ct-teal' : 'border-ct-line'}`}>
                          {on && <Check className="w-3.5 h-3.5 text-ct-ink" />}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-ct-mute-2">{c.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ct-paper truncate">{c.name}</p>
                          {c.subtitle && <p className="text-xs text-ct-mute truncate">{c.subtitle}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {error && <p className="text-sm text-ct-rose">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-md font-medium hover:bg-ct-surface-2 transition-colors">Cancel</button>
          <button onClick={create} disabled={creating || selected.size < 1}
            className="flex-1 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-md font-medium hover:bg-ct-teal-deep disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Create group
          </button>
        </div>
      </div>
    </Modal>
  );
}
