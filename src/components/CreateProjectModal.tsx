import { proseInputProps } from '../lib/proseInput';
import { useState } from 'react';
import { X, Calendar, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [estimatedEndDate, setEstimatedEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a name for your job group');
      return;
    }

    if (!user) {
      setError('You must be signed in to create a job group');
      return;
    }

    try {
      setLoading(true);

      const { error: insertError } = await supabase.from('projects').insert({
        client_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate || null,
        estimated_end_date: estimatedEndDate || null,
        status: 'active',
      });

      if (insertError) throw insertError;

      onCreated();
      onClose();
    } catch {
      setError('Failed to create job group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-ct-surface rounded-ct-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-ct-surface border-b border-ct-line px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ct-paper">Create New Job Group</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
          >
            <X className="w-5 h-5 text-ct-mute" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm">
              <p className="text-sm text-ct-rose">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-2">
              Job Group Name <span className="text-ct-rose">*</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Kitchen Renovation"
                className="w-full pl-10 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-2">
              Description
            </label>
            <textarea {...proseInputProps}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this job group..."
              rows={3}
              className="w-full px-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ct-mute-2 mb-2">
                Start Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ct-mute-2 mb-2">
                Est. End Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
                <input
                  type="date"
                  value={estimatedEndDate}
                  onChange={(e) => setEstimatedEndDate(e.target.value)}
                  min={startDate}
                  className="w-full pl-10 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>
            </div>
          </div>

          <div className="bg-ct-surface-2 border border-ct-line rounded-ct-sm p-4">
            <p className="text-sm text-ct-mute-2">
              After creating the job group, you can add existing jobs or create new ones within it.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-ct-line text-ct-mute-2 rounded-ct-md hover:bg-ct-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-ct-teal text-ct-ink rounded-ct-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Job Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
