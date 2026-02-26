import { useState, useRef } from 'react';
import { Camera, CheckCircle2, Loader2, X, FileImage, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import type { JobWithRelations } from '../types/database';

interface JobCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobWithRelations;
  userId: string;
  onCompleted: () => void;
}

export default function JobCompletionModal({ isOpen, onClose, job, userId, onCompleted }: JobCompletionModalProps) {
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG or JPG).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }

    setPhoto(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!notes.trim()) {
      setError('Please describe what work was completed.');
      return;
    }

    if (!photo) {
      setError('Please upload a completion photo as proof of work.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const ext = photo.name.split('.').pop() || 'jpg';
      const filePath = `${userId}/${job.id}-completion-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('job-attachments')
        .upload(filePath, photo, { cacheControl: '3600', upsert: false });

      if (uploadError) throw new Error('Failed to upload photo. Please try again.');

      const { data: urlData } = supabase.storage
        .from('job-attachments')
        .getPublicUrl(filePath);

      const photoUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: 'completed',
          completion_notes: notes.trim(),
          completion_photo_url: photoUrl,
        })
        .eq('id', job.id);

      if (updateError) throw new Error('Failed to update job status. Please try again.');

      if (job.client_id) {
        await supabase.from('notifications').insert({
          user_id: job.client_id,
          title: 'Job Marked Complete',
          message: 'Your job has been marked complete. Please review your experience.',
          type: 'job_update',
          channel: 'in_app',
          read: false,
          link: '/jobs',
          job_id: job.id,
          metadata: {
            job_id: job.id,
            tradie_id: userId,
          },
        });
      }

      onCompleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg" closeOnBackdrop={!submitting}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Complete Job</h2>
              <p className="text-sm text-gray-500">Provide proof of work before marking as done</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Final Notes <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Describe what was done, any issues found, or recommendations for the client.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={submitting}
              placeholder="e.g. Replaced the leaking tap washer in the kitchen. Tested water flow and confirmed no further leaks. Recommend replacing the mixer tap within the next 12 months."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Completion Photo <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Upload a photo of the finished work. This protects you in case of a dispute.
            </p>

            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                <img
                  src={photoPreview}
                  alt="Completion preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={removePhoto}
                  disabled={submitting}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 text-white text-xs rounded-lg">
                  <FileImage className="w-3.5 h-3.5" />
                  {photo?.name}
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="w-full flex flex-col items-center justify-center gap-3 px-6 py-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-green-400 hover:bg-green-50/50 transition-colors group"
              >
                <div className="w-12 h-12 bg-gray-100 group-hover:bg-green-100 rounded-xl flex items-center justify-center transition-colors">
                  <Camera className="w-6 h-6 text-gray-400 group-hover:text-green-600 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-green-700">
                    Click to upload photo
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PNG or JPG, up to 10MB</p>
                </div>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-5 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !notes.trim() || !photo}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Mark as Complete
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
