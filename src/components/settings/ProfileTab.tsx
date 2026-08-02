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
        <label className="block text-sm font-medium text-ct-mute-2 mb-2">Email address</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
          <input type="email" value={email} disabled className="w-full pl-12 pr-4 py-3 border border-ct-line rounded-ct-md bg-ct-surface-2 text-ct-mute cursor-not-allowed" />
        </div>
        <p className="mt-1 text-xs text-ct-mute">Email cannot be changed</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ct-mute-2 mb-2">Full name</label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" className="w-full pl-12 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal" />
        </div>
      </div>

      {isTradie && setBusinessName && (
        <div>
          <label className="block text-sm font-medium text-ct-mute-2 mb-2">Business name</label>
          <div className="relative">
            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
            <input type="text" value={businessName || ''} onChange={(e) => setBusinessName(e.target.value)} placeholder="Enter your business name" className="w-full pl-12 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal" />
          </div>
          <p className="mt-1 text-xs text-ct-mute">Shown to clients on your profile and invoices</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-ct-mute-2 mb-2">Phone number</label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ct-mute" />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter your phone number" className="w-full pl-12 pr-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-ct-mute-2 mb-2">Address</label>
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
        <label className="block text-sm font-medium text-ct-mute-2 mb-2">Postcode</label>
        <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Enter your postcode" className="w-full px-4 py-3 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal" />
      </div>

      {error && (
        <div className="p-4 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md">
          <p className="text-sm text-ct-rose">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-md flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-ct-teal animate-bounce" />
          <p className="text-sm text-ct-teal font-medium">Perfect! Your profile is up to date.</p>
        </div>
      )}

      <button type="submit" disabled={loading} className="w-full py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]">
        {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />Saving...</>) : 'Save changes'}
      </button>
    </form>
  );
}
