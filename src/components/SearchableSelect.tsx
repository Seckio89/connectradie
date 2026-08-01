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
        className="flex items-center gap-3 w-full px-4 py-3 border border-ct-line rounded-ct-md bg-ct-surface cursor-pointer hover:border-ct-line transition-colors"
      >
        {icon && <span className="flex-shrink-0 text-ct-mute">{icon}</span>}
        {!open ? (
          <span className={`flex-1 text-left truncate ${value ? 'text-ct-paper' : 'text-ct-mute'}`}>
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
            className="flex-1 bg-transparent outline-none text-ct-paper placeholder-ct-placeholder"
          />
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && clearable && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-ct-surface-2 rounded-ct-xs transition-colors"
            >
              <X className="w-4 h-4 text-ct-mute" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-ct-mute transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-ct-surface rounded-ct-md shadow-lg border border-ct-line z-50 max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ct-mute">No matches — try a different spelling or fewer words.</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full px-4 py-3 text-left text-sm transition-colors min-h-[44px] flex items-center ${
                  option.value === value
                    ? 'bg-ct-amber/[0.13] text-ct-amber font-medium'
                    : 'text-ct-mute-2 hover:bg-ct-surface-2'
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
