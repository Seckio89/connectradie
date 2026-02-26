import { useState, useEffect } from 'react';
import {
  FileText,
  Hash,
  ShieldCheck,
  Radar,
  Zap,
  Users,
  Truck,
  PenLine,
  Loader2,
  CheckCircle2,
  Info,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type TeamSize = 'Solo' | 'Small Team (2-5)' | 'Large Team (6+)';

const TEAM_SIZE_OPTIONS: TeamSize[] = ['Solo', 'Small Team (2-5)', 'Large Team (6+)'];

interface InfoTooltipProps {
  text: string;
}

function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="ml-1.5 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="More info"
      >
        <Info className="w-4 h-4" />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 animate-in fade-in duration-150">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}

export default function TradieProfessionalSettings() {
  const { user, profile, refreshProfile } = useAuth();

  const [abnNumber, setAbnNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [insurancePolicy, setInsurancePolicy] = useState(false);
  const [serviceRadius, setServiceRadius] = useState(20);
  const [isEmergencyAvailable, setIsEmergencyAvailable] = useState(false);
  const [teamSize, setTeamSize] = useState<TeamSize | ''>('');
  const [callOutFee, setCallOutFee] = useState('');
  const [showCalloutFee, setShowCalloutFee] = useState(true);
  const [calloutFeeWaived, setCalloutFeeWaived] = useState(false);
  const [bio, setBio] = useState('');

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [abnValidating, setAbnValidating] = useState(false);

  const suburb = profile?.address
    ? profile.address.split(',')[0]?.trim() || 'your location'
    : 'your location';

  useEffect(() => {
    if (profile) {
      setAbnNumber(profile.abn_number || '');
      setLicenseNumber(profile.license_number || '');
      setInsurancePolicy(profile.insurance_policy || false);
      setServiceRadius(profile.service_radius_km || 20);
      setIsEmergencyAvailable(profile.is_emergency_available || false);
      setTeamSize((profile.team_size as TeamSize) || '');
      setCallOutFee(profile.call_out_fee ? String(profile.call_out_fee) : '');
      setShowCalloutFee(profile.show_callout_fee ?? true);
      setCalloutFeeWaived(profile.callout_fee_waived_on_proceed ?? false);
      setBio(profile.bio || '');
    }
  }, [profile]);

  const handleAbnChange = (value: string) => {
    const digits = value.replace(/\s/g, '');
    if (digits.length <= 11 && /^\d*$/.test(digits)) {
      setAbnNumber(digits);
      if (digits.length === 11) {
        setAbnValidating(true);
        setTimeout(() => setAbnValidating(false), 1200);
      }
    }
  };

  const formatAbn = (value: string) => {
    const digits = value.replace(/\s/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError('');
    setSuccess(false);

    const updates: Record<string, unknown> = {
      abn_number: abnNumber || null,
      license_number: licenseNumber || null,
      insurance_policy: insurancePolicy,
      service_radius_km: serviceRadius,
      is_emergency_available: isEmergencyAvailable,
      team_size: teamSize || null,
      call_out_fee: callOutFee ? parseInt(callOutFee, 10) : null,
      show_callout_fee: showCalloutFee,
      callout_fee_waived_on_proceed: calloutFeeWaived,
      bio: bio || null,
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      setError('Failed to save. Please try again.');
    } else {
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 md:p-8">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Business Details</h3>
              <p className="text-xs text-gray-500">Builds trust with potential clients</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              ABN (Australian Business Number)
              <InfoTooltip text="Your 11-digit ABN is verified against the ABR" />
            </label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={formatAbn(abnNumber)}
                onChange={(e) => handleAbnChange(e.target.value.replace(/\s/g, ''))}
                placeholder="51 824 753 556"
                maxLength={14}
                className="w-full pl-12 pr-12 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
              {abnValidating && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <span className="text-xs text-blue-600 font-medium">Validating...</span>
                </div>
              )}
              {!abnValidating && abnNumber.length === 11 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              License Number
              <InfoTooltip text="Your trade license number for verification" />
            </label>
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g., 123456C"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">I have valid Public Liability Insurance</p>
                <p className="text-xs text-gray-500 mt-0.5">Displayed as a trust badge on your profile</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInsurancePolicy(!insurancePolicy)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                insurancePolicy ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  insurancePolicy ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
              <Radar className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Operational Settings</h3>
              <p className="text-xs text-gray-500">Controls which leads you receive</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-6">
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-3">
              Service Radius
              <InfoTooltip text="We use this to filter job notifications" />
            </label>
            <div className="space-y-3">
              <input
                type="range"
                min={5}
                max={50}
                step={1}
                value={serviceRadius}
                onChange={(e) => setServiceRadius(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-teal-600 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">5km</span>
                <span className="text-xs text-gray-400">50km</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <MapPin className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <p className="text-sm text-teal-800">
                  You will receive leads within <span className="font-bold">{serviceRadius}km</span> of <span className="font-bold">{suburb}</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Available for 24/7 Emergency Jobs</p>
                <p className="text-xs text-gray-600 mt-0.5">You'll be prioritized for urgent after-hours call-outs</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEmergencyAvailable(!isEmergencyAvailable)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                isEmergencyAvailable ? 'bg-amber-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  isEmergencyAvailable ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-100 rounded-lg flex items-center justify-center">
              <PenLine className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">About the Business</h3>
              <p className="text-xs text-gray-500">Help clients understand your services</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              Team Size
              <InfoTooltip text="Helps clients gauge your capacity" />
            </label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value as TeamSize)}
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-shadow"
              >
                <option value="">Select team size...</option>
                {TEAM_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              Standard Call-Out Fee
              <InfoTooltip text="Shown to clients before they book" />
            </label>
            <div className="relative">
              <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
              <input
                type="number"
                min={0}
                value={callOutFee}
                onChange={(e) => setCallOutFee(e.target.value)}
                placeholder="e.g., 80"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {callOutFee && (
            <div className="space-y-3 pl-1">
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Show callout fee to clients</p>
                    <p className="text-xs text-gray-500 mt-0.5">Displayed on your public profile card</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalloutFee(!showCalloutFee)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    showCalloutFee ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      showCalloutFee ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {showCalloutFee && (
                <div className="flex items-center justify-between p-3.5 bg-green-50/60 rounded-xl border border-green-200">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Waived if client proceeds</p>
                      <p className="text-xs text-gray-500 mt-0.5">Shows "Waived if you proceed" next to the fee</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalloutFeeWaived(!calloutFeeWaived)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                      calloutFeeWaived ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                        calloutFeeWaived ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center text-sm font-medium text-gray-700">
                Short Bio
                <InfoTooltip text="A brief pitch shown on your public profile" />
              </label>
              <span className={`text-xs font-medium ${bio.length > 140 ? 'text-red-500' : bio.length > 120 ? 'text-amber-500' : 'text-gray-400'}`}>
                {bio.length}/140
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => {
                if (e.target.value.length <= 140) setBio(e.target.value);
              }}
              placeholder="e.g., Specializing in heritage renovations with 15+ years experience..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-sm text-green-600 font-medium">Professional settings saved successfully.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving || bio.length > 140}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Professional Settings'
        )}
      </button>
    </form>
  );
}
