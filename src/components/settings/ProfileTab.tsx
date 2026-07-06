import { User, Phone, Mail, Loader2, CheckCircle2, Building2 } from 'lucide-react';
import AddressAutocomplete from '../AddressAutocomplete';

interface ProfileTabProps {
  email: string;
  fullName: string;
  setFullName: (v: string) => void;
  businessName?: string;
  setBusinessName?: (v: string) => void;
  isTradie?: boolean;
  phone: string;
  setPhone: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  /** Called with the picked address's coordinates (or null if typed by hand). */
  onAddressCoords?: (coords: { lat: number; lng: number } | null) => void;
  postcode: string;
  setPostcode: (v: string) => void;
  loading: boolean;
  success: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ProfileTab({
  email, fullName, setFullName, businessName, setBusinessName, isTradie,
  phone, setPhone,
  address, setAddress, onAddressCoords, postcode, setPostcode,
  loading, success, error, onSubmit,
}: ProfileTabProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6 p-6 md:p-8" aria-label="ConnecTradie Profile Settings">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="email" value={email} disabled className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed" />
        </div>
        <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      {isTradie && setBusinessName && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
          <div className="relative">
            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={businessName || ''} onChange={(e) => setBusinessName(e.target.value)} placeholder="Enter your business name" className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <p className="mt-1 text-xs text-gray-500">Shown to clients on your profile and invoices</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter your phone number" className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
        <AddressAutocomplete
          value={address}
          onChange={(value, coordinates) => {
            setAddress(value);
            onAddressCoords?.(coordinates ?? null);
          }}
          placeholder="Start typing your address..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Postcode</label>
        <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Enter your postcode" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-green-600 animate-bounce" />
          <p className="text-sm text-green-600 font-medium">Perfect! Your profile is up to date.</p>
        </div>
      )}

      <button type="submit" disabled={loading} className="w-full py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]">
        {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />Saving...</>) : 'Save Changes'}
      </button>
    </form>
  );
}
