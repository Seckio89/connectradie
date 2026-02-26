import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Plus, Trash2, Clock, Package, ChevronRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project, Job } from '../types/database';
import { autoNameProject } from '../lib/projectAutoName';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';
import Modal from './Modal';
import JobDetailsCard from './JobDetailsCard';

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
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'declined'>('active');
  const [showEndOngoingModal, setShowEndOngoingModal] = useState(false);
  const [endOngoingStatus, setEndOngoingStatus] = useState<'completed' | 'cancelled' | 'end_date'>('completed');
  const [endOngoingReason, setEndOngoingReason] = useState('');
  const [endOngoingDate, setEndOngoingDate] = useState('');
  const isClient = user?.id === project.client_id;
  const [dateChangeRequests, setDateChangeRequests] = useState<any[]>([]);
  const [showDateRequestModal, setShowDateRequestModal] = useState(false);
  const [requestedField, setRequestedField] = useState<'start_date' | 'estimated_end_date'>('start_date');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestReason, setRequestReason] = useState('');

  const filteredJobs = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return projectJobs.filter(j => ['pending', 'accepted', 'in_progress'].includes(j.status));
      case 'completed':
        return projectJobs.filter(j => j.status === 'completed');
      case 'declined':
        return projectJobs.filter(j => j.status === 'declined');
      default:
        return projectJobs;
    }
  }, [projectJobs, activeTab]);

  const tabCounts = useMemo(() => ({
    active: projectJobs.filter(j => ['pending', 'accepted', 'in_progress'].includes(j.status)).length,
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
      setProjectJobs(data || []);
    } catch {
    }
  };

  const loadAvailableJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', user?.id)
        .is('project_id', null)
        .in('status', ['pending', 'accepted', 'in_progress'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvailableJobs(data || []);
    } catch {
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
            message: `Failed to add job: ${error.message}`,
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
          message: `Failed to remove job: ${error.message}`,
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
    } catch (error) {
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
      const updateData: Record<string, unknown> = { [field]: value || null };
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
    } catch (error) {
      setToast({ message: 'Failed to update date.', type: 'error' });
    }
  };

  const handleToggleOngoing = async () => {
    const newValue = !isOngoing;
    setIsOngoing(newValue);
    try {
      const updateData: Record<string, unknown> = { is_ongoing: newValue };
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
    } catch (error) {
      setIsOngoing(!newValue);
      setToast({ message: 'Failed to update ongoing status.', type: 'error' });
    }
  };

  const handleEndOngoing = async () => {
    if (!endOngoingReason.trim()) return;
    try {
      setLoading(true);
      const updateData: Record<string, unknown> = {
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
    } catch (error) {
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
    setDateChangeRequests(data || []);
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
    } catch (error) {
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
          .update({ [request.field_name]: request.requested_date })
          .eq('id', project.id);
        if (projectError) throw projectError;

        if (request.field_name === 'start_date') setStartDate(request.requested_date);
        else setEndDate(request.requested_date);
      }

      setToast({
        message: approved ? 'Date change approved and applied.' : 'Date change request declined.',
        type: 'success',
      });
      loadDateChangeRequests();
      onUpdated();
    } catch (error) {
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

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700';
      case 'accepted':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
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
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{project.title}</h2>
                <p className="text-sm text-gray-600">
                  {projectJobs.length} {projectJobs.length === 1 ? 'job' : 'jobs'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {project.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
              <p className="text-gray-600">{project.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Start Date</h3>
              {isClient ? (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={startDate ? startDate.split('T')[0] : ''}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      handleUpdateDate('start_date', e.target.value);
                    }}
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {startDate ? new Date(startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                  </span>
                  <button
                    onClick={() => {
                      setRequestedField('start_date');
                      setRequestedDate(startDate ? startDate.split('T')[0] : '');
                      setShowDateRequestModal(true);
                    }}
                    className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Request Change
                  </button>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Est. End Date</h3>
              {isOngoing ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-sm font-semibold text-blue-700">Ongoing</span>
                    </div>
                    {isClient && (
                      <button
                        onClick={() => setShowEndOngoingModal(true)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                      >
                        End Job Group
                      </button>
                    )}
                  </div>
                </div>
              ) : isClient ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={endDate ? endDate.split('T')[0] : ''}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        handleUpdateDate('estimated_end_date', e.target.value);
                      }}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleToggleOngoing}
                    className="w-full px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Set as Ongoing
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-900">
                    {endDate ? new Date(endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                  </span>
                  <button
                    onClick={() => {
                      setRequestedField('estimated_end_date');
                      setRequestedDate(endDate ? endDate.split('T')[0] : '');
                      setShowDateRequestModal(true);
                    }}
                    className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Request Change
                  </button>
                </div>
              )}
            </div>
          </div>

          {isClient && dateChangeRequests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Pending Date Change Requests</h3>
              {dateChangeRequests.map((req) => (
                <div key={req.id} className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900">
                        {req.requester?.full_name || 'A tradie'} requests to change the{' '}
                        <span className="font-semibold">
                          {req.field_name === 'start_date' ? 'start date' : 'end date'}
                        </span>
                      </p>
                      <p className="text-sm text-gray-700">
                        New date: <span className="font-medium">{new Date(req.requested_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </p>
                      {req.reason && (
                        <p className="text-sm text-gray-600 italic">"{req.reason}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => handleRespondToDateRequest(req.id, false)}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleRespondToDateRequest(req.id, true)}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Jobs in this Group</h3>
              {!selectedJob && (
                <button
                  onClick={() => setShowAddJobs(!showAddJobs)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Jobs
                </button>
              )}
            </div>

            {showAddJobs && !selectedJob && (
              <div className="mb-4 p-4 bg-gray-50 rounded-xl">
                <h4 className="font-medium text-gray-900 mb-3">
                  Select jobs to add ({availableJobs.length} available)
                </h4>
                {availableJobs.length === 0 ? (
                  <p className="text-sm text-gray-600">All your jobs are already in groups, or you don't have any unassigned jobs to add.</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                      {availableJobs.map((job) => (
                        <label
                          key={job.id}
                          className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedJobs.has(job.id)}
                            onChange={() => toggleJobSelection(job.id)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {job.description}
                            </p>
                            <p className="text-xs text-gray-500">
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
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddJobs}
                        disabled={selectedJobs.size === 0 || loading}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 transition-colors"
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
                <div className="flex border-b border-gray-200 mb-4">
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
                          ? 'text-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {tab.label}
                        {tab.count > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            activeTab === tab.key
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </span>
                      {activeTab === tab.key && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>

                {filteredJobs.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
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
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl transition-all duration-200 hover:bg-gray-100 cursor-pointer group"
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 mb-1">{job.description}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-600">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getJobStatusColor(job.status)}`}>
                              {job.status.replace('_', ' ')}
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
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from group"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
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
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">End Ongoing Job Group</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Please select a final status and provide a reason for ending this job group.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Final Status</label>
                <select
                  value={endOngoingStatus}
                  onChange={(e) => setEndOngoingStatus(e.target.value as 'completed' | 'cancelled' | 'end_date')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="end_date">End Date</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  End Date {endOngoingStatus === 'end_date' ? '' : '(Optional)'}
                </label>
                <input
                  type="date"
                  value={endOngoingDate}
                  onChange={(e) => setEndOngoingDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {endOngoingStatus === 'end_date' && !endOngoingDate && (
                  <p className="mt-1.5 text-xs text-red-500">An end date is required for this status.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
                <textarea
                  value={endOngoingReason}
                  onChange={(e) => setEndOngoingReason(e.target.value)}
                  placeholder={endOngoingStatus === 'completed'
                    ? 'e.g. All work has been finished successfully...'
                    : 'e.g. Client no longer requires services...'}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowEndOngoingModal(false);
                    setEndOngoingReason('');
                    setEndOngoingDate('');
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndOngoing}
                  disabled={!endOngoingReason.trim() || loading || (endOngoingStatus === 'end_date' && !endOngoingDate)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                    endOngoingStatus === 'completed'
                      ? 'bg-green-600 hover:bg-green-700'
                      : endOngoingStatus === 'end_date'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-red-600 hover:bg-red-700'
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
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl relative z-10" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Request Date Change</h3>
              <p className="text-sm text-gray-600">
                Submit a request to change the <strong>{requestedField === 'start_date' ? 'start date' : 'end date'}</strong>. The client will review and approve or decline.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Date</label>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Explain why you need to change this date..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowDateRequestModal(false);
                    setRequestedDate('');
                    setRequestReason('');
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDateRequest}
                  disabled={!requestedDate || !requestReason.trim() || loading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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
