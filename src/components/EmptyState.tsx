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
        compact ? 'py-8 px-4' : 'py-16 px-6'
      }`}
    >
      <div
        className={`rounded-full bg-gray-100 flex items-center justify-center mb-4 ${
          compact ? 'w-12 h-12' : 'w-16 h-16'
        }`}
      >
        <Icon
          className={`text-gray-400 ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}
        />
      </div>
      <h3
        className={`font-semibold text-gray-900 mb-1 ${
          compact ? 'text-base' : 'text-lg'
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
          className={`mt-5 inline-flex items-center gap-2 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.97] transition-all ${
            compact ? 'px-4 py-2 text-sm' : 'px-6 py-3'
          }`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
