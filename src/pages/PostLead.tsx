import { useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Zap,
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
  Camera,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import AddressAutocomplete from '../components/AddressAutocomplete';
import SearchableSelect from '../components/SearchableSelect';
import { notifyTradiesForUrgentJob } from '../lib/notifications';
import { redactContactInfo, detectContactInfo, getContactWarningMessage } from '../lib/redaction';
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

const TIME_SLOTS: { key: TimeSlot; label: string; range: string; icon: typeof Sun }[] = [
  { key: 'morning', label: 'Morning', range: '7:00 AM - 9:00 AM', icon: Sun },
  { key: 'midday', label: 'Midday', range: '10:00 AM - 12:00 PM', icon: CloudSun },
  { key: 'afternoon', label: 'Afternoon', range: '1:00 PM - 5:00 PM', icon: Sunset },
];

// Typical peak inspection times by trade — based on industry scheduling patterns
const TRADE_PEAK_TIMES: Record<string, { slot: TimeSlot; reason: string }> = {
  'Plumber': { slot: 'morning', reason: 'Plumbers typically start early to fit inspections before their first job' },
  'Electrician': { slot: 'morning', reason: 'Electricians prefer morning visits when natural light is best for assessments' },
  'Carpenter': { slot: 'morning', reason: 'Carpenters usually schedule inspections first thing before heading to job sites' },
  'Builder': { slot: 'morning', reason: 'Builders often do site visits in the morning before their crew starts' },
  'Painter': { slot: 'midday', reason: 'Painters prefer midday when they can see how light hits the surfaces' },
  'Landscaper': { slot: 'morning', reason: 'Landscapers prefer cooler morning hours for outdoor inspections' },
  'Handyman': { slot: 'midday', reason: 'Handymen are most flexible around midday between morning and afternoon jobs' },
  'Cleaner': { slot: 'morning', reason: 'Cleaners usually do walk-throughs in the morning before their daily schedule' },
  'Roofer': { slot: 'morning', reason: 'Roofers inspect early before the roof heats up in the afternoon sun' },
  'Tiler': { slot: 'midday', reason: 'Tilers are typically available for quotes around midday' },
  'HVAC Technician': { slot: 'afternoon', reason: 'HVAC techs often do inspections in the afternoon after completing morning service calls' },
  'Air Conditioning': { slot: 'afternoon', reason: 'AC techs prefer afternoon visits when they can test cooling under peak heat' },
  'Solar': { slot: 'midday', reason: 'Solar installers assess roof orientation best when the sun is directly overhead' },
  'Pool': { slot: 'morning', reason: 'Pool technicians prefer morning inspections before water temperature rises' },
  'Pest Control': { slot: 'morning', reason: 'Pest inspectors prefer early morning when pests are most visible in their nests' },
  'Locksmith': { slot: 'afternoon', reason: 'Locksmiths tend to have more availability for quotes in the afternoon' },
  'Private Chef': { slot: 'afternoon', reason: 'Private chefs usually consult in the afternoon to plan for evening events' },
  'Event Catering': { slot: 'midday', reason: 'Caterers prefer midday consultations to discuss venue and menu requirements' },
};

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
                  ? 'bg-secondary-600 text-white shadow-md'
                  : isWeekend
                  ? 'text-gray-400 hover:bg-gray-100'
                  : 'text-gray-700 hover:bg-secondary-50 hover:text-secondary-700'
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
  const [title, setTitle] = useState('');
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
  const [maxQuotes, setMaxQuotes] = useState(3);
  const [allowsSiteInspection, setAllowsSiteInspection] = useState(true);
  const [smsResult, setSmsResult] = useState<{ push: number; sms: number } | null>(null);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      if (photos.length >= 5) break;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos((prev) => {
          if (prev.length >= 5) return prev;
          return [...prev, { file, preview: ev.target?.result as string }];
        });
      };
      reader.readAsDataURL(file);
    }
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting) return;

    if (!category) {
      setError('Please select a category.');
      return;
    }
    if (!title.trim()) {
      setError('Please give your job a short title.');
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
    if (budgetType === 'fixed_budget' && !budgetAmount) {
      setError('Please enter a budget amount or switch to "Open to Quotes".');
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

    // Detect contact info in both the original and redacted text
    const fullText = `${title.trim()} ${description.trim()}`;
    const detection = detectContactInfo(fullText);

    // Redact phone numbers and emails from description to prevent bypassing the platform
    const cleanDescription = redactContactInfo(description.trim());

    const isUrgent = scheduleMode === 'urgent';
    const flashExpiry = isUrgent ? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() : null;

    // Build flag reasons for admin review
    const flagReasons: string[] = [];
    if (detection.hasDigitPhone) flagReasons.push('digit phone number');
    if (detection.hasEmail) flagReasons.push('email address');
    if (detection.hasEmailBypass) flagReasons.push('email bypass (split across lines or @ keyword)');
    if (detection.hasSpelledNumber) flagReasons.push('spelled-out number sequence');
    if (detection.hasMixedNumber) flagReasons.push('mixed digit/word number sequence');
    if (detection.hasSeparatedDigits) flagReasons.push('separator-split digits (e.g. 0/4/4/2...)');
    if (detection.hasIntentPhrase) flagReasons.push('contact-sharing intent phrase');

    const jobData: Record<string, unknown> = {
      client_id: user.id,
      title: redactContactInfo(title.trim()),
      description: `[${category}] ${cleanDescription}`,
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
      contact_flagged: detection.hasContact,
      contact_flag_reason: flagReasons.length > 0 ? flagReasons.join(', ') : null,
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
      console.error('Job insert failed:', insertError);
      setError(insertError?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    // Upload photos in parallel if any
    const jobId = (insertedJob as Job).id;
    if (photos.length > 0) {
      const uploadResults = await Promise.all(
        photos.map(async (photo, i) => {
          const ext = photo.file.name.split('.').pop() || 'jpg';
          const filePath = `${user.id}/${jobId}-${i}-${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('job-attachments')
            .upload(filePath, photo.file, { cacheControl: '3600', upsert: false });
          if (uploadErr) return null;
          const { data: urlData } = supabase.storage
            .from('job-attachments')
            .getPublicUrl(filePath);
          return urlData?.publicUrl || null;
        })
      );
      const imageUrls = uploadResults.filter((url): url is string => url !== null);
      if (imageUrls.length > 0) {
        await supabase
          .from('jobs')
          .update({ images_url: imageUrls })
          .eq('id', jobId);
      }
    }

    // Show success immediately, notify tradies in background
    setSubmitted(true);
    setSubmitting(false);

    if (isUrgent) {
      notifyTradiesForUrgentJob(insertedJob as Job).then((result) => {
        setSmsResult(result);
      });
    }
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
              <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-secondary-600 flex-shrink-0" />
                  <p className="text-sm text-secondary-800 text-left">
                    Urgent alerts sent to{' '}
                    {smsResult.push > 0 && <span className="font-semibold">{smsResult.push} push</span>}
                    {smsResult.push > 0 && smsResult.sms > 0 && ' and '}
                    {smsResult.sms > 0 && <span className="font-semibold">{smsResult.sms} SMS</span>}
                    {' '}recipients.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 max-w-md mx-auto text-left">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">What happens next</h3>
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-warm-100 text-warm-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Tradies review your request</p>
                    <p className="text-xs text-gray-500">{scheduleMode === 'urgent' ? 'Expect responses within minutes' : 'Usually within 24 hours'}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-warm-100 text-warm-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Compare quotes side by side</p>
                    <p className="text-xs text-gray-500">Up to {maxQuotes} tradies can quote — you pick the best fit</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-warm-100 text-warm-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Accept a quote and get it done</p>
                    <p className="text-xs text-gray-500">Message your chosen tradie to confirm the date, time, and any details</p>
                  </div>
                </li>
              </ol>
              <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-200">
                You&apos;ll get a notification each time a tradie quotes. Go to &ldquo;Job Requests&rdquo; in the sidebar to view and compare quotes side by side.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/leads')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
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
                  setPhotos([]);
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
            <div className="w-10 h-10 bg-warm-100 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-warm-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Request a Quote</h1>
              <p className="text-gray-600">Describe what you need and we'll match you with the right tradie</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Section 1: Job Details ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Job Details</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                  <SearchableSelect
                    options={TRADE_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                    value={category}
                    onChange={setCategory}
                    placeholder="Select a trade..."
                    icon={<FileText className="w-5 h-5" />}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={(() => {
                      if (!category) return 'Short title for your job';
                      const examples: Record<string, string> = {
                        Cleaner: 'e.g. End of lease clean',
                        Plumber: 'e.g. Fix leaking kitchen tap',
                        Electrician: 'e.g. Install downlights in living room',
                        Carpenter: 'e.g. Build a timber deck',
                        Builder: 'e.g. Garage extension',
                        Painter: 'e.g. Repaint 3-bedroom house interior',
                        Landscaper: 'e.g. New garden bed and turf',
                        Roofer: 'e.g. Fix roof leak above bathroom',
                        Tiler: 'e.g. Retile bathroom floor',
                        'Air Conditioning': 'e.g. Install split system in bedroom',
                        Locksmith: 'e.g. Rekey all locks after moving in',
                        'Pest Control': 'e.g. Annual termite inspection',
                        Fencer: 'e.g. Replace side fence panels',
                        Concreter: 'e.g. New driveway slab',
                        Bricklayer: 'e.g. Repair retaining wall',
                        'Pool Maintenance': 'e.g. Green pool recovery',
                        Handyman: 'e.g. Assemble flat-pack furniture',
                        Glazier: 'e.g. Replace cracked window pane',
                        Renderer: 'e.g. Render front facade',
                        Demolition: 'e.g. Remove old garden shed',
                      };
                      return examples[category] || `e.g. Describe your ${category.toLowerCase()} job`;
                    })()}
                    maxLength={80}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the job in detail — size, materials, access, timeline... (no need to include contact info — tradies will message you through the platform)"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                {(() => {
                  const detection = detectContactInfo(description);
                  const warning = getContactWarningMessage(detection);
                  if (!warning) return null;
                  return (
                    <div className="mt-2 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <span className="inline-block w-4 h-4 rounded-full bg-amber-400 text-white text-center leading-4 text-xs font-bold flex-shrink-0 mt-0.5">!</span>
                      <p className="text-xs text-amber-800">{warning}</p>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
                  <AddressAutocomplete
                    value={location}
                    onChange={(value) => setLocation(value)}
                    placeholder="Where is the job?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Photos of the job <span className="text-gray-400 font-normal">(optional — helps tradies quote accurately)</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {photos.map((p, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 group/photo">
                        <img
                          src={p.preview}
                          alt={`Photo ${i + 1}`}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setPreviewPhoto(p.preview)}
                        />
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded-md hover:bg-black/80 transition-colors opacity-0 group-hover/photo:opacity-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    {photos.length < 5 && (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-16 h-16 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 border border-dashed border-gray-300 rounded-lg hover:border-warm-400 hover:bg-warm-50/30 transition-colors group"
                      >
                        <Camera className="w-4 h-4 text-gray-400 group-hover:text-warm-600 transition-colors" />
                        <span className="text-[10px] text-gray-400 group-hover:text-warm-600">
                          {photos.length === 0 ? 'Add' : `${photos.length}/5`}
                        </span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Scheduling ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">When do you need this done?</h2>
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
                    ? 'border-warm-400 bg-gradient-to-br from-warm-50 to-warm-50 shadow-lg shadow-warm-100/50'
                    : 'border-gray-200 bg-white hover:border-warm-300 hover:shadow-md'
                }`}
              >
                {scheduleMode === 'urgent' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-warm-500" />
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                  scheduleMode === 'urgent'
                    ? 'bg-gradient-to-br from-warm-400 to-warm-400'
                    : 'bg-warm-100 group-hover:bg-warm-200'
                }`}>
                  <Zap className={`w-6 h-6 ${scheduleMode === 'urgent' ? 'text-white' : 'text-warm-600'}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Urgent / Next Available</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Get quotes within minutes — we notify nearby tradies instantly.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-warm-100 rounded-lg">
                  <span className="text-xs font-semibold text-warm-700">+$4.99 Emergency Fee</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Helps us notify tradies in your area instantly.</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScheduleMode('scheduled');
                }}
                className={`relative group rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
                  scheduleMode === 'scheduled'
                    ? 'border-secondary-400 bg-gradient-to-br from-secondary-50 to-secondary-50 shadow-lg shadow-secondary-100/50'
                    : 'border-gray-200 bg-white hover:border-secondary-300 hover:shadow-md'
                }`}
              >
                {scheduleMode === 'scheduled' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary-500" />
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                  scheduleMode === 'scheduled'
                    ? 'bg-gradient-to-br from-secondary-400 to-secondary-400'
                    : 'bg-secondary-100 group-hover:bg-secondary-200'
                }`}>
                  <CalendarDays className={`w-6 h-6 ${scheduleMode === 'scheduled' ? 'text-white' : 'text-secondary-600'}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Flexible / Scheduled</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  For renovations or maintenance. Save money by booking ahead.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary-100 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-secondary-700" />
                  <span className="text-xs font-semibold text-secondary-700">No extra fees</span>
                </div>
              </button>
            </div>

            {scheduleMode === 'urgent' && (
              <div className="mt-4 bg-gradient-to-r from-warm-50 to-warm-50 border border-warm-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in duration-300">
                <Zap className="w-5 h-5 text-warm-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-warm-800">
                  <p className="font-medium mb-0.5">Flash Lead</p>
                  <p>Your lead will be boosted for 4 hours. Nearby tradies get instant notifications.</p>
                </div>
              </div>
            )}

            {scheduleMode === 'scheduled' && (
              <div className="mt-5 space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    When should the tradie visit?
                  </label>
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl mb-3">
                    <CalendarDays className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                      The tradie will come to your property to <strong>inspect the job and give you a firm quote</strong>. You'll need to be home.
                    </p>
                  </div>
                  <SmartCalendar
                    selectedDate={scheduledDate}
                    onSelectDate={setScheduledDate}
                  />
                  {scheduledDate && (
                    <p className="mt-2 text-sm text-secondary-700 font-medium">
                      Selected: {formatDateLabel(scheduledDate)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What time works best for the visit?
                  </label>
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl mb-3">
                    <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Pick when you're available to <strong>let the tradie in</strong> and walk them through the job.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {TIME_SLOTS.map((slot) => {
                      const Icon = slot.icon;
                      const isSelected = preferredSlot === slot.key;
                      const peakInfo = TRADE_PEAK_TIMES[category];
                      const isPeakSlot = peakInfo?.slot === slot.key;
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => setPreferredSlot(slot.key)}
                          className={`relative rounded-xl border-2 p-3 text-center transition-all duration-200 ${
                            isSelected
                              ? 'border-secondary-400 bg-secondary-50 shadow-md'
                              : isPeakSlot
                              ? 'border-secondary-200 bg-secondary-50/30 hover:border-secondary-300'
                              : 'border-gray-200 bg-white hover:border-secondary-300 hover:bg-secondary-50/30'
                          }`}
                        >
                          {isPeakSlot && (
                            <div className="absolute -top-2 right-2">
                              <span className="inline-block w-2 h-2 bg-secondary-500 rounded-full" title="Most common for this trade" />
                            </div>
                          )}
                          <Icon className={`w-5 h-5 mx-auto mb-1.5 ${
                            isSelected ? 'text-secondary-600' : isPeakSlot ? 'text-secondary-400' : 'text-gray-400'
                          }`} />
                          <div className={`text-sm font-semibold ${isSelected ? 'text-secondary-800' : 'text-gray-700'}`}>
                            {slot.label}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{slot.range}</div>
                        </button>
                      );
                    })}
                  </div>
                  {category && TRADE_PEAK_TIMES[category] && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-secondary-50 border border-secondary-200 rounded-xl">
                      <Clock className="w-4 h-4 text-secondary-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-secondary-700 leading-relaxed">
                        <span className="font-semibold">{TRADE_PEAK_TIMES[category].slot === 'morning' ? 'Morning' : TRADE_PEAK_TIMES[category].slot === 'midday' ? 'Midday' : 'Afternoon'} is most common for {category.toLowerCase()}s.</span>{' '}
                        {TRADE_PEAK_TIMES[category].reason}.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Budget & Preferences ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Budget & Preferences</h2>
            <div className="space-y-5">
              <div>
                <div className="flex gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => setBudgetType('request_quote')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      budgetType === 'request_quote'
                        ? 'border-secondary-400 bg-secondary-50 text-secondary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Open to Quotes
                  </button>
                  <button
                    type="button"
                    onClick={() => setBudgetType('fixed_budget')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      budgetType === 'fixed_budget'
                        ? 'border-secondary-400 bg-secondary-50 text-secondary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Set a Budget
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {budgetType === 'request_quote'
                    ? 'Tradies will price based on your job details.'
                    : 'Tradies will see your budget and tailor their quote.'}
                </p>
                {budgetType === 'fixed_budget' && (
                  <div className="relative mt-3">
                    <CircleDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      placeholder="Enter your budget (AUD)"
                      min="0"
                      step="10"
                      className="w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quotes</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { num: 3, label: '3 quotes', desc: 'Best for most jobs' },
                    { num: 5, label: '5 quotes', desc: 'Better for complex jobs' },
                  ].map(({ num, label, desc }) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaxQuotes(num)}
                      className={`py-2.5 px-4 rounded-xl text-left border-2 transition-all ${
                        maxQuotes === num
                          ? 'border-secondary-400 bg-secondary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className={`block text-sm font-semibold ${maxQuotes === num ? 'text-secondary-700' : 'text-gray-700'}`}>{label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Fewer quotes = higher win rate for tradies = better prices for you.
                </p>
              </div>

              <label
                className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-secondary-300 cursor-pointer transition-colors"
                htmlFor="allows-site-inspection"
              >
                <input
                  id="allows-site-inspection"
                  type="checkbox"
                  checked={allowsSiteInspection}
                  onChange={(e) => setAllowsSiteInspection(e.target.checked)}
                  className="w-4 h-4 text-secondary-600 rounded border-gray-300 focus:ring-secondary-500 mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Allow site inspections</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Let tradies visit before giving a firm price. Recommended for complex jobs.
                  </p>
                </div>
              </label>
            </div>
          </div>

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
                  ? 'bg-gradient-to-r from-warm-500 to-warm-500 text-white hover:from-warm-600 hover:to-warm-600 shadow-lg shadow-warm-200'
                  : scheduleMode === 'scheduled'
                  ? 'bg-gradient-to-r from-secondary-500 to-secondary-500 text-white hover:from-secondary-600 hover:to-secondary-600 shadow-lg shadow-secondary-200'
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
                'Submit Request'
              )}
            </button>
            {scheduleMode === 'urgent' && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="font-semibold text-warm-700">+ $4.99 Emergency Fee</span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-500">charged on confirmation</span>
              </div>
            )}
          </div>
        </form>
      </div>
      {/* Photo lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPreviewPhoto(null); }}
        >
          <div className="relative max-w-2xl max-h-[85vh]">
            <img
              src={previewPhoto}
              alt="Preview"
              className="max-w-full max-h-[85vh] rounded-xl object-contain"
            />
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-3 -right-3 p-1.5 bg-white text-gray-700 rounded-full shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
