import { useState, useEffect } from 'react';
import { X, Plus, ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, Repeat } from 'lucide-react';

interface TimeSlotPreset {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  icon: string;
}

interface RecurringPattern {
  enabled: boolean;
  weekdays: number[];
  endDate: string;
}

interface BulkAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (slots: Array<{ date: string; startTime: string; endTime: string }>) => Promise<void>;
  currentMonth: Date;
}

const TIME_PRESETS: TimeSlotPreset[] = [
  { id: 'morning', name: 'Morning', startTime: '06:30', endTime: '12:00', icon: '🌅' },
  { id: 'afternoon', name: 'Afternoon', startTime: '12:30', endTime: '17:30', icon: '☀️' },
  { id: 'evening', name: 'Evening', startTime: '17:30', endTime: '21:30', icon: '🌆' },
  { id: 'fullday', name: 'Full Day', startTime: '07:00', endTime: '17:00', icon: '📅' },
  { id: 'custom', name: 'Custom', startTime: '09:00', endTime: '17:00', icon: '⚙️' },
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BulkAvailabilityModal({ isOpen, onClose, onSave, currentMonth }: BulkAvailabilityModalProps) {
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [selectedPreset, setSelectedPreset] = useState<string>('fullday');
  const [customStartTime, setCustomStartTime] = useState('09:00');
  const [customEndTime, setCustomEndTime] = useState('17:00');
  const [viewMonth, setViewMonth] = useState(new Date(currentMonth));
  const [recurringPattern, setRecurringPattern] = useState<RecurringPattern>({
    enabled: false,
    weekdays: [],
    endDate: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setViewMonth(new Date(currentMonth));
      setSelectedDates(new Set());
      setRecurringPattern({ enabled: false, weekdays: [], endDate: '' });
    }
  }, [isOpen, currentMonth]);

  if (!isOpen) return null;

  const preset = TIME_PRESETS.find((p) => p.id === selectedPreset) || TIME_PRESETS[3];
  const startTime = selectedPreset === 'custom' ? customStartTime : preset.startTime;
  const endTime = selectedPreset === 'custom' ? customEndTime : preset.endTime;

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay, year, month };
  };

  const { daysInMonth, startingDay, year, month } = getDaysInMonth(viewMonth);

  const formatDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const toggleDate = (day: number) => {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);

    const newSelected = new Set(selectedDates);
    if (newSelected.has(dateKey)) {
      newSelected.delete(dateKey);
    } else {
      newSelected.add(dateKey);
    }
    setSelectedDates(newSelected);
  };

  const toggleWeekday = (weekday: number) => {
    const newWeekdays = recurringPattern.weekdays.includes(weekday)
      ? recurringPattern.weekdays.filter((d) => d !== weekday)
      : [...recurringPattern.weekdays, weekday];

    setRecurringPattern({ ...recurringPattern, weekdays: newWeekdays });
  };

  const selectDateRange = (type: 'weekdays' | 'weekend' | 'all') => {
    const newSelected = new Set<string>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      if (date < today) continue; // skip past dates
      const dateKey = formatDateKey(date);
      const dayOfWeek = date.getDay();

      if (type === 'all') {
        newSelected.add(dateKey);
      } else if (type === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) {
        newSelected.add(dateKey);
      } else if (type === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        newSelected.add(dateKey);
      }
    }

    setSelectedDates(newSelected);
  };

  const clearAllDates = () => {
    setSelectedDates(new Set());
  };

  const generateRecurringSlots = (): string[] => {
    if (!recurringPattern.enabled || recurringPattern.weekdays.length === 0 || !recurringPattern.endDate) {
      return [];
    }

    const slots: string[] = [];
    const startDate = new Date(year, month, 1);
    const endDate = new Date(recurringPattern.endDate);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      if (recurringPattern.weekdays.includes(dayOfWeek)) {
        slots.push(formatDateKey(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  };

  const handleSave = async () => {
    const allDates = recurringPattern.enabled
      ? generateRecurringSlots()
      : Array.from(selectedDates);

    if (allDates.length === 0) return;

    const slots = allDates.map((dateKey) => ({
      date: dateKey,
      startTime,
      endTime,
    }));

    setIsSaving(true);
    try {
      await onSave(slots);
      onClose();
    } catch {
      // error handled silently
    } finally {
      setIsSaving(false);
    }
  };

  const isDateSelected = (day: number): boolean => {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);
    return selectedDates.has(dateKey);
  };

  const isPastDate = (day: number): boolean => {
    const date = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const totalSlots = recurringPattern.enabled
    ? generateRecurringSlots().length
    : selectedDates.size;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-50"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Add Availability Slots</h3>
            <p className="text-sm text-gray-500 mt-1">Select multiple dates and set your working hours</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-900">Select Dates</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1))}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
                    {monthNames[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                  </span>
                  <button
                    onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1))}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {WEEKDAY_NAMES.map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {[...Array(startingDay)].map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}

                  {[...Array(daysInMonth)].map((_, i) => {
                    const day = i + 1;
                    const selected = isDateSelected(day);
                    const isPast = isPastDate(day);

                    return (
                      <button
                        key={day}
                        onClick={() => !isPast && toggleDate(day)}
                        disabled={isPast}
                        className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                          selected
                            ? 'bg-warm-500 text-white shadow-sm'
                            : isPast
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => selectDateRange('weekdays')}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  All Weekdays
                </button>
                <button
                  onClick={() => selectDateRange('weekend')}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Weekend
                </button>
                <button
                  onClick={() => selectDateRange('all')}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Entire Month
                </button>
                <button
                  onClick={clearAllDates}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-secondary-600" />
                    <span className="text-sm font-semibold text-secondary-900">Recurring Pattern</span>
                  </div>
                  <button
                    onClick={() => setRecurringPattern({ ...recurringPattern, enabled: !recurringPattern.enabled })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      recurringPattern.enabled
                        ? 'bg-warm-500 text-white'
                        : 'bg-white text-primary-600 border border-primary-300'
                    }`}
                  >
                    {recurringPattern.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {recurringPattern.enabled && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-secondary-900 mb-2">Repeat on:</label>
                      <div className="flex gap-1">
                        {WEEKDAY_NAMES.map((day, index) => (
                          <button
                            key={day}
                            onClick={() => toggleWeekday(index)}
                            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                              recurringPattern.weekdays.includes(index)
                                ? 'bg-warm-500 text-white'
                                : 'bg-white text-gray-600 border border-gray-200'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-secondary-900 mb-2">Repeat until:</label>
                      <input
                        type="date"
                        value={recurringPattern.endDate}
                        onChange={(e) => setRecurringPattern({ ...recurringPattern, endDate: e.target.value })}
                        className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <p className="text-xs text-secondary-700">
                      This will create slots for selected weekdays until the end date.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Time Slot Template</h4>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedPreset === preset.id
                        ? 'border-warm-500 bg-warm-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">{preset.icon}</div>
                    <div className="font-semibold text-gray-900 text-sm mb-1">{preset.name}</div>
                    <div className="text-xs text-gray-500">
                      {preset.startTime} - {preset.endTime}
                    </div>
                  </button>
                ))}
              </div>

              {selectedPreset === 'custom' && (
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Custom Time Range</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                      <input
                        type="time"
                        step="300"
                        value={customStartTime}
                        onChange={(e) => setCustomStartTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Time</label>
                      <input
                        type="time"
                        step="300"
                        value={customEndTime}
                        onChange={(e) => setCustomEndTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Select any time in 5-minute intervals</p>
                </div>
              )}

              <div className="bg-gradient-to-br from-primary-50 to-secondary-50 rounded-xl p-6 border border-primary-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-warm-500 rounded-xl flex items-center justify-center">
                    <CalendarIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{totalSlots}</div>
                    <div className="text-sm text-gray-600">Slots to create</div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">
                      <strong>{startTime}</strong> - <strong>{endTime}</strong>
                    </span>
                  </div>
                  {recurringPattern.enabled && recurringPattern.weekdays.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Repeat className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">
                        Repeating on {recurringPattern.weekdays.map(d => WEEKDAY_NAMES[d]).join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                {totalSlots > 0 && (
                  <div className="text-xs text-gray-600 bg-white/50 rounded-lg p-3">
                    You're about to add {totalSlots} availability slot{totalSlots !== 1 ? 's' : ''} to your calendar.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 p-6 flex items-center justify-between bg-gray-50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={totalSlots === 0 || isSaving}
            className="px-6 py-2.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add {totalSlots} Slot{totalSlots !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
