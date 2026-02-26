import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Zap,
  MapPin,
  FileText,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Clock,
  MessageSquare,
  CircleDollarSign,
  CalendarDays,
  Sun,
  CloudSun,
  Sunset,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import AddressAutocomplete from '../components/AddressAutocomplete';
import SearchableSelect from '../components/SearchableSelect';
import { notifyTradiesForUrgentJob } from '../lib/notifications';
import type { Job } from '../types/database';

const TRADE_CATEGORIES = [
  'Plumber',
  'Electrician',
  'Carpenter',
  'Builder',
  'Painter',
  'Landscaper',
  'Handyman',
  'Cleaner',
  'Roofer',
  'Tiler',
  'Concreter',
  'Bricklayer',
  'Glazier',
  'Fencer',
  'Plasterer',
  'Renderer',
  'Flooring Specialist',
  'Cabinet Maker',
  'Locksmith',
  'Air Conditioning',
  'Solar',
  'Pool',
  'Pest Control',
  'Demolition',
  'Excavation',
  'Waterproofing',
  'Insulation',
  'Garage Doors',
  'Security Systems',
  'Appliance Repair',
  'Private Chef',
  'Event Catering',
];

type ScheduleMode = null | 'urgent' | 'scheduled';
type TimeSlot = 'morning' | 'midday' | 'afternoon';

const TIME_SLOTS: { key: TimeSlot; label: string; range: string; icon: typeof Sun; recommended?: boolean }[] = [
  { key: 'morning', label: 'Morning', range: '7:00 AM - 9:00 AM', icon: Sun, recommended: true },
  { key: 'midday', label: 'Midday', range: '10:00 AM - 12:00 PM', icon: CloudSun },
  { key: 'afternoon', label: 'Afternoon', range: '1:00 PM - 5:00 PM', icon: Sunset },
];

function getMinDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diffDays <= 7) {
    const dayName = date.toLocaleDateString('en-AU', { weekday: 'long' });
    return `${dayName}, ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
  }
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function SmartCalendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const min = getMinDate();
    return new Date(min.getFullYear(), min.getMonth(), 1);
  });

  const minDate = getMinDate();

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (Date | null)[] = [];
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [viewMonth]);

  const canGoPrev = viewMonth > new Date(minDate.getFullYear(), minDate.getMonth(), 1);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          disabled={!canGoPrev}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-semibold text-gray-900">
          {viewMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-400 py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const disabled = day < minDate;
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(day)}
              className={`relative py-2 rounded-lg text-sm font-medium transition-all ${
                disabled
                  ? 'text-gray-300 cursor-not-allowed line-through'
                  : isSelected
                  ? 'bg-teal-600 text-white shadow-md'
                  : isWeekend
                  ? 'text-gray-400 hover:bg-gray-100'
                  : 'text-gray-700 hover:bg-teal-50 hover:text-teal-700'
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
        <div className="w-3 h-3 rounded bg-gray-100 border border-gray-200 line-through flex items-center justify-center text-[8px]">

        </div>
        <span>Today & tomorrow blocked -- use Urgent for same-day needs</span>
      </div>
    </div>
  );
}

