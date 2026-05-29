import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface SearchableSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  clearable?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  icon,
  className = '',
  clearable = true,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = options.find((o) => o.value === value)?.label || '';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-4 py-3 border border-gray-200 rounded-xl bg-white cursor-pointer hover:border-gray-300 transition-colors"
      >
        {icon && <span className="flex-shrink-0 text-gray-400">{icon}</span>}
        {!open ? (
          <span className={`flex-1 text-left truncate ${value ? 'text-gray-900' : 'text-gray-500'}`}>
            {selectedLabel || placeholder}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={selectedLabel || placeholder}
            className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
          />
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && clearable && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">No results found</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full px-4 py-3 text-left text-sm transition-colors min-h-[44px] flex items-center ${
                  option.value === value
                    ? 'bg-warm-50 text-warm-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
