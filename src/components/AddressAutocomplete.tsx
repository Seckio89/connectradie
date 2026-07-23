import { useRef, useCallback, useEffect, useState } from 'react';
import { MapPin, X, AlertCircle, Loader2 } from 'lucide-react';
import { useLoadScript } from '@react-google-maps/api';

// ─────────────────────────────────────────────────────────────────────────────
// Address autocomplete — migrated off google.maps.places.Autocomplete, which
// Google closed to new customers on 1 March 2025.
//
// We use the HEADLESS replacement (AutocompleteSuggestion + Place.fetchFields)
// rather than the PlaceAutocompleteElement web component, because that element
// renders its own input inside shadow DOM — we'd lose the MapPin icon, the clear
// button and every Tailwind style this field shares with the rest of the app.
// Fetching suggestions ourselves keeps the markup below byte-identical to what
// shipped before; only the data source changed.
// ─────────────────────────────────────────────────────────────────────────────

const libraries: ('places')[] = ['places'];
const DEFAULT_SEARCH_TYPES = ['geocode'];
const DEBOUNCE_MS = 250;

// Minimal shapes for the Places (New) API. The installed @types/google.maps may
// predate these classes, and CLAUDE.md forbids `any`, so we describe just what
// we touch and narrow through `unknown`.
interface PlaceLike {
  formattedAddress?: string | null;
  location?: { lat: number | (() => number); lng: number | (() => number) } | null;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[] | null;
  fetchFields(options: { fields: string[] }): Promise<unknown>;
}
interface PlacePredictionLike {
  placeId?: string;
  text?: { toString(): string };
  toPlace(): PlaceLike;
}
interface PlacesNamespace {
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions(
      request: Record<string, unknown>,
    ): Promise<{ suggestions?: { placePrediction?: PlacePredictionLike | null }[] }>;
  };
  AutocompleteSessionToken?: new () => object;
}

interface Suggestion {
  key: string;
  label: string;
  prediction: PlacePredictionLike;
}

export interface AddressDetails {
  suburb?: string;
  postcode?: string;
  state?: string;
  lat?: number;
  lng?: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, coordinates?: { lat: number; lng: number }, details?: AddressDetails) => void;
  placeholder?: string;
  className?: string;
  searchTypes?: string[];
}

const readLatLng = (loc: PlaceLike['location']): { lat: number; lng: number } | undefined => {
  if (!loc) return undefined;
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : undefined;
};

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing an address...',
  className = '',
  searchTypes = DEFAULT_SEARCH_TYPES,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // One session token per lookup session; cleared after a place is picked so
  // Google bills a session rather than per keystroke.
  const sessionTokenRef = useRef<object | null>(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [busy, setBusy] = useState(false);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
    version: 'weekly', // AutocompleteSuggestion needs a current Maps JS release
  });

  const getPlaces = (): PlacesNamespace =>
    ((window.google?.maps?.places ?? {}) as unknown) as PlacesNamespace;

  const closeList = useCallback(() => {
    setOpen(false);
    setHighlighted(-1);
  }, []);

  // Close on outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) closeList();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [closeList]);

  // Debounced suggestion fetch.
  useEffect(() => {
    if (!isLoaded || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const places = getPlaces();
      if (!places.AutocompleteSuggestion) return; // older Maps build — stays a plain input
      setBusy(true);
      try {
        if (!sessionTokenRef.current && places.AutocompleteSessionToken) {
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        }
        const base: Record<string, unknown> = {
          input: query,
          includedRegionCodes: ['au'],
          ...(sessionTokenRef.current ? { sessionToken: sessionTokenRef.current } : {}),
        };
        let response;
        try {
          response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            ...base,
            includedPrimaryTypes: searchTypes,
          });
        } catch {
          // Not every type filter is accepted by the new API — retry unfiltered
          // rather than leaving the user with no suggestions at all.
          response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(base);
        }
        if (cancelled) return;
        const list: Suggestion[] = (response?.suggestions ?? [])
          .map((s) => s.placePrediction)
          .filter((p): p is PlacePredictionLike => !!p)
          .map((p, i) => ({
            key: p.placeId || `sugg-${i}`,
            label: p.text?.toString() ?? '',
            prediction: p,
          }))
          .filter((s) => s.label);
        setSuggestions(list);
        setOpen(list.length > 0);
        setHighlighted(-1);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isLoaded, searchTypes]);

  const selectSuggestion = useCallback(
    async (s: Suggestion) => {
      closeList();
      setQuery('');
      if (inputRef.current) inputRef.current.value = s.label;
      try {
        const place = s.prediction.toPlace();
        await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });

        const components = place.addressComponents ?? [];
        const find = (type: string) => components.find((c) => c.types?.includes(type));
        const long = (type: string) => find(type)?.longText || undefined;
        const short = (type: string) => find(type)?.shortText || undefined;

        const coordinates = readLatLng(place.location);
        const details: AddressDetails = {
          suburb: long('locality') || long('sublocality_level_1') || long('neighborhood'),
          postcode: long('postal_code'),
          state: short('administrative_area_level_1'),
          ...coordinates,
        };

        const formatted = place.formattedAddress || s.label;
        if (inputRef.current) inputRef.current.value = formatted;
        onChange(formatted, coordinates, details);
      } catch {
        // Detail lookup failed — keep the text the user picked so the form still works.
        onChange(s.label);
      } finally {
        sessionTokenRef.current = null; // end the billing session
      }
    },
    [closeList, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      if (highlighted >= 0) {
        e.preventDefault();
        void selectSuggestion(suggestions[highlighted]);
      }
    } else if (e.key === 'Escape') {
      closeList();
    }
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setSuggestions([]);
    closeList();
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  };

  // Plain input used by every non-autocomplete state, so the field looks the
  // same whether or not Places is available.
  const plainInput = (disabled = false, ph = placeholder) => (
    <div className="relative">
      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        disabled={disabled}
        value={disabled ? undefined : value}
        onChange={disabled ? undefined : (e) => onChange(e.target.value)}
        placeholder={ph}
        className={`w-full pl-12 pr-10 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 ${disabled ? 'bg-gray-50' : ''} ${className}`}
      />
      {!disabled && value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  if (!apiKey) {
    return (
      <div>
        {plainInput()}
        <div className="mt-2 flex items-start gap-2 text-sm text-warm-600 bg-warm-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>Address autocomplete unavailable. Add VITE_GOOGLE_MAPS_API_KEY to enable suggestions.</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        {plainInput()}
        <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>Failed to load Google Maps. Please check your API key and try again.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return plainInput(true, 'Loading address service...');
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          defaultValue={value}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="address-suggestions"
          className={`w-full pl-12 pr-10 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
        />
        {busy && !value && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 animate-spin" />
        )}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id="address-suggestions"
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden max-h-64 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li key={s.key} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => void selectSuggestion(s)}
                className={`w-full text-left flex items-start gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors ${i === highlighted ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
              >
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="min-w-0">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
