import { useState } from 'react';
import {
  X,
  DollarSign,
  Send,
  Loader2,
  Package,
  Eye,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Wrench,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Job } from '../types/database';
import { extractSuburb } from '../lib/contactGating';

interface SubmitQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
  onQuoteSubmitted: () => void;
}

const DURATION_OPTIONS = [
  { value: '1-2 hours', label: '1-2 hours' },
  { value: 'Half day', label: 'Half day (4hrs)' },
  { value: 'Full day', label: 'Full day (8hrs)' },
  { value: '2-3 days', label: '2-3 days' },
  { value: '1 week', label: '1 week' },
  { value: '2+ weeks', label: '2+ weeks' },
  { value: 'TBD after inspection', label: 'To be confirmed' },
];

type ModalState = 'form' | 'submitting' | 'success';

export default function SubmitQuoteModal({
  isOpen,
  onClose,
  job,
  onQuoteSubmitted,
}: SubmitQuoteModalProps) {
  const { user, profile, tradieDetails } = useAuth();
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [firmPrice, setFirmPrice] = useState('');
  const [useFirmPrice, setUseFirmPrice] = useState(false);
  const [message, setMessage] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [includesMaterials, setIncludesMaterials] = useState(false);
  const [requiresSiteInspection, setRequiresSiteInspection] = useState(false);
  const [error, setError] = useState('');
  const [modalState, setModalState] = useState<ModalState>('form');

  const category = job.description.match(/^\[([^\]]+)\]/)?.[1] || 'Job';
  const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const suburb = extractSuburb(job.location_address || '') || 'Unknown area';
  const slotsRemaining = job.max_quotes - job.quote_count;

  const handleSubmit = async () => {
    if (!user) return;

    if (!useFirmPrice) {
      if (!priceMin || !priceMax) {
        setError('Please enter a price range.');
        return;
      }
      if (parseFloat(priceMin) > parseFloat(priceMax)) {
        setError('Minimum price cannot exceed maximum price.');
        return;
      }
      if (parseFloat(priceMin) <= 0) {
        setError('Price must be greater than zero.');
        return;
      }
    } else {
      if (!firmPrice) {
        setError('Please enter your firm price.');
        return;
      }
      if (parseFloat(firmPrice) <= 0) {
        setError('Price must be greater than zero.');
        return;
      }
    }

    if (!message.trim()) {
      setError('Please include a brief message about your approach.');
      return;
    }

    setModalState('submitting');
    setError('');

    const min = useFirmPrice ? parseFloat(firmPrice) : parseFloat(priceMin);
    const max = useFirmPrice ? parseFloat(firmPrice) : parseFloat(priceMax);

    const { error: insertError } = await supabase.from('quotes').insert({
      job_id: job.id,
      tradie_id: user.id,
      price_min: min,
      price_max: max,
      firm_price: useFirmPrice ? parseFloat(firmPrice) : null,
      message: message.trim(),
      estimated_duration: estimatedDuration || null,
      includes_materials: includesMaterials,
      requires_site_inspection: requiresSiteInspection,
      status: 'pending',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You have already submitted a quote for this job.');
      } else {
        setError('Failed to submit quote. Please try again.');
      }
      setModalState('form');
      return;
    }

    setModalState('success');
  };

  const handleClose = () => {
    if (modalState === 'success') {
      onQuoteSubmitted();
    }
    setPriceMin('');
    setPriceMax('');
    setFirmPrice('');
    setUseFirmPrice(false);
    setMessage('');
    setEstimatedDuration('');
    setIncludesMaterials(false);
    setRequiresSiteInspection(false);
    setError('');
    setModalState('form');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {modalState === 'submitting' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Submitting Quote...</h2>
            <p className="text-gray-600">Sending your quote to the client.</p>
          </div>
        )}

        {modalState === 'success' && (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Quote Submitted</h2>
            <p className="text-gray-600 mb-8 max-w-sm">
              The client will review your quote alongside up to {job.max_quotes - 1} others. You'll be notified if they accept.
            </p>
            <button
              onClick={handleClose}
              className="px-8 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {modalState === 'form' && (
          <>
            <div className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Submit Quote</h2>
                  <p className="text-sm text-gray-500">Blind quoting -- other tradies can't see your price</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                    {category}
                  </span>
                  {slotsRemaining <= 2 && (
                    <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold border border-amber-200">
                      {slotsRemaining} spot{slotsRemaining !== 1 ? 's' : ''} left
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700 line-clamp-3">{desc}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {suburb}
                  </span>
                  {job.budget_amount && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Client budget: ${job.budget_amount.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Your Price</label>
                  <button
                    type="button"
                    onClick={() => setUseFirmPrice(!useFirmPrice)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      useFirmPrice
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {useFirmPrice ? 'Firm Price' : 'Switch to Firm Price'}
                  </button>
                </div>

                {useFirmPrice ? (
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={firmPrice}
                      onChange={(e) => setFirmPrice(e.target.value)}
                      placeholder="Your firm price (AUD)"
                      min="0"
                      step="10"
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={priceMin}
                        onChange={(e) => setPriceMin(e.target.value)}
                        placeholder="Min"
                        min="0"
                        step="10"
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      />
                    </div>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={priceMax}
                        onChange={(e) => setPriceMax(e.target.value)}
                        placeholder="Max"
                        min="0"
                        step="10"
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      />
                    </div>
                  </div>
                )}
                {!useFirmPrice && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Provide a range. You can firm up later after speaking with the client.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Approach
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Briefly explain how you'd approach this job, what's included, and your experience with similar work..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Duration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DURATION_OPTIONS.slice(0, 4).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEstimatedDuration(option.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                        estimatedDuration === option.value
                          ? 'border-teal-400 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {DURATION_OPTIONS.slice(4).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEstimatedDuration(option.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                        estimatedDuration === option.value
                          ? 'border-teal-400 bg-teal-50 text-teal-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-teal-300 cursor-pointer transition-colors"
                  htmlFor="includes-materials"
                >
                  <input
                    id="includes-materials"
                    type="checkbox"
                    checked={includesMaterials}
                    onChange={(e) => setIncludesMaterials(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                  />
                  <Package className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">Quote includes materials</span>
                </label>

                {job.allows_site_inspection && (
                  <label
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-teal-300 cursor-pointer transition-colors"
                    htmlFor="site-inspection"
                  >
                    <input
                      id="site-inspection"
                      type="checkbox"
                      checked={requiresSiteInspection}
                      onChange={(e) => setRequiresSiteInspection(e.target.checked)}
                      className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                    />
                    <Eye className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-sm text-gray-700">Needs site inspection before firm quote</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        I'll provide a range now and firm up after inspecting the site.
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {requiresSiteInspection && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Your quote will be shown as a range with a "site inspection required" tag. The client can message you to arrange a visit before you lock in a firm price.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
                <Wrench className="w-4 h-4 flex-shrink-0" />
                <span>
                  Quoting as <strong>{tradieDetails?.business_name || profile?.full_name}</strong>
                  {profile?.verification_status === 'verified' && ' (Verified)'}
                </span>
              </div>

              <button
                onClick={handleSubmit}
                className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-emerald-600 transition-all shadow-lg shadow-teal-200 flex items-center justify-center gap-2 text-lg"
              >
                <Send className="w-5 h-5" />
                Submit Quote
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
