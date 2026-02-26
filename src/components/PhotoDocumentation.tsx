import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pencil,
  Check,
  Star,
  Loader2,
  Image as ImageIcon,
  GripVertical,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface JobPhoto {
  id: string;
  job_id: string;
  uploaded_by: string;
  storage_path: string;
  stage: 'before' | 'during' | 'after';
  caption: string | null;
  is_portfolio: boolean;
  created_at: string;
  url?: string;
}

interface PhotoDocumentationProps {
  jobId: string;
  isTradie?: boolean;
  className?: string;
}

interface BeforeAfterComparisonProps {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

type Stage = 'before' | 'during' | 'after';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
];

async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      const mimeType = supportsWebp ? 'image/webp' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function BeforeAfterComparison({
  beforeUrl,
  afterUrl,
  className = '',
}: BeforeAfterComparisonProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current || !isDragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const handleMouseMoveGlobal = (e: MouseEvent) => handleMove(e.clientX);
    const handleTouchMoveGlobal = (e: TouchEvent) => handleMove(e.touches[0].clientX);

    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMoveGlobal);
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMoveGlobal);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video overflow-hidden rounded-lg select-none cursor-col-resize ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      {/* After image (full width) */}
      <img
        src={afterUrl}
        alt="After"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ width: containerRef.current?.offsetWidth || '100%' }}
        />
      </div>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-col-resize"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center">
          <GripVertical className="w-4 h-4 text-gray-600" />
        </div>
      </div>

      {/* Labels */}
      <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
        Before
      </span>
      <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
        After
      </span>
    </div>
  );
}

function FullscreenViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: JobPhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const photo = photos[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrentIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setCurrentIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, onClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
      >
        <X className="w-6 h-6" />
      </button>

      {currentIndex > 0 && (
        <button
          onClick={() => setCurrentIndex((i) => i - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {currentIndex < photos.length - 1 && (
        <button
          onClick={() => setCurrentIndex((i) => i + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      <div className="max-w-5xl max-h-[90vh] flex flex-col items-center">
        <img
          src={photo.url}
          alt={photo.caption || `Photo ${currentIndex + 1}`}
          className="max-w-full max-h-[80vh] object-contain rounded"
        />
        {photo.caption && (
          <p className="mt-3 text-white/90 text-sm text-center">{photo.caption}</p>
        )}
        <p className="mt-1 text-white/50 text-xs">
          {currentIndex + 1} of {photos.length}
        </p>
      </div>
    </div>
  );
}

export default function PhotoDocumentation({
  jobId,
  isTradie = false,
  className = '',
}: PhotoDocumentationProps) {
  const [activeStage, setActiveStage] = useState<Stage>('before');
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState('');
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stagePhotos = photos.filter((p) => p.stage === activeStage);
  const beforePhotos = photos.filter((p) => p.stage === 'before');
  const afterPhotos = photos.filter((p) => p.stage === 'after');

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const photosWithUrls = (data || []).map((photo: JobPhoto) => {
        const { data: urlData } = supabase.storage
          .from('job-photos')
          .getPublicUrl(photo.storage_path);
        return { ...photo, url: urlData.publicUrl };
      });

      setPhotos(photosWithUrls);
    } catch (err) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!isTradie || files.length === 0) return;
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;

        const compressed = await compressImage(file);
        const ext = file.type.includes('webp') || compressed.type.includes('webp') ? 'webp' : 'jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const storagePath = `${jobId}/${activeStage}/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(storagePath, compressed, { contentType: compressed.type });

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from('job_photos')
          .insert({
            job_id: jobId,
            uploaded_by: user.id,
            storage_path: storagePath,
            stage: activeStage,
            caption: null,
            is_portfolio: false,
          });

        if (insertError) throw insertError;
      }

      await fetchPhotos();
    } catch (err) {
      // upload error handled silently
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleSaveCaption = async (photoId: string) => {
    try {
      await supabase
        .from('job_photos')
        .update({ caption: captionText.trim() || null })
        .eq('id', photoId);
      setEditingCaption(null);
      setCaptionText('');
      await fetchPhotos();
    } catch (err) {
      // caption save error handled silently
    }
  };

  const handleTogglePortfolio = async (photoId: string, current: boolean) => {
    try {
      await supabase
        .from('job_photos')
        .update({ is_portfolio: !current })
        .eq('id', photoId);
      await fetchPhotos();
    } catch (err) {
      // portfolio toggle error handled silently
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Camera className="w-5 h-5 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">Photo Documentation</h3>
      </div>

      {/* Stage Tabs */}
      <div className="flex border-b border-gray-200">
        {STAGES.map((stage) => {
          const count = photos.filter((p) => p.stage === stage.key).length;
          return (
            <button
              key={stage.key}
              onClick={() => setActiveStage(stage.key)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium text-center transition-colors relative ${
                activeStage === stage.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {stage.label}
              {count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload zone (tradies only) */}
      {isTradie && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`mx-4 mt-4 p-4 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
              <p className="text-sm text-gray-600">
                Drag &amp; drop photos or <span className="text-blue-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Images will be compressed automatically</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>
      )}

      {/* Photo grid */}
      {loading ? (
        <div className="p-4 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : stagePhotos.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No {activeStage} photos yet</p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-3 gap-2">
          {stagePhotos.map((photo, index) => (
            <div key={photo.id} className="relative group">
              <div
                className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-gray-100"
                onClick={() => setFullscreenIndex(index)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || `${activeStage} photo`}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              </div>

              {/* Overlay controls */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-end justify-between p-1.5 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCaption(photo.id);
                    setCaptionText(photo.caption || '');
                  }}
                  className="p-1 bg-black/50 text-white rounded hover:bg-black/70"
                  title="Edit caption"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullscreenIndex(index);
                  }}
                  className="p-1 bg-black/50 text-white rounded hover:bg-black/70"
                  title="View fullscreen"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              </div>

              {/* Portfolio badge for after photos */}
              {activeStage === 'after' && isTradie && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePortfolio(photo.id, photo.is_portfolio);
                  }}
                  className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-colors ${
                    photo.is_portfolio
                      ? 'bg-yellow-400 text-yellow-900'
                      : 'bg-black/40 text-white/70 hover:bg-black/60'
                  }`}
                  title={photo.is_portfolio ? 'Remove from portfolio' : 'Add to portfolio'}
                >
                  <Star className={`w-3 h-3 ${photo.is_portfolio ? 'fill-current' : ''}`} />
                </button>
              )}

              {/* Caption display */}
              {photo.caption && editingCaption !== photo.id && (
                <p className="mt-1 text-xs text-gray-600 truncate">{photo.caption}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Caption editing modal */}
      {editingCaption && (
        <div className="mx-4 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <label className="block text-xs font-medium text-gray-700 mb-1">Photo Caption</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="Add a caption..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={() => handleSaveCaption(editingCaption)}
              className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setEditingCaption(null);
                setCaptionText('');
              }}
              className="p-1.5 text-gray-500 rounded hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Before / After comparison */}
      {beforePhotos.length > 0 && afterPhotos.length > 0 && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Before &amp; After Comparison</h4>
          <BeforeAfterComparison
            beforeUrl={beforePhotos[0].url || ''}
            afterUrl={afterPhotos[0].url || ''}
          />
        </div>
      )}

      {/* Fullscreen viewer */}
      {fullscreenIndex !== null && (
        <FullscreenViewer
          photos={stagePhotos}
          initialIndex={fullscreenIndex}
          onClose={() => setFullscreenIndex(null)}
        />
      )}
    </div>
  );
}

export type { PhotoDocumentationProps, JobPhoto, BeforeAfterComparisonProps };
