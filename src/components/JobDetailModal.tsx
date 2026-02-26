import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import { formatDate } from '../lib/utils';
import type { Job } from '../types/database';
import JobDetailsCard from './JobDetailsCard';
import Modal from './Modal';

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: (Job & { profiles?: { full_name: string; email: string; phone?: string } }) | null;
  onQuote?: () => void;
  isUnlocked?: boolean;
}

export default function JobDetailModal({ isOpen, onClose, job, onQuote, isUnlocked = true }: JobDetailModalProps) {
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);

  if (!isOpen || !job) return null;

  return (
    <div className={invoiceModalOpen ? 'hidden' : ''}>
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="2xl" closeOnBackdrop={false}>
        <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between z-10">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Job Details</h3>
            <p className="text-sm text-gray-500">Posted {formatDate(job.created_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 bg-gray-50">
          <JobDetailsCard
            job={job}
            client={job.profiles}
            isUnlocked={isUnlocked}
            showClientDetails={true}
            onInvoiceModalChange={setInvoiceModalOpen}
          />

          {job.status === 'pending' && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-semibold text-blue-900 mb-1">Action Required</h5>
                  <p className="text-sm text-blue-700">
                    This job is awaiting your response. Submit a quote to proceed with this booking.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 bg-white flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-white transition-colors"
          >
            Close
          </button>
          {job.status === 'pending' && onQuote && (
            <button
              onClick={() => {
                onQuote();
              }}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold rounded-xl hover:from-primary-700 hover:to-primary-800 transition-all"
            >
              Quote Now
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
