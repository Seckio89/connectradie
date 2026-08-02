import { useState, useRef } from 'react';
import { X, Loader2, Upload, Trash2, ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EditCoverPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string | null;
  userId: string;
  onSave: (url: string | null) => Promise<void>;
}

export default function EditCoverPhotoModal({ isOpen, onClose, currentUrl, userId, onSave }: EditCoverPhotoModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    setUploading(true);
    try {
      if (currentUrl) {
        const parts = currentUrl.split('/cover-photos/');
        if (parts.length > 1) {
          await supabase.storage.from('cover-photos').remove([parts[1]]);
        }
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${userId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('cover-photos')
        .upload(fileName, file);

      if (uploadError) return;

      const { data: { publicUrl } } = supabase.storage
        .from('cover-photos')
        .getPublicUrl(fileName);

      setPreviewUrl(publicUrl);
      await onSave(publicUrl);
      onClose();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!currentUrl) return;
    setRemoving(true);
    try {
      const parts = currentUrl.split('/cover-photos/');
      if (parts.length > 1) {
        await supabase.storage.from('cover-photos').remove([parts[1]]);
      }
      setPreviewUrl(null);
      await onSave(null);
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
      <div className="bg-ct-surface rounded-ct-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ct-line-soft">
          <h3 className="text-lg font-semibold text-ct-paper">Cover photo</h3>
          <button
            onClick={onClose}
            className="p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="aspect-[3/1] rounded-ct-md overflow-hidden bg-ct-surface-2 mb-4">
            {previewUrl ? (
              <img src={previewUrl} alt="Cover photo" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-ct-mute">
                <ImageIcon className="w-10 h-10 mb-2" />
                <p className="text-sm">No cover photo set</p>
              </div>
            )}
          </div>

          <p className="text-xs text-ct-mute mb-4">
            Recommended: landscape image, at least 1200x400px. Max 5MB.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            className="hidden"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || removing}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? 'Uploading...' : previewUrl ? 'Replace photo' : 'Upload photo'}
            </button>

            {previewUrl && (
              <button
                onClick={handleRemove}
                disabled={uploading || removing}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-ct-rose/[0.34] text-ct-rose text-sm font-medium rounded-ct-sm hover:bg-ct-rose/[0.13] disabled:opacity-50 transition-colors"
              >
                {removing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
