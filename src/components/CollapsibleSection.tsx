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
  badgeColor = 'bg-gray-100 text-gray-700',
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="collapsible-header-btn w-full flex items-center relative px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors min-h-[52px]"
      >
        <div className="flex items-center gap-3 mx-auto sm:mx-0">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span className="font-semibold text-gray-900 text-base">{title}</span>
          {badge !== undefined && (
            <span className={`ml-2 px-3 py-1 rounded-full text-xs font-medium ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-500 absolute right-5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}
