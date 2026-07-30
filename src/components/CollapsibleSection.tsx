import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  badgeColor?: string;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  badge,
  badgeColor = 'bg-ct-surface-2 text-ct-mute-2',
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-ct-line rounded-ct-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="collapsible-header-btn w-full flex items-center relative px-5 py-4 bg-ct-surface-2 hover:bg-ct-surface-2 transition-colors min-h-[52px]"
      >
        <div className="flex items-center gap-3 mx-auto sm:mx-0">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span className="font-semibold text-ct-paper text-base">{title}</span>
          {badge !== undefined && (
            <span className={`ml-2 px-3 py-1 rounded-full text-xs font-medium ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-ct-mute absolute right-5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}
