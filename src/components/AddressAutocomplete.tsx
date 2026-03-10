import { useState, useEffect, useRef } from 'react';
import { MapPin, X, AlertCircle } from 'lucide-react';
import { useLoadScript } from '@react-google-maps/api';

const libraries: ('places')[] = ['places'];
const DEFAULT_SEARCH_TYPES = ['address'];

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
  const [isFocused, setIsFocused] = useState(false);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const mapDiv = useRef<HTMLDivElement | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  useEffect(() => {
    if (isLoaded && window.google) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();

      if (!mapDiv.current) {
        mapDiv.current = document.createElement('div');
      }
      placesService.current = new window.google.maps.places.PlacesService(mapDiv.current);
    }
  }, [isLoaded]);

  useEffect(() => {
    if (!value || value.length < 3 || !autocompleteService.current) {
      setPredictions([]);
      return;
    }

    let cancelled = false;

    const fetchPredictions = () => {
      try {
        autocompleteService.current?.getPlacePredictions(
          {
            input: value,
            componentRestrictions: { country: 'au' },
            types: searchTypes,
          },
          (results, status) => {
            if (cancelled) return;
            if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
              setPredictions(results);
            } else {
              setPredictions([]);
            }
          }
        );
      } catch {
        if (!cancelled) setPredictions([]);
      }
    };

    const timeoutId = setTimeout(fetchPredictions, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [value, searchTypes]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAddress = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current) {
      onChange(prediction.description);
      setIsFocused(false);
      return;
    }

    placesService.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['geometry', 'formatted_address', 'address_components'],
      },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          const coordinates = place.geometry?.location
            ? {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
              }
            : undefined;

          const components = place.address_components || [];
          const getComponent = (type: string) =>
            components.find(c => c.types.includes(type))?.long_name;
          const getShortComponent = (type: string) =>
            components.find(c => c.types.includes(type))?.short_name;

          const details: AddressDetails = {
            suburb: getComponent('locality') || getComponent('sublocality_level_1') || getComponent('neighborhood'),
            postcode: getComponent('postal_code'),
            state: getShortComponent('administrative_area_level_1'),
            ...coordinates,
          };

          onChange(place.formatted_address || prediction.description, coordinates, details);
        } else {
          onChange(prediction.description);
        }
        setIsFocused(false);
        setPredictions([]);
      }
    );
  };

  const handleClear = () => {
    onChange('');
    setPredictions([]);
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
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
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

      {isFocused && predictions.length > 0 && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectAddress(prediction)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">
                  {prediction.structured_formatting.main_text}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {prediction.structured_formatting.secondary_text}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {isFocused && value && value.length >= 3 && predictions.length === 0 && isLoaded && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
          <p className="text-sm text-gray-500 text-center">No addresses found</p>
        </div>
      )}
    </div>
  );
}
