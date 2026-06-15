import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${
        compact ? 'py-2 sm:py-6 px-4' : 'py-16 px-6'
      }`}
    >
      <div
        className={`rounded-full bg-primary-50 flex items-center justify-center ${
          compact ? 'w-8 h-8 sm:w-12 sm:h-12 mb-1.5 sm:mb-3' : 'w-16 h-16 mb-4'
        }`}
      >
        <Icon
          className={`text-primary-400 ${compact ? 'w-4 h-4 sm:w-6 sm:h-6' : 'w-8 h-8'}`}
        />
      </div>
      <h3
        className={`font-semibold text-gray-900 mb-0.5 sm:mb-1 ${
          compact ? 'text-sm sm:text-base' : 'text-lg'
        }`}
      >
        {title}
      </h3>
      <p
        className={`text-gray-600 max-w-sm ${compact ? 'text-xs' : 'text-sm'}`}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={`inline-flex items-center gap-2 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 active:scale-[0.97] transition-all ${
            compact ? 'px-4 py-1.5 text-sm mt-2 sm:mt-4' : 'px-6 py-3 mt-5'
          }`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
