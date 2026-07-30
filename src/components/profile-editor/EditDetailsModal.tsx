import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface EditDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValues: {
    businessName: string;
    hourlyRate: number | null;
    callOutFee: number | null;
    showCalloutFee: boolean;
    calloutFeeWaived: boolean;
    contractorType: string;
    teamSize: string | null;
    qualifications: string[];
    serviceRadius: number;
    isEmergencyAvailable: boolean;
  };
  onSave: (values: {
    businessName: string;
    hourlyRate: number | null;
    callOutFee: number | null;
    showCalloutFee: boolean;
    calloutFeeWaived: boolean;
    contractorType: string;
    teamSize: string;
    qualifications: string[];
    serviceRadius: number;
    isEmergencyAvailable: boolean;
  }) => Promise<void>;
}

const TEAM_SIZE_OPTIONS = ['Solo', 'Small Team (2-5)', 'Large Team (6+)'];
const CONTRACTOR_TYPES = ['Solo', 'Company', 'Labour Hire'];

export default function EditDetailsModal({ isOpen, onClose, currentValues, onSave }: EditDetailsModalProps) {
  const [businessName, setBusinessName] = useState(currentValues.businessName || '');
  const [hourlyRate, setHourlyRate] = useState(currentValues.hourlyRate?.toString() || '');
  // Not editable in this modal — no control binds to them, so they are passed
  // straight back through on save. Plain consts, not state: nothing can change them.
  const callOutFee = currentValues.callOutFee?.toString() || '';
  const showCalloutFee = currentValues.showCalloutFee;
  const calloutFeeWaived = currentValues.calloutFeeWaived;
  const [contractorType, setContractorType] = useState(currentValues.contractorType || 'Solo');
  const [teamSize, setTeamSize] = useState(currentValues.teamSize || 'Solo');
  const [qualifications, setQualifications] = useState(currentValues.qualifications.join(', '));
  const [serviceRadius, setServiceRadius] = useState(currentValues.serviceRadius.toString());
  const [isEmergencyAvailable, setIsEmergencyAvailable] = useState(currentValues.isEmergencyAvailable);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const quals = qualifications
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean);

      await onSave({
        businessName: businessName.trim(),
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        callOutFee: callOutFee ? parseFloat(callOutFee) : null,
        showCalloutFee,
        calloutFeeWaived,
        contractorType,
        teamSize,
        qualifications: quals,
        serviceRadius: parseInt(serviceRadius) || 20,
        isEmergencyAvailable,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
      <div
        className="bg-ct-surface rounded-ct-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ct-line-soft flex-shrink-0">
          <h3 className="text-lg font-semibold text-ct-paper">Edit Details</h3>
          <button
            onClick={onClose}
            className="p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Happy Phoenix Cleaning Services"
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm"
            />
            <p className="text-xs text-ct-mute mt-1">This is shown to clients on your profile and invoices</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Hourly Rate ($)</label>
            <input
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              min="0"
              placeholder="e.g. 85"
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Business Type</label>
            <select
              value={contractorType}
              onChange={(e) => setContractorType(e.target.value)}
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm bg-ct-surface"
            >
              {CONTRACTOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Team Size</label>
            <select
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm bg-ct-surface"
            >
              {TEAM_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Service Radius (km)</label>
            <input
              type="number"
              value={serviceRadius}
              onChange={(e) => setServiceRadius(e.target.value)}
              min="1"
              max="200"
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Qualifications</label>
            <input
              type="text"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="e.g. Cert III Plumbing, Gas Fitting License"
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal text-sm"
            />
            <p className="text-xs text-ct-mute mt-1">Separate multiple qualifications with commas</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isEmergencyAvailable}
              onChange={(e) => setIsEmergencyAvailable(e.target.checked)}
              className="w-4 h-4 text-ct-mute-2 border-ct-line rounded-ct-xs focus:ring-ct-teal"
            />
            <span className="text-sm text-ct-mute-2 font-medium">Available for emergency call-outs</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ct-line-soft bg-ct-surface-2 rounded-b-ct-xl flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-ct-mute-2 hover:bg-ct-line rounded-ct-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink text-sm font-semibold rounded-ct-sm hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
