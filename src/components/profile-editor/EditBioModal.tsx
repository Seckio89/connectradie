import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { proseInputProps } from '../../lib/proseInput';

interface EditBioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBio: string;
  onSave: (bio: string) => Promise<void>;
}

const MAX_BIO_LENGTH = 500;

export default function EditBioModal({ isOpen, onClose, currentBio, onSave }: EditBioModalProps) {
  const [bio, setBio] = useState(currentBio);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(bio.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
      <div className="bg-ct-surface rounded-ct-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ct-line-soft">
          <h3 className="text-lg font-semibold text-ct-paper">Edit about</h3>
          <button
            onClick={onClose}
            className="p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <label className="block text-sm font-medium text-ct-mute-2 mb-2">
            Tell clients about yourself and your work
          </label>
          <textarea
            {...proseInputProps}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={MAX_BIO_LENGTH}
            rows={5}
            placeholder="Describe your experience, specialisations, and what sets you apart..."
            className="w-full px-4 py-3 border border-ct-line rounded-ct-md focus:ring-2 focus:ring-ct-teal focus:border-ct-teal resize-none text-ct-paper placeholder:text-ct-mute"
          />
          <p className="text-xs text-ct-mute mt-1.5 text-right">
            {bio.length}/{MAX_BIO_LENGTH}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ct-line-soft bg-ct-surface-2 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-ct-mute-2 hover:bg-ct-line rounded-ct-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
