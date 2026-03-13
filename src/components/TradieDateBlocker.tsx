import { useState } from 'react';
import { CalendarOff, CheckCircle2, Loader2 } from 'lucide-react';
import { blockTimeSlot } from '../lib/availability';

const REASONS = ['Personal', 'Leave', 'Another Job', 'Other'] as const;

interface TradieDateBlockerProps {
  tradieId: string;
  onBlocked?: () => void;
}

export default function TradieDateBlocker({ tradieId, onBlocked }: TradieDateBlockerProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const minDate = new Date().toISOString().split('T')[0];

  const handleSubmit = async () => {
    if (!startDate) return;
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const dates: string[] = [];

      if (isRange && endDate) {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split('T')[0]);
        }
      } else {
        dates.push(startDate);
      }

      const label = notes.trim() ? `${reason}: ${notes.trim()}` : reason;

      for (const date of dates) {
        await blockTimeSlot(tradieId, date, '07:00:00', '17:00:00', label);
      }

      setSuccess(true);
      setStartDate('');
      setEndDate('');
      setNotes('');
      onBlocked?.();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block dates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarOff className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Mark Unavailable</h3>
      </div>

      <div className="space-y-3">
        {/* Range toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRange}
            onChange={(e) => { setIsRange(e.target.checked); setEndDate(''); }}
            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-xs text-gray-600">Date range</span>
        </label>

        {/* Date pickers */}
        <div className={isRange ? 'grid grid-cols-2 gap-2' : ''}>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              {isRange ? 'From' : 'Date'}
            </label>
            <input
              type="date"
              value={startDate}
              min={minDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {isRange && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                value={endDate}
                min={startDate || minDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>

        {/* Reason selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reason</label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  reason === r
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Family holiday"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Dates blocked successfully
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !startDate || (isRange && !endDate)}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Blocking...
            </>
          ) : (
            'Block Dates'
          )}
        </button>
      </div>
    </div>
  );
}
