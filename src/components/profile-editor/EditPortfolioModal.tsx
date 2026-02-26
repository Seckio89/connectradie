import { useState, useRef } from 'react';
import { X, Loader2, Plus, Trash2, Image as ImageIcon, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PortfolioImage } from '../../types/database';

interface EditPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: PortfolioImage[];
  tradieId: string;
  onUpdate: (images: PortfolioImage[]) => void;
}

export default function EditPortfolioModal({ isOpen, onClose, images, tradieId, onUpdate }: EditPortfolioModalProps) {
  const [localImages, setLocalImages] = useState<PortfolioImage[]>([...images]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingCaption, setSavingCaption] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newImages: PortfolioImage[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 5 * 1024 * 1024) continue;

        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `${tradieId}/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('portfolio-images')
          .upload(fileName, file);

        if (uploadError) continue;

        const { data: { publicUrl } } = supabase.storage
          .from('portfolio-images')
          .getPublicUrl(fileName);

        const nextOrder = localImages.length + newImages.length;

        const { data: inserted, error: insertError } = await supabase
          .from('portfolio_images')
          .insert({
            tradie_id: tradieId,
            image_url: publicUrl,
            caption: '',
            sort_order: nextOrder,
          })
          .select()
          .maybeSingle();

        if (!insertError && inserted) {
          newImages.push(inserted as PortfolioImage);
        }
      }

      const updated = [...localImages, ...newImages];
      setLocalImages(updated);
      onUpdate(updated);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (image: PortfolioImage) => {
    setDeleting(image.id);
    try {
      const { error } = await supabase
        .from('portfolio_images')
        .delete()
        .eq('id', image.id);

      if (!error) {
        const urlParts = image.image_url.split('/portfolio-images/');
        if (urlParts.length > 1) {
          await supabase.storage.from('portfolio-images').remove([urlParts[1]]);
        }

        const updated = localImages.filter((img) => img.id !== image.id);
        setLocalImages(updated);
        onUpdate(updated);
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleCaptionSave = async (imageId: string, caption: string) => {
    setSavingCaption(imageId);
    try {
      await supabase
        .from('portfolio_images')
        .update({ caption })
        .eq('id', imageId);

      const updated = localImages.map((img) =>
        img.id === imageId ? { ...img, caption } : img
      );
      setLocalImages(updated);
      onUpdate(updated);
    } finally {
      setSavingCaption(null);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= localImages.length) return;

    const reordered = [...localImages];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];

    const updated = reordered.map((img, i) => ({ ...img, sort_order: i }));
    setLocalImages(updated);
    onUpdate(updated);

    await Promise.all([
      supabase.from('portfolio_images').update({ sort_order: index }).eq('id', updated[index].id),
      supabase.from('portfolio_images').update({ sort_order: swapIndex }).eq('id', updated[swapIndex].id),
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Edit Portfolio</h3>
            <p className="text-sm text-gray-500 mt-0.5">{localImages.length} photo{localImages.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {localImages.length === 0 && (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">No portfolio images yet</p>
              <p className="text-sm text-gray-400">Upload photos of your best work to attract clients</p>
            </div>
          )}

          <div className="space-y-3">
            {localImages.map((image, index) => (
              <div
                key={image.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 group"
              >
                <div className="flex flex-col items-center gap-1 pt-2">
                  <button
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <GripVertical className="w-4 h-4 text-gray-300" />
                  <button
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === localImages.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                  <img
                    src={image.image_url}
                    alt={image.caption || 'Portfolio'}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={image.caption}
                    onChange={(e) => {
                      const updated = localImages.map((img) =>
                        img.id === image.id ? { ...img, caption: e.target.value } : img
                      );
                      setLocalImages(updated);
                    }}
                    onBlur={(e) => handleCaptionSave(image.id, e.target.value)}
                    placeholder="Add a caption..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                  />
                  {savingCaption === image.id && (
                    <p className="text-xs text-gray-400 mt-1">Saving...</p>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(image)}
                  disabled={deleting === image.id}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                >
                  {deleting === image.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {uploading ? 'Uploading...' : 'Add Photos'}
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
