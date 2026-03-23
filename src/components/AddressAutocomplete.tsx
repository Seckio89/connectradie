import { useRef, useCallback } from 'react';
import { MapPin, X, AlertCircle } from 'lucide-react';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';

const libraries: ('places')[] = ['places'];
const DEFAULT_SEARCH_TYPES = ['geocode'];

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

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing an address...',
  className = '',
  searchTypes = DEFAULT_SEARCH_TYPES,
}: AddressAutocompleteProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  const handleLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place) return;

    const location = place.geometry?.location;
    const coordinates = location
      ? { lat: location.lat(), lng: location.lng() }
      : undefined;

    const components = place.address_components || [];
    const getComponent = (type: string) =>
      components.find((c) => c.types.includes(type))?.long_name;
    const getShortComponent = (type: string) =>
      components.find((c) => c.types.includes(type))?.short_name;

    const details: AddressDetails = {
      suburb: getComponent('locality') || getComponent('sublocality_level_1') || getComponent('neighborhood'),
      postcode: getComponent('postal_code'),
      state: getShortComponent('administrative_area_level_1'),
      ...coordinates,
    };

    onChange(place.formatted_address || inputRef.current?.value || '', coordinates, details);
  }, [onChange]);

  const handleClear = () => {
    onChange('');
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  };

  if (!apiKey) {
    return (
      <div>
        <div className="relative">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full pl-12 pr-10 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
          />
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
        <div className="relative">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full pl-12 pr-10 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
          />
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
        <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>Failed to load Google Maps. Please check your API key and try again.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          disabled
          placeholder="Loading address service..."
          className={`w-full pl-12 pr-10 py-3 border border-gray-200 rounded-xl bg-gray-50 ${className}`}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <Autocomplete
        onLoad={handleLoad}
        onPlaceChanged={handlePlaceChanged}
        options={{
          componentRestrictions: { country: 'au' },
          types: searchTypes,
          fields: ['formatted_address', 'geometry', 'address_components'],
        }}
      >
        <div className="relative">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            defaultValue={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full pl-12 pr-10 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
          />
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
      </Autocomplete>
    </div>
  );
}
