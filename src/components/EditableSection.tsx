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
        className={`absolute top-3 right-3 p-2 rounded-lg shadow-sm opacity-0 group-hover/edit:opacity-100 focus:opacity-100 transition-all duration-200 z-10 ${
          dark
            ? 'bg-white/20 backdrop-blur-sm border border-white/20 text-white hover:bg-white/30'
            : 'bg-white border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-300'
        }`}
      >
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  );
}