export default function PostLead() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assigneeId = searchParams.get('assignee');
  const prefillCategory = searchParams.get('category') || '';

  const [category, setCategory] = useState(
    TRADE_CATEGORIES.find(c => c.toLowerCase() === prefillCategory.toLowerCase()) || ''
  );
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [budgetType, setBudgetType] = useState<'request_quote' | 'fixed_budget'>('request_quote');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(null);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [preferredSlot, setPreferredSlot] = useState<TimeSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [maxQuotes, setMaxQuotes] = useState(5);
  const [allowsSiteInspection, setAllowsSiteInspection] = useState(true);
  const [smsResult, setSmsResult] = useState<{ push: number; sms: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!category) {
      setError('Please select a category.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe what you need done.');
      return;
    }
    if (!location.trim()) {
      setError('Please enter a location.');
      return;
    }
    if (!scheduleMode) {
      setError('Please choose a scheduling option.');
      return;
    }
    if (scheduleMode === 'scheduled' && !scheduledDate) {
      setError('Please select a date for your job.');
      return;
    }

    setSubmitting(true);
    setError('');

    const isUrgent = scheduleMode === 'urgent';
    const flashExpiry = isUrgent ? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() : null;

    const jobData: Record<string, unknown> = {
      client_id: user.id,
      description: `[${category}] ${description.trim()}`,
      status: 'pending',
      location_address: location,
      budget_type: budgetType,
      budget_amount: budgetType === 'fixed_budget' && budgetAmount ? parseFloat(budgetAmount) : null,
      is_emergency: isUrgent,
      priority: isUrgent ? 'urgent' : 'standard',
      is_delayed: false,
      is_flash_boost: isUrgent,
      flash_expiry: flashExpiry,
      emergency_fee_applied: isUrgent,
      max_quotes: maxQuotes,
      allows_site_inspection: allowsSiteInspection,
      scheduled_date: scheduleMode === 'scheduled' && scheduledDate
        ? scheduledDate.toISOString().split('T')[0]
        : null,
      preferred_time_slot: scheduleMode === 'scheduled' && preferredSlot ? preferredSlot : null,
    };

    if (assigneeId) {
      jobData.tradie_id = assigneeId;
    }

    const { data: insertedJob, error: insertError } = await supabase
      .from('jobs')
      .insert(jobData)
      .select()
      .maybeSingle();

    if (insertError || !insertedJob) {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    if (isUrgent) {
      const result = await notifyTradiesForUrgentJob(insertedJob as Job);
      setSmsResult(result);
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 md:p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Quote Request Submitted</h1>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              {scheduleMode === 'urgent'
                ? 'Your urgent lead is live. Nearby tradies are being pinged right now.'
                : `Your lead is scheduled for ${scheduledDate?.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}. Tradies will pick it up during their planning sessions.`}
            </p>
            {smsResult && (smsResult.push > 0 || smsResult.sms > 0) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-800 text-left">
                    Urgent alerts sent to{' '}
                    {smsResult.push > 0 && <span className="font-semibold">{smsResult.push} push</span>}
                    {smsResult.push > 0 && smsResult.sms > 0 && ' and '}
                    {smsResult.sms > 0 && <span className="font-semibold">{smsResult.sms} SMS</span>}
                    {' '}recipients.
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/leads')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
              >
                View My Requests
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setCategory('');
                  setDescription('');
                  setLocation('');
                  setBudgetType('request_quote');
                  setBudgetAmount('');
                  setScheduleMode(null);
                  setScheduledDate(null);
                  setPreferredSlot(null);
                  setMaxQuotes(5);
                  setAllowsSiteInspection(true);
                  setSmsResult(null);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Request Another Quote
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Request a Quote</h1>
              <p className="text-gray-600">Describe what you need and we'll match you with the right tradie</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <SearchableSelect
                options={TRADE_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                value={category}
                onChange={setCategory}
                placeholder="Search for a trade category..."
                icon={<FileText className="w-5 h-5" />}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What do you need done?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the job in detail. Include specifics like size, materials, timeline..."
                rows={5}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
              <p className="mt-1.5 text-xs text-gray-600">
                The more detail you provide, the more accurate quotes you'll receive.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location
              </label>
              <AddressAutocomplete
                value={location}
                onChange={(value) => setLocation(value)}
                placeholder="Where is the job located?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Budget
              </label>
              <div className="flex gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setBudgetType('request_quote')}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all min-h-[44px] ${
                    budgetType === 'request_quote'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Request a Quote
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetType('fixed_budget')}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all min-h-[44px] ${
                    budgetType === 'fixed_budget'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Set a Budget
                </button>
              </div>

              {budgetType === 'fixed_budget' && (
                <div className="relative">
                  <CircleDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="Enter your budget (AUD)"
                    min="0"
                    step="10"
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How many quotes would you like?
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[3, 5, 7, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxQuotes(num)}
                    className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                      maxQuotes === num
                        ? 'border-teal-400 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Fewer quotes means each tradie has a better chance of winning. We recommend 3-5 for most jobs.
              </p>
            </div>

            <label
              className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-teal-300 cursor-pointer transition-colors"
              htmlFor="allows-site-inspection"
            >
              <input
                id="allows-site-inspection"
                type="checkbox"
                checked={allowsSiteInspection}
                onChange={(e) => setAllowsSiteInspection(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Allow site inspections</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Let tradies request a site visit before locking in a firm price. Recommended for complex jobs.
                </p>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              When do you need this done?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setScheduleMode('urgent');
                  setScheduledDate(null);
                  setPreferredSlot(null);
                }}
                className={`relative group rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
                  scheduleMode === 'urgent'
                    ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg shadow-amber-100/50'
                    : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-md'
                }`}
              >
                {scheduleMode === 'urgent' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                  scheduleMode === 'urgent'
                    ? 'bg-gradient-to-br from-amber-400 to-orange-400'
                    : 'bg-amber-100 group-hover:bg-amber-200'
                }`}>
                  <Zap className={`w-6 h-6 ${scheduleMode === 'urgent' ? 'text-white' : 'text-amber-600'}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Urgent / Next Available</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  For emergencies. We ping nearby tradies instantly.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 rounded-lg">
                  <span className="text-xs font-semibold text-amber-700">+$7.99 Emergency Fee</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScheduleMode('scheduled');
                }}
                className={`relative group rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
                  scheduleMode === 'scheduled'
                    ? 'border-teal-400 bg-gradient-to-br from-teal-50 to-emerald-50 shadow-lg shadow-teal-100/50'
                    : 'border-gray-200 bg-white hover:border-teal-300 hover:shadow-md'
                }`}
              >
                {scheduleMode === 'scheduled' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-teal-500" />
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                  scheduleMode === 'scheduled'
                    ? 'bg-gradient-to-br from-teal-400 to-emerald-400'
                    : 'bg-teal-100 group-hover:bg-teal-200'
                }`}>
                  <CalendarDays className={`w-6 h-6 ${scheduleMode === 'scheduled' ? 'text-white' : 'text-teal-600'}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Flexible / Scheduled</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  For renovations or maintenance. Save money by booking ahead.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-100 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-teal-700" />
                  <span className="text-xs font-semibold text-teal-700">No extra fees</span>
                </div>
              </button>
            </div>
          </div>

          {scheduleMode === 'urgent' && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in duration-300">
              <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-0.5">Flash Lead</p>
                <p>Your lead will be boosted for 4 hours. Nearby tradies get instant notifications. If nobody picks up, we keep boosting to find you a tradie faster.</p>
              </div>
            </div>
          )}

          {scheduleMode === 'scheduled' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pick a Date
                </label>
                <SmartCalendar
                  selectedDate={scheduledDate}
                  onSelectDate={setScheduledDate}
                />
                {scheduledDate && (
                  <p className="mt-2 text-sm text-teal-700 font-medium">
                    Selected: {formatDateLabel(scheduledDate)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Time
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {TIME_SLOTS.map((slot) => {
                    const Icon = slot.icon;
                    const isSelected = preferredSlot === slot.key;
                    return (
                      <button
                        key={slot.key}
                        type="button"
                        onClick={() => setPreferredSlot(slot.key)}
                        className={`relative rounded-xl border-2 p-3 text-center transition-all duration-200 ${
                          isSelected
                            ? 'border-teal-400 bg-teal-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/30'
                        }`}
                      >
                        {slot.recommended && (
                          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-600 text-white text-[10px] font-bold rounded-full whitespace-nowrap">
                              <Star className="w-2.5 h-2.5" />
                              Preferred
                            </span>
                          </div>
                        )}
                        <Icon className={`w-5 h-5 mx-auto mb-1.5 ${
                          isSelected ? 'text-teal-600' : 'text-gray-400'
                        }`} />
                        <div className={`text-sm font-semibold ${isSelected ? 'text-teal-800' : 'text-gray-700'}`}>
                          {slot.label}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{slot.range}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="submit"
              disabled={submitting || !scheduleMode}
              className={`w-full py-3.5 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-lg ${
                scheduleMode === 'urgent'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-200'
                  : scheduleMode === 'scheduled'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600 shadow-lg shadow-teal-200'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting Request...
                </>
              ) : scheduleMode === 'urgent' ? (
                <>
                  <Zap className="w-5 h-5" />
                  Submit Urgent Request
                </>
              ) : scheduleMode === 'scheduled' ? (
                <>
                  <CalendarDays className="w-5 h-5" />
                  Submit Scheduled Request
                </>
              ) : (
                <>
                  <MapPin className="w-5 h-5" />
                  Choose a Scheduling Option
                </>
              )}
            </button>
            {scheduleMode === 'urgent' && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="font-semibold text-amber-700">+ $7.99 Emergency Fee</span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-500">charged on confirmation</span>
              </div>
            )}
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
