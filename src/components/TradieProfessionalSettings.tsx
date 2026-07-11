import { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Hash,
  ShieldCheck,
  Radar,
  Zap,
  Users,
  PenLine,
  Loader2,
  CheckCircle2,
  Info,
  MapPin,
  GraduationCap,
  Calendar,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ALL_TRADES, TOP_10_TRADES, normalizeTradeName, AUSTRALIAN_STATES, getLicensingRequirements, isLicenseRequiredForTrade, type AustralianState } from '../lib/licensingRequirements';
import SearchableSelect from './SearchableSelect';

type TeamSize = 'Solo' | 'Small Team (2-5)' | 'Large Team (6+)';

const TEAM_SIZE_OPTIONS: TeamSize[] = ['Solo', 'Small Team (2-5)', 'Large Team (6+)'];

// Business timezone — used to stamp the local date on auto-logged (geofence)
// timesheet entries. Australian zones only.
const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Australia/Sydney', label: 'Sydney / Canberra (NSW, ACT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (VIC)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (QLD)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (SA)' },
  { value: 'Australia/Perth', label: 'Perth (WA)' },
  { value: 'Australia/Hobart', label: 'Hobart (TAS)' },
  { value: 'Australia/Darwin', label: 'Darwin (NT)' },
];

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
  const [licenseState, setLicenseState] = useState<AustralianState | ''>('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [isApprentice, setIsApprentice] = useState(false);
  const [supervisorLicense, setSupervisorLicense] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [insurancePolicy, setInsurancePolicy] = useState(false);
  const [serviceRadius, setServiceRadius] = useState(20);
  const [isEmergencyAvailable, setIsEmergencyAvailable] = useState(false);
  const [autoCompleteSessions, setAutoCompleteSessions] = useState(true);
  const [teamSize, setTeamSize] = useState<TeamSize | ''>('');
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [callOutFee, setCallOutFee] = useState('');
  const [showCalloutFee, setShowCalloutFee] = useState(true);
  const [calloutFeeWaived, setCalloutFeeWaived] = useState(false);
  const [bio, setBio] = useState('');
  const [isGstRegistered, setIsGstRegistered] = useState(false);

  const [selectedTrade, setSelectedTrade] = useState(profile?.declared_trades?.[0] || '');
  const [tradeSaving, setTradeSaving] = useState(false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [abnValidating, setAbnValidating] = useState(false);

  const suburb = profile?.address
    ? profile.address.split(',')[0]?.trim() || 'your location'
    : 'your location';

  const primaryTrade = selectedTrade;

  const licensingHint = useMemo(() => {
    if (!licenseState) return null;
    return getLicensingRequirements(licenseState as AustralianState, primaryTrade);
  }, [licenseState, primaryTrade]);

  const licenseRequired = useMemo(() => {
    if (!licenseState || !primaryTrade) return true;
    return isLicenseRequiredForTrade(licenseState as AustralianState, primaryTrade);
  }, [licenseState, primaryTrade]);

  useEffect(() => {
    if (profile) {
      setSelectedTrade(profile.declared_trades?.[0] || '');
      setAbnNumber(profile.abn_number || '');
      setLicenseNumber(profile.license_number || '');
      setLicenseState((profile.license_state as AustralianState) || '');
      setLicenseExpiry(profile.license_expiry || '');
      setIsApprentice(profile.is_apprentice || false);
      setSupervisorLicense(profile.supervisor_license || '');
      setSupervisorName(profile.supervisor_name || '');
      setInsurancePolicy(profile.insurance_policy || false);
      setServiceRadius(profile.service_radius_km || 20);
      setIsEmergencyAvailable(profile.is_emergency_available || false);
      setAutoCompleteSessions(profile.auto_complete_sessions ?? true);
      setTeamSize((profile.team_size as TeamSize) || '');
      setTimezone(profile.timezone || 'Australia/Sydney');
      setCallOutFee(profile.call_out_fee ? String(profile.call_out_fee) : '');
      setShowCalloutFee(profile.show_callout_fee ?? true);
      setCalloutFeeWaived(profile.callout_fee_waived_on_proceed ?? false);
      setBio(profile.bio || '');
      setIsGstRegistered(profile.is_gst_registered || false);
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

  const handleTradeChange = async (tradeValue: string) => {
    const prev = selectedTrade;
    setSelectedTrade(tradeValue);
    if (!user) return;

    setTradeSaving(true);
    const { error: tradeError } = await supabase
      .from('profiles')
      .update({ declared_trades: tradeValue ? [tradeValue] : [] })
      .eq('id', user.id);

    if (tradeError) {
      setSelectedTrade(prev); // revert on failure
    } else {
      await refreshProfile();
    }
    setTradeSaving(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError('');
    setSuccess(false);

    const updates: Record<string, unknown> = {
      abn_number: abnNumber || null,
      license_number: !licenseRequired || isApprentice ? null : licenseNumber || null,
      license_state: licenseState || null,
      license_expiry: !licenseRequired ? null : licenseExpiry || null,
      insurance_policy: insurancePolicy,
      service_radius_km: serviceRadius,
      is_emergency_available: isEmergencyAvailable,
      auto_complete_sessions: autoCompleteSessions,
      team_size: teamSize || null,
      timezone: timezone || 'Australia/Sydney',
      call_out_fee: callOutFee ? parseInt(callOutFee, 10) : null,
      show_callout_fee: showCalloutFee,
      callout_fee_waived_on_proceed: calloutFeeWaived,
      bio: bio || null,
      is_gst_registered: isGstRegistered,
    };

    // Only include licensing columns if the migration has been applied
    // (profile will have the field as a boolean rather than undefined)
    if (typeof profile?.is_apprentice !== 'undefined') {
      updates.is_apprentice = licenseRequired ? isApprentice : false;
      updates.supervisor_license = licenseRequired && isApprentice ? supervisorLicense || null : null;
      updates.supervisor_name = licenseRequired && isApprentice ? supervisorName || null : null;
      updates.is_license_required = licenseRequired;
    }

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
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 p-3 sm:p-6 md:p-8">
      {/* ── Trade Service Selector ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">What trade service are you providing?</h3>
              <p className="text-xs text-gray-500">This determines your licensing requirements</p>
            </div>
            {tradeSaving && <Loader2 className="w-4 h-4 text-primary-500 animate-spin ml-auto" />}
          </div>
        </div>
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Popular trades</label>
            <div className="flex flex-wrap gap-2">
              {TOP_10_TRADES.map((trade) => {
                const isSelected = selectedTrade === trade.value;
                return (
                  <button
                    key={trade.value}
                    type="button"
                    onClick={() => handleTradeChange(isSelected ? '' : trade.value)}
                    disabled={tradeSaving}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                      isSelected
                        ? 'bg-warm-500 text-white border-primary-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:bg-primary-50'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                    {trade.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Or search all trades</label>
            <SearchableSelect
              options={ALL_TRADES}
              value={selectedTrade}
              onChange={handleTradeChange}
              placeholder="Search for your trade..."
              icon={<Wrench className="w-5 h-5" />}
            />
          </div>

          {selectedTrade && (
            <div className="flex items-center gap-2 p-3 bg-primary-50 border border-primary-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-primary-600 flex-shrink-0" />
              <p className="text-sm text-primary-800">
                Selected: <strong>{normalizeTradeName(selectedTrade)}</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Business Details ───────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-secondary-100 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Business Details</h3>
              <p className="text-xs text-gray-500">Builds trust with potential clients</p>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-5">
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
                className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
              {abnValidating && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                  <span className="text-xs text-secondary-600 font-medium">Validating...</span>
                </div>
              )}
              {!abnValidating && abnNumber.length === 11 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              )}
            </div>
          </div>

          {/* GST Registration */}
          <label className="flex items-center gap-3 cursor-pointer border border-gray-200 rounded-xl p-3 sm:p-4 hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={isGstRegistered}
              onChange={(e) => setIsGstRegistered(e.target.checked)}
              className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 flex-shrink-0"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-700">GST Registered</span>
              <p className="text-xs text-gray-400 mt-0.5">
                Required if your annual turnover exceeds $75,000. When enabled, 10% GST will be added to your quoted prices at checkout.
              </p>
            </div>
          </label>

          {/* Issuing State */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              Issuing State / Territory
              <InfoTooltip text="The state that issued your trade license" />
            </label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={licenseState}
                onChange={(e) => setLicenseState(e.target.value as AustralianState)}
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-white transition-shadow"
              >
                <option value="">Select state...</option>
                {AUSTRALIAN_STATES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Licensing hint — specialist / threshold / exempt */}
          {licensingHint && (
            <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${
              licensingHint.exempt
                ? 'bg-green-50 border-green-200'
                : 'bg-secondary-50 border-secondary-200'
            }`}>
              <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                licensingHint.exempt
                  ? 'text-green-500'
                  : 'text-secondary-500'
              }`} />
              <div>
                <p className={`text-sm ${
                  licensingHint.exempt
                    ? 'text-green-700'
                    : 'text-secondary-700'
                }`}>
                  {licensingHint.hint}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Managed by {licensingHint.authority}
                </p>
              </div>
            </div>
          )}

          {/* Exempt trade — show trust reminder instead of license fields */}
          {licensingHint?.exempt && (
            <div className="flex items-start gap-2.5 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700">
                Your verified <strong>ABN</strong> is sufficient for {normalizeTradeName(primaryTrade) || 'your trade'} in {licenseState}. We recommend also adding <strong>Public Liability Insurance</strong> to boost your trust score.
              </p>
            </div>
          )}

          {/* Only show license / apprentice fields when the trade requires licensing */}
          {licenseRequired && (
            <>
              {/* Apprentice toggle */}
              <div className="flex items-center justify-between p-3 sm:p-4 bg-warm-50 rounded-xl border border-warm-200">
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-5 h-5 text-warm-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">I am an Apprentice</p>
                    <p className="text-xs text-gray-500 mt-0.5">Apprentices must be linked to a qualified supervisor</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsApprentice(!isApprentice)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warm-500 focus:ring-offset-2 ${
                    isApprentice ? 'bg-warm-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      isApprentice ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Conditional license fields */}
              {isApprentice ? (
                <div className="space-y-4 pl-1 border-l-2 border-warm-200 ml-2">
                  <div className="pl-4">
                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                      Supervisor&apos;s License Number
                      <InfoTooltip text="The license number of your supervising contractor" />
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={supervisorLicense}
                        onChange={(e) => setSupervisorLicense(e.target.value)}
                        placeholder="e.g., 123456C"
                        className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                      />
                    </div>
                  </div>
                  <div className="pl-4">
                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                      Supervisor&apos;s Name
                      <InfoTooltip text="Full name of the license holder supervising your work" />
                    </label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={supervisorName}
                        onChange={(e) => setSupervisorName(e.target.value)}
                        placeholder="e.g., John Smith"
                        className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    Contractor License Number
                    <InfoTooltip text="Your trade license number for verification" />
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="e.g., 123456C"
                      className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                    />
                  </div>
                </div>
              )}

              {/* License expiry */}
              <div>
                <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  License Expiry Date
                  <InfoTooltip text="We'll remind you before your license expires" />
                </label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={licenseExpiry}
                    onChange={(e) => setLicenseExpiry(e.target.value)}
                    className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-xl border border-gray-200">
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
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
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
        <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-secondary-100 rounded-lg flex items-center justify-center">
              <Radar className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Operational Settings</h3>
              <p className="text-xs text-gray-500">Controls which leads you receive</p>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-5 space-y-4 sm:space-y-6">
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
                className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer warm-secondary-600 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-secondary-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">5km</span>
                <span className="text-xs text-gray-400">50km</span>
              </div>
              <p className="text-xs text-gray-500">
                You will receive leads within <span className="font-semibold">{serviceRadius}km</span> of <span className="font-semibold">{suburb}</span>.
              </p>
            </div>
          </div>

          {/* Business timezone — stamps the local day on auto-logged timesheet hours */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
              Business timezone
              <InfoTooltip text="Used to record the correct local day on automatically-logged (on-site check-in) timesheet hours" />
            </label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-white transition-shadow"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-warm-50 to-warm-50 rounded-xl border border-warm-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warm-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-warm-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Available for 24/7 Emergency Jobs</p>
                <p className="text-xs text-gray-600 mt-0.5">You'll be prioritized for urgent after-hours call-outs</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEmergencyAvailable(!isEmergencyAvailable)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warm-500 focus:ring-offset-2 ${
                isEmergencyAvailable ? 'bg-warm-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  isEmergencyAvailable ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-secondary-50 to-secondary-50 rounded-xl border border-secondary-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-secondary-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Auto-complete recurring sessions</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {autoCompleteSessions
                    ? "On — sessions auto-complete after their scheduled end time."
                    : "Off — you'll be asked to confirm each visit before it counts as completed."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoCompleteSessions(!autoCompleteSessions)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2 ${
                autoCompleteSessions ? 'bg-secondary-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  autoCompleteSessions ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-secondary-100 rounded-lg flex items-center justify-center">
              <PenLine className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">About the Business</h3>
              <p className="text-xs text-gray-500">Help clients understand your services</p>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-5">
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
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-white transition-shadow"
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
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center text-sm font-medium text-gray-700">
                Short Bio
                <InfoTooltip text="A brief pitch shown on your public profile" />
              </label>
              <span className={`text-xs font-medium ${bio.length > 140 ? 'text-red-500' : bio.length > 120 ? 'text-warm-500' : 'text-gray-400'}`}>
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
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none transition-shadow"
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
        className="w-full py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
