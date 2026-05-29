import type { ImgHTMLAttributes } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useSignedUrl } from '../hooks/useSignedUrl';
import type { StorageBucket } from '../lib/storage';

interface SignedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  bucket: StorageBucket;
  /** Stored path or legacy public URL. */
  value: string | null | undefined;
  /** Seconds until the signed URL expires. Defaults to 1 hour. */
  expiresIn?: number;
  /** Fallback when no value is provided or signing fails. */
  fallbackClassName?: string;
}

/**
 * Renders an <img> backed by a freshly-signed Supabase Storage URL. Handles
 * the loading state with a subtle skeleton; on failure shows a neutral
 * placeholder so the layout doesn't collapse.
 */
export default function SignedImage({
  bucket,
  value,
  expiresIn,
  fallbackClassName,
  className,
  alt = '',
  ...imgProps
}: SignedImageProps) {
  const url = useSignedUrl(bucket, value, expiresIn);

  if (!url) {
    return (
      <div
        className={fallbackClassName || `${className || ''} bg-gray-100 flex items-center justify-center`.trim()}
        role="img"
        aria-label={alt || 'Loading image'}
      >
        <ImageIcon className="w-1/3 h-1/3 max-w-8 max-h-8 text-gray-300" />
      </div>
    );
  }

  return <img src={url} alt={alt} className={className} {...imgProps} />;
}
