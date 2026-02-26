import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle, Clock, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface JobManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onJobUpdated: () => void;
  isLicenseExpired?: boolean;
}

export default function JobManagementModal({
  isOpen,
  onClose,
  jobId,
  onJobUpdated,
  isLicenseExpired = false,
}: JobManagementModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [priority, setPriority] = useState('standard');
  const [status, setStatus] = useState('pending');
  const [isDelayed, setIsDelayed] = useState(false);
  const [delayedUntil, setDelayedUntil] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && jobId) {
      loadJob();
    }
  }, [isOpen, jobId]);

  const loadJob = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('jobs')
      .select('*, profiles!jobs_client_id_fkey(full_name, email)')
      .eq('id', jobId)
      .maybeSingle();

    if (data) {
      setJob(data);
      setPriority(data.priority || 'standard');
      setStatus(data.status || 'pending');
      setIsDelayed(data.is_delayed || false);
      setDelayedUntil(data.delayed_until ? new Date(data.delayed_until).toISOString().slice(0, 16) : '');
      setNotes(data.notes || '');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (isLicenseExpired) return;
    setSaving(true);
    const { error } = await supabase
      .from('jobs')
      .update({
        priority,
        status,
        is_delayed: isDelayed,
        delayed_until: isDelayed && delayedUntil ? new Date(delayedUntil).toISOString() : null,
        notes,
      })
      .eq('id', jobId);

    if (!error) {
      onJobUpdated();
      onClose();
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Manage Project</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLicenseExpired && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900">License Expired</p>
                      <p className="text-sm text-red-700 mt-1">
                        You cannot modify jobs while your license is expired. Please renew your license first.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {job && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Project Details</h3>
                  <p className="text-sm text-gray-600 mb-2">{job.description}</p>
                  <p className="text-xs text-gray-500">
                    Client: {job.profiles?.full_name || 'Unknown'}
                  </p>
                  {job.scheduled_time && (
                    <p className="text-xs text-gray-500">
                      Scheduled: {new Date(job.scheduled_time).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  Priority Level
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPriority('standard')}
                    className={`px-4 py-3 rounded-lg font-medium transition-all ${
                      priority === 'standard'
                        ? 'bg-gray-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => setPriority('urgent')}
                    className={`px-4 py-3 rounded-lg font-medium transition-all ${
                      priority === 'urgent'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    Urgent
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="declined">Declined</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDelayed}
                    onChange={(e) => setIsDelayed(e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Mark as Delayed</span>
                </label>
                {isDelayed && (
                  <div className="mt-3">
                    <label className="block text-sm text-gray-600 mb-1">
                      Delayed Until
                    </label>
                    <input
                      type="datetime-local"
                      value={delayedUntil}
                      onChange={(e) => setDelayedUntil(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Internal Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this job (visible only to you)..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || isLicenseExpired}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
