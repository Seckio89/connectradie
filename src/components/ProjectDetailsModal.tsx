import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Plus, Trash2, Clock, Package, ChevronRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Project, Job } from '../types/database';
import type { Update } from '../types/database';
import { autoNameProject } from '../lib/projectAutoName';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';
import Modal from './Modal';
import JobDetailsCard from './JobDetailsCard';

interface DateChangeRequest {
  id: string;
  field_name: string;
  requested_date: string;
  reason?: string;
  requester?: { full_name: string };
}

interface ProjectDetailsModalProps {
  project: Project & { jobs: Job[] };
  onClose: () => void;
  onUpdated: () => void;
}

export default function ProjectDetailsModal({
  project,
  onClose,
  onUpdated,
}: ProjectDetailsModalProps) {
  const { user } = useAuth();
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [showAddJobs, setShowAddJobs] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [, setStatus] = useState(project.status);
  const [startDate, setStartDate] = useState(project.start_date || '');
  const [endDate, setEndDate] = useState(project.estimated_end_date || '');
  const [isOngoing, setIsOngoing] = useState(project.is_ongoing ?? false);
  const [projectJobs, setProjectJobs] = useState<Job[]>(project.jobs);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [jobToRemove, setJobToRemove] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'declined'>('active');
  const [showEndOngoingModal, setShowEndOngoingModal] = useState(false);
  const [endOngoingStatus, setEndOngoingStatus] = useState<'completed' | 'cancelled' | 'end_date'>('completed');
  const [endOngoingReason, setEndOngoingReason] = useState('');
  const [endOngoingDate, setEndOngoingDate] = useState('');
  const isClient = user?.id === project.client_id;
  const [dateChangeRequests, setDateChangeRequests] = useState<DateChangeRequest[]>([]);
  const [showDateRequestModal, setShowDateRequestModal] = useState(false);
  const [requestedField, setRequestedField] = useState<'start_date' | 'estimated_end_date'>('start_date');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestReason, setRequestReason] = useState('');

  const filteredJobs = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return projectJobs.filter(j => j.status !== null && ['pending', 'accepted', 'in_progress'].includes(j.status));
      case 'completed':
        return projectJobs.filter(j => j.status === 'completed');
      case 'declined':
        return projectJobs.filter(j => j.status === 'declined');
      default:
        return projectJobs;
    }
  }, [projectJobs, activeTab]);

  const tabCounts = useMemo(() => ({
    active: projectJobs.filter(j => j.status !== null && ['pending', 'accepted', 'in_progress'].includes(j.status)).length,
    completed: projectJobs.filter(j => j.status === 'completed').length,
    declined: projectJobs.filter(j => j.status === 'declined').length,
  }), [projectJobs]);

  useEffect(() => {
    loadAvailableJobs();
    loadProjectJobs();
  }, [project.id]);

  useEffect(() => {
    setProjectJobs(project.jobs);
  }, [project.jobs]);

  const loadProjectJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, profiles!jobs_client_id_fkey(full_name, email, phone)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjectJobs((data || []) as unknown as Job[]);
    } catch {
      // no-op
    }
  };

  const loadAvailableJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', user?.id ?? '')
        .is('project_id', null)
        .in('status', ['pending', 'accepted', 'in_progress'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvailableJobs((data || []) as Job[]);
    } catch {
      // no-op
    }
  };

  const handleAddJobs = async () => {
    if (selectedJobs.size === 0) return;

    try {
      setLoading(true);

      const jobIds = Array.from(selectedJobs);

      // Optimistically update UI immediately
      const jobsToAdd = availableJobs.filter(job => selectedJobs.has(job.id));
      const updatedJobsToAdd = jobsToAdd.map(job => ({ ...job, project_id: project.id }));

      setProjectJobs(prev => [...updatedJobsToAdd, ...prev]);
      setAvailableJobs(prev => prev.filter(job => !selectedJobs.has(job.id)));
      setSelectedJobs(new Set());
      setShowAddJobs(false);

      // Then perform the actual database updates in the background
      let successCount = 0;
      for (const jobId of jobIds) {
        const { error } = await supabase
          .from('jobs')
          .update({ project_id: project.id })
          .eq('id', jobId)
          .select();

        if (error) {
          setToast({
            message: friendlyError(error, 'Unable to add job to project. Please try again.'),
            type: 'error'
          });
          // Revert optimistic update on error
          await loadProjectJobs();
          await loadAvailableJobs();
          setLoading(false);
          return;
        }

        successCount++;
      }

      const firstAddedJob = jobsToAdd[0];
      if (firstAddedJob) {
        await autoNameProject(project.id, {
          description: firstAddedJob.description,
          location_address: firstAddedJob.location_address,
        });
      }

      setToast({
        message: `Successfully added ${successCount} job${successCount > 1 ? 's' : ''} to project!`,
        type: 'success'
      });

      loadProjectJobs();
      loadAvailableJobs();
      onUpdated();

    } catch {
      setToast({
        message: 'An unexpected error occurred. Please try again.',
        type: 'error'
      });
      // Revert optimistic update on error
      await loadProjectJobs();
      await loadAvailableJobs();
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveJob = (jobId: string) => {
    setJobToRemove(jobId);
  };

  const confirmRemoveJob = async () => {
    if (!jobToRemove) return;

    try {
      // Optimistically update UI immediately
      const jobToMove = projectJobs.find(job => job.id === jobToRemove);
      if (jobToMove) {
        const updatedJob = { ...jobToMove, project_id: null };
        setProjectJobs(prev => prev.filter(job => job.id !== jobToRemove));
        setAvailableJobs(prev => [updatedJob, ...prev]);
      }
      setJobToRemove(null);

      // Then perform the actual database update in the background
      const { error } = await supabase
        .from('jobs')
        .update({ project_id: null })
        .eq('id', jobToRemove);

      if (error) {
        setToast({
          message: friendlyError(error, 'Unable to remove job from project. Please try again.'),
          type: 'error'
        });
        // Revert optimistic update on error
        await loadProjectJobs();
        await loadAvailableJobs();
        return;
      }

      setToast({
        message: 'Job successfully removed from project!',
        type: 'success'
      });

      // Refresh data in background to sync with any other changes
      loadProjectJobs();
      loadAvailableJobs();
      onUpdated();
    } catch {
      setToast({
        message: 'An unexpected error occurred. Please try again.',
        type: 'error'
      });
      // Revert optimistic update on error
      await loadProjectJobs();
      await loadAvailableJobs();
      setJobToRemove(null);
    }
  };

  const handleUpdateDate = async (field: 'start_date' | 'estimated_end_date', value: string) => {
    try {
      // Annotated, not `Record<string, unknown>`: the annotation is what makes
      // every key below column-checked. See the note on `Update` in
      // types/database.ts. Spelled out per branch rather than `{ [field]: … }`
      // — a COMPUTED key is not excess-property-checked, so the dynamic form
      // would have left both column names unverified.
      const updateData: Update<'projects'> = field === 'start_date'
        ? { start_date: value || null }
        : { estimated_end_date: value || null };
      if (field === 'estimated_end_date' && value) {
        updateData.status = 'active';
        updateData.client_status = 'active';
        updateData.tradie_status = 'active';
        updateData.status_agreed = true;
        updateData.is_ongoing = false;
        setIsOngoing(false);
        setStatus('active');
      }
      const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', project.id);

      if (error) throw error;
      onUpdated();
    } catch {
      setToast({ message: 'Failed to update date.', type: 'error' });
    }
  };

  const handleToggleOngoing = async () => {
    const newValue = !isOngoing;
    setIsOngoing(newValue);
    try {
      // Annotated, not `Record<string, unknown>` — see types/database.ts.
      const updateData: Update<'projects'> = { is_ongoing: newValue };
      if (newValue) {
        updateData.estimated_end_date = null;
        updateData.status = 'ongoing';
        updateData.client_status = 'ongoing';
        updateData.tradie_status = 'ongoing';
        updateData.status_agreed = true;
        setEndDate('');
        setStatus('ongoing');
      }
      const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', project.id);
      if (error) throw error;
      onUpdated();
    } catch {
      setIsOngoing(!newValue);
      setToast({ message: 'Failed to update ongoing status.', type: 'error' });
    }
  };

  const handleEndOngoing = async () => {
    if (!endOngoingReason.trim()) return;
    try {
      setLoading(true);
      // Annotated, not `Record<string, unknown>` — see types/database.ts.
      const updateData: Update<'projects'> = {
        is_ongoing: false,
        status: endOngoingStatus,
        client_status: endOngoingStatus,
        tradie_status: endOngoingStatus,
        status_agreed: true,
        end_reason: endOngoingReason.trim(),
      };
      if (endOngoingDate) {
        updateData.estimated_end_date = endOngoingDate;
      }
      const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', project.id);
      if (error) throw error;
      setIsOngoing(false);
      setStatus(endOngoingStatus);
      if (endOngoingDate) {
        setEndDate(endOngoingDate);
      }
      setShowEndOngoingModal(false);
      setEndOngoingReason('');
      setEndOngoingDate('');
      onUpdated();
    } catch {
      setToast({ message: 'Failed to end ongoing project.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadDateChangeRequests = async () => {
    const { data } = await supabase
      .from('date_change_requests')
      .select('*, requester:profiles!date_change_requests_requester_id_fkey(full_name)')
      .eq('project_id', project.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setDateChangeRequests((data || []) as unknown as DateChangeRequest[]);
  };

  useEffect(() => {
    loadDateChangeRequests();
  }, [project.id]);

  const handleSubmitDateRequest = async () => {
    if (!requestedDate || !requestReason.trim()) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from('date_change_requests')
        .insert({
          project_id: project.id,
          requester_id: user!.id,
          field_name: requestedField,
          requested_date: requestedDate,
          reason: requestReason.trim(),
        });
      if (error) throw error;
      setShowDateRequestModal(false);
      setRequestedDate('');
      setRequestReason('');
      setToast({ message: 'Date change request sent to client.', type: 'success' });
      loadDateChangeRequests();
    } catch {
      setToast({ message: 'Failed to send request.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRespondToDateRequest = async (requestId: string, approved: boolean) => {
    try {
      setLoading(true);
      const request = dateChangeRequests.find(r => r.id === requestId);
      if (!request) return;

      const { error: updateError } = await supabase
        .from('date_change_requests')
        .update({ status: approved ? 'approved' : 'rejected' })
        .eq('id', requestId);
      if (updateError) throw updateError;

      if (approved) {
        const { error: projectError } = await supabase
          .from('projects')
          .update({ [request.field_name as string]: request.requested_date as string })
          .eq('id', project.id);
        if (projectError) throw projectError;

        if (request.field_name === 'start_date') setStartDate(request.requested_date as string);
        else setEndDate(request.requested_date as string);
      }

      setToast({
        message: approved ? 'Date change approved and applied.' : 'Date change request declined.',
        type: 'success',
      });
      loadDateChangeRequests();
      onUpdated();
    } catch {
      setToast({ message: 'Failed to respond to request.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleJobSelection = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getJobStatusColor = (status: string | null) => {
    switch (status) {
      case 'completed':
        return 'bg-ct-teal/[0.14] text-ct-teal';
      case 'in_progress':
        return 'bg-ct-surface-2 text-ct-mute-2';
      case 'accepted':
        return 'bg-ct-amber/[0.13] text-ct-amber';
      default:
        return 'bg-ct-surface-2 text-ct-mute-2';
    }
  };

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      {jobToRemove && (
        <ConfirmModal
          title="Remove Job from Group"
          message="Are you sure you want to remove this job from the group? This action can be undone by adding the job back later."
          confirmText="Remove"
          cancelText="Cancel"
          type="warning"
          onConfirm={confirmRemoveJob}
          onCancel={() => setJobToRemove(null)}
        />
      )}
      <Modal isOpen={true} onClose={onClose} maxWidth="3xl">
        <div className="sticky top-0 bg-ct-surface border-b border-ct-line px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-ct-surface-2 rounded-ct-sm">
                <Package className="w-6 h-6 text-ct-mute-2" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ct-paper">{project.title}</h2>
                <p className="text-sm text-ct-mute-2">
                  {projectJobs.length} {projectJobs.length === 1 ? 'job' : 'jobs'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
            >
              <X className="w-5 h-5 text-ct-mute" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {project.description && (
            <div>
              <h3 className="text-sm font-medium text-ct-mute-2 mb-2">Description</h3>
              <p className="text-ct-mute-2">{project.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-ct-mute-2 mb-2">Start Date</h3>
              {isClient ? (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-ct-mute" />
                  <input
                    type="date"
                    value={startDate ? startDate.split('T')[0] : ''}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      handleUpdateDate('start_date', e.target.value);
                    }}
                    className="flex-1 px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm text-ct-paper focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-ct-mute" />
                  <span className="text-sm text-ct-paper">
                    {startDate ? new Date(startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                  </span>
                  <button
                    onClick={() => {
                      setRequestedField('start_date');
                      setRequestedDate(startDate ? startDate.split('T')[0] : '');
                      setShowDateRequestModal(true);
                    }}
                    className="ml-auto text-xs font-medium text-ct-mute-2 hover:text-ct-teal transition-colors"
                  >
                    Request Change
                  </button>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-ct-mute-2 mb-2">Est. End Date</h3>
              {isOngoing ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-4 py-3 bg-ct-surface-2 border border-ct-line rounded-ct-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-ct-surface-20 animate-pulse" />
                      <span className="text-sm font-semibold text-ct-mute-2">Ongoing</span>
                    </div>
                    {isClient && (
                      <button
                        onClick={() => setShowEndOngoingModal(true)}
                        className="text-xs font-medium text-ct-mute-2 hover:text-ct-teal underline underline-offset-2 transition-colors"
                      >
                        End Job Group
                      </button>
                    )}
                  </div>
                </div>
              ) : isClient ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-ct-mute" />
                    <input
                      type="date"
                      value={endDate ? endDate.split('T')[0] : ''}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        handleUpdateDate('estimated_end_date', e.target.value);
                      }}
                      className="flex-1 px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm text-ct-paper focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
                    />
                  </div>
                  <button
                    onClick={handleToggleOngoing}
                    className="w-full px-3 py-1.5 text-sm font-medium rounded-ct-sm border border-ct-line text-ct-mute-2 bg-ct-surface hover:bg-ct-surface-2 transition-colors"
                  >
                    Set as Ongoing
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-ct-mute" />
                  <span className="text-sm text-ct-paper">
                    {endDate ? new Date(endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                  </span>
                  <button
                    onClick={() => {
                      setRequestedField('estimated_end_date');
                      setRequestedDate(endDate ? endDate.split('T')[0] : '');
                      setShowDateRequestModal(true);
                    }}
                    className="ml-auto text-xs font-medium text-ct-mute-2 hover:text-ct-teal transition-colors"
                  >
                    Request Change
                  </button>
                </div>
              )}
            </div>
          </div>

          {isClient && dateChangeRequests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-ct-mute-2">Pending Date Change Requests</h3>
              {dateChangeRequests.map((req) => (
                <div key={req.id} className="p-4 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-ct-paper">
                        {req.requester?.full_name || 'A tradie'} requests to change the{' '}
                        <span className="font-semibold">
                          {req.field_name === 'start_date' ? 'start date' : 'end date'}
                        </span>
                      </p>
                      <p className="text-sm text-ct-mute-2">
                        New date: <span className="font-medium">{new Date(req.requested_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </p>
                      {req.reason && (
                        <p className="text-sm text-ct-mute-2 italic">"{req.reason}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => handleRespondToDateRequest(req.id, false)}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium text-ct-mute-2 bg-ct-surface border border-ct-line rounded-ct-sm hover:bg-ct-surface-2 transition-colors disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleRespondToDateRequest(req.id, true)}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium text-ct-ink bg-ct-teal rounded-ct-sm hover:brightness-110 transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-ct-line pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ct-paper">Jobs in this Group</h3>
              {!selectedJob && (
                <button
                  onClick={() => setShowAddJobs(!showAddJobs)}
                  className="flex items-center gap-2 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Jobs
                </button>
              )}
            </div>

            {showAddJobs && !selectedJob && (
              <div className="mb-4 p-4 bg-ct-surface-2 rounded-ct-md">
                <h4 className="font-medium text-ct-paper mb-3">
                  Select jobs to add ({availableJobs.length} available)
                </h4>
                {availableJobs.length === 0 ? (
                  <p className="text-sm text-ct-mute-2">All your jobs are already in groups, or you don't have any unassigned jobs to add.</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                      {availableJobs.map((job) => (
                        <label
                          key={job.id}
                          className="flex items-center gap-3 p-3 bg-ct-surface border border-ct-line rounded-ct-sm cursor-pointer hover:border-ct-teal/30 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedJobs.has(job.id)}
                            onChange={() => toggleJobSelection(job.id)}
                            className="w-4 h-4 text-ct-mute-2 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ct-paper truncate">
                              {job.description}
                            </p>
                            <p className="text-xs text-ct-mute">
                              {job.scheduled_time
                                ? `Scheduled: ${formatDate(job.scheduled_time)}`
                                : 'Not scheduled'}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddJobs(false)}
                        className="flex-1 px-4 py-2 border border-ct-line text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddJobs}
                        disabled={selectedJobs.size === 0 || loading}
                        className="flex-1 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add {selectedJobs.size > 0 && `(${selectedJobs.size})`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedJob ? (
              <div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="flex items-center gap-2 text-sm text-ct-mute-2 hover:text-ct-paper mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to jobs
                </button>
                <JobDetailsCard
                  job={selectedJob}
                  isUnlocked={true}
                />
              </div>
            ) : (
              <>
                <div className="flex border-b border-ct-line mb-4">
                  {([
                    { key: 'active' as const, label: 'Active', count: tabCounts.active },
                    { key: 'completed' as const, label: 'Completed', count: tabCounts.completed },
                    { key: 'declined' as const, label: 'Declined', count: tabCounts.declined },
                  ]).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? 'text-ct-mute-2'
                          : 'text-ct-mute hover:text-ct-mute-2'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {tab.label}
                        {tab.count > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            activeTab === tab.key
                              ? 'bg-ct-surface-2 text-ct-mute-2'
                              : 'bg-ct-surface-2 text-ct-mute'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </span>
                      {activeTab === tab.key && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal rounded-full" />
                      )}
                    </button>
                  ))}
                </div>

                {filteredJobs.length === 0 ? (
                  <div className="text-center py-10 text-ct-mute">
                    <p className="text-sm">
                      {activeTab === 'active' && 'No active jobs in this group. Add jobs above to get started.'}
                      {activeTab === 'completed' && 'No completed jobs yet. Jobs will move here once they\'re finished.'}
                      {activeTab === 'declined' && 'No declined jobs in this group.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredJobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-ct-surface-2 rounded-ct-md transition-all duration-200 hover:bg-ct-surface-2 cursor-pointer group"
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-ct-paper mb-1">{job.description}</p>
                          <div className="flex items-center gap-3 text-sm text-ct-mute-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getJobStatusColor(job.status)}`}>
                              {(job.status ?? 'pending').replace('_', ' ')}
                            </span>
                            {job.scheduled_time && (
                              <span>Scheduled: {formatDate(job.scheduled_time)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveJob(job.id);
                            }}
                            className="p-2 text-ct-rose hover:text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors"
                            title="Remove from group"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-ct-mute group-hover:text-ct-mute transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>

      {showEndOngoingModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-ct-surface rounded-ct-lg max-w-md w-full shadow-xl">
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-ct-paper">End Ongoing Job Group</h3>
                <p className="text-sm text-ct-mute mt-1">
                  Please select a final status and provide a reason for ending this job group.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Final Status</label>
                <select
                  value={endOngoingStatus}
                  onChange={(e) => setEndOngoingStatus(e.target.value as 'completed' | 'cancelled' | 'end_date')}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                >
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="end_date">End Date</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">
                  End Date {endOngoingStatus === 'end_date' ? '' : '(Optional)'}
                </label>
                <input
                  type="date"
                  value={endOngoingDate}
                  onChange={(e) => setEndOngoingDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
                {endOngoingStatus === 'end_date' && !endOngoingDate && (
                  <p className="mt-1.5 text-xs text-ct-rose">An end date is required for this status.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Reason</label>
                <textarea {...proseInputProps}
                  value={endOngoingReason}
                  onChange={(e) => setEndOngoingReason(e.target.value)}
                  placeholder={endOngoingStatus === 'completed'
                    ? 'e.g. All work has been finished successfully...'
                    : 'e.g. Client no longer requires services...'}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowEndOngoingModal(false);
                    setEndOngoingReason('');
                    setEndOngoingDate('');
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-ct-mute-2 bg-ct-surface-2 rounded-ct-sm hover:bg-ct-line transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndOngoing}
                  disabled={!endOngoingReason.trim() || loading || (endOngoingStatus === 'end_date' && !endOngoingDate)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium text-ct-ink rounded-ct-sm transition-colors disabled:opacity-50 ${
                    endOngoingStatus === 'completed'
                      ? 'bg-ct-teal hover:brightness-110'
                      : endOngoingStatus === 'end_date'
                      ? 'bg-ct-teal hover:brightness-110'
                      : 'bg-ct-rose hover:brightness-110'
                  }`}
                >
                  {loading ? 'Saving...' : endOngoingStatus === 'completed' ? 'Mark Completed' : endOngoingStatus === 'end_date' ? 'Set End Date' : 'Mark Cancelled'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDateRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowDateRequestModal(false)}>
          <div className="fixed inset-0 bg-black/40" />
          <div className="bg-ct-surface rounded-ct-lg max-w-md w-full shadow-xl relative z-10" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-ct-paper">Request Date Change</h3>
              <p className="text-sm text-ct-mute-2">
                Submit a request to change the <strong>{requestedField === 'start_date' ? 'start date' : 'end date'}</strong>. The client will review and approve or decline.
              </p>

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">New Date</label>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Reason</label>
                <textarea {...proseInputProps}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Explain why you need to change this date..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-ct-line rounded-ct-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowDateRequestModal(false);
                    setRequestedDate('');
                    setRequestReason('');
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-ct-mute-2 bg-ct-surface-2 rounded-ct-sm hover:bg-ct-line transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDateRequest}
                  disabled={!requestedDate || !requestReason.trim() || loading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-ct-ink bg-ct-teal rounded-ct-sm hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
