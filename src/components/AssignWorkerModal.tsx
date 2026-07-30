import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Loader2, Check, UserCheck, Users, CircleSlash, MessageCircle } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';

interface TeamMemberOption {
  id: string;
  invite_name: string;
  role: string;
  trade_specialty: string;
  status: string;
  member_profile_id: string | null;
}

interface AssignWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobLabel: string;
  clientName: string;
  currentAssignedId: string | null;
  onAssigned: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  subcontractor: 'Subcontractor',
  apprentice: 'Apprentice',
};

/**
 * Per-service worker assignment: pick ONE team member to handle all visits
 * for this ongoing service (per-visit assignment can come later). Assigning a
 * member with a linked profile notifies them via the DB trigger.
 */
export default function AssignWorkerModal({
  isOpen, onClose, jobId, jobLabel, clientName, currentAssignedId, onAssigned,
}: AssignWorkerModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(currentAssignedId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !user) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('business_team_members')
          .select('id, invite_name, role, trade_specialty, status, member_profile_id')
          .eq('business_owner_id', user.id)
          .neq('status', 'inactive')
          .order('invite_name');
        if (err) throw err;
        setMembers((data as TeamMemberOption[]) || []);
      } catch {
        setError('Couldn’t load your team. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, user]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('recurring_jobs')
        .update({ assigned_team_member_id: selectedId })
        .eq('id', jobId);
      if (err) throw err;
      const name = members.find(m => m.id === selectedId)?.invite_name;
      showToast(selectedId ? `${name || 'Worker'} assigned to this service` : 'Worker unassigned');
      onAssigned();
      onClose();
    } catch {
      setError('Couldn’t save the assignment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="flex items-start gap-3 p-5 border-b border-ct-line-soft">
        <div className="w-10 h-10 rounded-ct-md bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
          <UserCheck className="w-5 h-5 text-ct-mute-2" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-ct-paper">Assign a worker</h2>
          <p className="text-sm text-ct-mute mt-0.5 capitalize truncate">
            {jobLabel} — {clientName}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 -mr-1 -mt-1 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 max-h-[55vh] overflow-y-auto">
        {error && (
          <div className="mb-3 p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm text-ct-rose text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-ct-mute animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-ct-surface-2 rounded-ct-lg flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-ct-mute" />
            </div>
            <h3 className="font-semibold text-ct-mute-2">No team members yet</h3>
            <p className="text-sm text-ct-mute mt-1 max-w-xs mx-auto">
              Add employees, subcontractors or apprentices to your team first.
            </p>
            <Link
              to="/schedule?tab=team"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-md hover:brightness-110 transition-colors"
            >
              Go to My Team
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ct-mute bg-ct-surface-2 border border-ct-line rounded-ct-sm px-3 py-2.5 leading-relaxed">
              The worker you assign is notified and can see this job. Your client only sees who’s coming — their name and role, never contact details.
            </p>
            {/* Unassigned option */}
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`w-full flex items-center gap-3 p-3 min-h-[52px] rounded-ct-md border-2 text-left transition-colors ${
                selectedId === null
                  ? 'border-ct-teal bg-ct-amber/[0.13]'
                  : 'border-ct-line hover:border-ct-line hover:bg-ct-surface-2'
              }`}
            >
              <div className="w-9 h-9 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                <CircleSlash className="w-4 h-4 text-ct-mute" />
              </div>
              <span className="flex-1 text-sm font-medium text-ct-mute-2">No one assigned</span>
              {selectedId === null && <Check className="w-5 h-5 text-ct-teal flex-shrink-0" />}
            </button>

            {members.map(m => {
              const selected = selectedId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full flex items-center gap-3 p-3 min-h-[52px] rounded-ct-md border-2 text-left transition-colors ${
                    selected
                      ? 'border-ct-teal bg-ct-amber/[0.13]'
                      : 'border-ct-line hover:border-ct-line hover:bg-ct-surface-2'
                  }`}
                >
                  <div className="w-9 h-9 rounded-ct-sm bg-ct-teal/[0.14] text-ct-teal font-semibold text-xs flex items-center justify-center flex-shrink-0">
                    {(m.invite_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ct-paper truncate">{m.invite_name || 'Unnamed'}</p>
                      {m.id === currentAssignedId && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-ct-surface-2 text-ct-mute flex-shrink-0">Assigned</span>
                      )}
                    </div>
                    <p className="text-xs text-ct-mute truncate">
                      {ROLE_LABELS[m.role] || m.role}
                      {m.trade_specialty ? ` · ${m.trade_specialty}` : ''}
                      {!m.member_profile_id ? ' · invite pending (won’t be notified)' : ''}
                    </p>
                  </div>
                  {m.member_profile_id && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={`Message ${m.invite_name || 'worker'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/messages?tradie=${m.member_profile_id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          navigate(`/messages?tradie=${m.member_profile_id}`);
                        }
                      }}
                      className="p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 transition-colors flex-shrink-0"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </span>
                  )}
                  {selected && <Check className="w-5 h-5 text-ct-teal flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {members.length > 0 && !loading && (
        <div className="flex gap-3 p-5 border-t border-ct-line-soft">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 min-h-[44px] border border-ct-line text-ct-mute-2 font-medium rounded-ct-md hover:bg-ct-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || selectedId === currentAssignedId}
            className="flex-1 px-4 py-2.5 min-h-[44px] bg-ct-teal text-ct-ink font-medium rounded-ct-md hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserCheck className="w-4 h-4" />
            )}
            {selectedId ? 'Assign' : 'Unassign'}
          </button>
        </div>
      )}
    </Modal>
  );
}
