import { type ReactNode } from 'react';
import { Pencil } from 'lucide-react';

interface EditableSectionProps {
  children: ReactNode;
  onEdit: () => void;
  label: string;
  dark?: boolean;
}

export default function EditableSection({ children, onEdit, label, dark }: EditableSectionProps) {
  return (
    <div className="group/edit relative">
      {children}
      <button
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className={`absolute top-3 right-3 p-2 rounded-ct-sm shadow-sm opacity-0 group-hover/edit:opacity-100 focus:opacity-100 transition-all duration-200 z-10 ${
          dark
            ? 'bg-ct-surface/20 backdrop-blur-sm border border-white/20 text-ct-paper hover:bg-ct-surface/30'
            : 'bg-ct-surface border border-ct-line text-ct-mute hover:text-ct-mute-2 hover:border-ct-teal/30'
        }`}
      >
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  );
}
