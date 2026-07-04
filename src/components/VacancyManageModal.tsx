import { useState, useEffect } from 'react';
import { X, Mail, Phone, Briefcase, Clock, UserCheck, UserX, Eye, Loader2, Trash2, AlertTriangle, Pencil, Copy } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import type { TradeVacancyWithEmployer, VacancyApplicationWithApplicant, ApplicationStatus } from '../types/database';

const APP_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  reviewed: { label: 'Reviewed', color: 'bg-secondary-100 text-secondary-700' },
  shortlisted: { label: 'Shortlisted', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
};

interface VacancyManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  vacancy: TradeVacancyWithEmployer;
  onToggleStatus: (vacancy: TradeVacancyWithEmployer) => Promise<void>;
  onDelete: (vacancy: TradeVacancyWithEmployer) => Promise<void>;
  onEdit: (vacancy: TradeVacancyWithEmployer) => void;
  onRepost: (vacancy: TradeVacancyWithEmployer) => void;
}

export default function VacancyManageModal({ isOpen, onClose, vacancy, onToggleStatus, onDelete, onEdit, onRepost }: VacancyManageModalProps) {
  const [applications, setApplications] = useState<VacancyApplicationWithApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && vacancy) {
      fetchApplications();
    }
  }, [isOpen, vacancy]);

  const fetchApplications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vacancy_applications')
      .select(`
        *,
        applicant:profiles!vacancy_applications_applicant_id_fkey(id, full_name, email, phone, avatar_url),
        applicant_details:profiles!vacancy_applications_applicant_id_fkey(tradie_details(trade_category, business_name))
      `)
      .eq('vacancy_id', vacancy.id)
      .order('created_at', { ascending: false });

    const mapped = (data || []).map((row: Record<string, unknown>) => {
      const details = row.applicant_details as Record<string, unknown> | null;
      return {
        ...row,
        applicant_details: details?.tradie_details || null,
      };
    }) as VacancyApplicationWithApplicant[];

    setApplications(mapped);
    setLoading(false);
  };

  const handleUpdateStatus = async (applicationId: string, newStatus: string) => {
    await supabase
      .from('vacancy_applications')
      .update({ status: newStatus as ApplicationStatus })
      .eq('id', applicationId);

    setApplications(prev =>
      prev.map(a => a.id === applicationId ? { ...a, status: newStatus as ApplicationStatus } : a)
    );
  };

  const handleToggle = async () => {
    setToggling(true);
    await onToggleStatus(vacancy);
    setToggling(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(vacancy); // parent closes the modal on success
    } catch {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="2xl">
      <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 leading-snug line-clamp-2">{vacancy.title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {vacancy.application_count || 0} application{(vacancy.application_count || 0) !== 1 ? 's' : ''} received
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 -mr-1 -mt-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Action bar — wraps on mobile so the buttons never crowd the title */}
      <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-3 border-b border-gray-100 bg-gray-50/50">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
            vacancy.status === 'open'
              ? 'border border-red-200 text-red-600 hover:bg-red-50'
              : 'border border-green-200 text-green-600 hover:bg-green-50'
          }`}
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : vacancy.status === 'open' ? 'Close Listing' : vacancy.status === 'draft' ? 'Publish Listing' : 'Reopen Listing'}
        </button>
        {vacancy.status === 'closed' && (
          <button
            onClick={() => onRepost(vacancy)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Repost
          </button>
        )}
        <button
          onClick={() => onEdit(vacancy)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors sm:ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      <div className="p-5 sm:p-6 max-h-[55vh] overflow-y-auto">
        {confirmDelete && (
          <div className="mb-4 p-4 rounded-xl border border-red-200 bg-red-50">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Delete this listing?</p>
                <p className="text-xs text-red-600 mt-0.5">
                  This permanently removes the listing
                  {applications.length > 0
                    ? ` and its ${applications.length} application${applications.length !== 1 ? 's' : ''}`
                    : ''}
                  . This can’t be undone.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete listing
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
              <Briefcase className="w-7 h-7 text-gray-300" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-1">No applications yet</h3>
            <p className="text-sm text-gray-400 max-w-xs">
              Applications will appear here as workers apply for this position.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map(app => {
              const applicant = app.applicant as VacancyApplicationWithApplicant['applicant'];
              const details = app.applicant_details as { trade_category?: string; business_name?: string } | null;
              const statusConfig = APP_STATUS_CONFIG[app.status] || APP_STATUS_CONFIG.pending;
              const isExpanded = expandedId === app.id;

              return (
                <div key={app.id} className="border border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-colors">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : app.id)}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary-100 to-secondary-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-secondary-700">
                        {applicant?.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{applicant?.full_name || 'Unknown'}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        {details?.trade_category && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {details.trade_category}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(app.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>

                    <Eye className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''} text-gray-400`} />
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-50">
                      <div className="flex items-center gap-4 flex-wrap text-sm text-gray-600 pt-3">
                        {applicant?.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                            {applicant.email}
                          </span>
                        )}
                        {applicant?.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            {applicant.phone}
                          </span>
                        )}
                      </div>

                      {app.cover_letter && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Cover Letter</p>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{app.cover_letter}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        {app.status !== 'shortlisted' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(app.id, 'shortlisted'); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Shortlist
                          </button>
                        )}
                        {app.status !== 'reviewed' && app.status !== 'shortlisted' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(app.id, 'reviewed'); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Mark Reviewed
                          </button>
                        )}
                        {app.status !== 'rejected' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(app.id, 'rejected'); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
