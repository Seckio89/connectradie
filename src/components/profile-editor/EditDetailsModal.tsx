import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface EditDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValues: {
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
  const [hourlyRate, setHourlyRate] = useState(currentValues.hourlyRate?.toString() || '');
  const [callOutFee, setCallOutFee] = useState(currentValues.callOutFee?.toString() || '');
  const [showCalloutFee, setShowCalloutFee] = useState(currentValues.showCalloutFee);
  const [calloutFeeWaived, setCalloutFeeWaived] = useState(currentValues.calloutFeeWaived);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">Edit Details</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Hourly Rate ($)</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                min="0"
                placeholder="e.g. 85"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Call-out Fee ($)</label>
              <input
                type="number"
                value={callOutFee}
                onChange={(e) => setCallOutFee(e.target.value)}
                min="0"
                placeholder="e.g. 80"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
            </div>
          </div>

          {callOutFee && (
            <div className="space-y-3 pl-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCalloutFee}
                  onChange={(e) => setShowCalloutFee(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show call-out fee on my profile</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calloutFeeWaived}
                  onChange={(e) => setCalloutFeeWaived(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Waived if client proceeds with work</span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Type</label>
            <select
              value={contractorType}
              onChange={(e) => setContractorType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white"
            >
              {CONTRACTOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Team Size</label>
            <select
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white"
            >
              {TEAM_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Radius (km)</label>
            <input
              type="number"
              value={serviceRadius}
              onChange={(e) => setServiceRadius(e.target.value)}
              min="1"
              max="200"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Qualifications</label>
            <input
              type="text"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="e.g. Cert III Plumbing, Gas Fitting License"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Separate multiple qualifications with commas</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isEmergencyAvailable}
              onChange={(e) => setIsEmergencyAvailable(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 font-medium">Available for emergency call-outs</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
