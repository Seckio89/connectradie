import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { friendlyError } from '../lib/utils';
import { ChevronLeft, ChevronRight, Clock, X, Loader2, Calendar as CalendarIcon, Upload, User, MapPin, Key } from 'lucide-react';
import type { AvailabilitySlot, TradieWithDetails } from '../types/database';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendNotification } from '../lib/notificationService';
import { NOTIFICATION_TYPES } from '../lib/notificationTypes';
import AddressAutocomplete from './AddressAutocomplete';
import { getJobHints } from '../lib/jobDescriptionHints';
import { redactName } from '../lib/contactGating';

interface AvailabilityCalendarProps {
  isOpen: boolean;
  onClose: () => void;
  tradie: TradieWithDetails | null;
  onSelectSlot?: (slot: AvailabilitySlot) => void;
}

export default function AvailabilityCalendar({ isOpen, onClose, tradie, onSelectSlot }: AvailabilityCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [bookingDescription, setBookingDescription] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string>('');
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, profile } = useAuth();
  const tradieDisplayName = (() => {
    const d = tradie?.tradie_details;
    const pro = d?.subscription_tier === 'pro' || d?.subscription_tier === 'business' || tradie?.is_premium;
    return pro ? (d?.business_name || redactName(tradie?.full_name)) : redactName(tradie?.full_name);
  })();

  useEffect(() => {
    if (isOpen && tradie) {
      fetchSlots();
    }
  }, [isOpen, tradie, currentDate]);

  useEffect(() => {
    if (profile) {
      setContactName(profile.full_name || '');
      setContactPhone(profile.phone || '');
    }
  }, [profile]);

  const fetchSlots = useCallback(async () => {
    if (!tradie) return;
    setLoading(true);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const { data } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('tradie_id', tradie.id)
      .gte('start_time', startOfMonth.toISOString())
      .lte('start_time', endOfMonth.toISOString())
      .order('start_time', { ascending: true });

    setSlots((data || []) as AvailabilitySlot[]);
    setLoading(false);
  }, [tradie, currentDate]);

  const { daysInMonth, startingDay } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { daysInMonth: lastDay.getDate(), startingDay: firstDay.getDay() };
  }, [currentDate]);

  const slotsByDay = useMemo(() => {
    const map: Record<number, AvailabilitySlot[]> = {};
    slots.forEach((slot) => {
      const slotDate = new Date(slot.start_time);
      if (slotDate.getMonth() === currentDate.getMonth() && slotDate.getFullYear() === currentDate.getFullYear()) {
        const day = slotDate.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(slot);
      }
    });
    return map;
  }, [slots, currentDate]);

  const availableDays = useMemo(() => {
    const set = new Set<number>();
    Object.entries(slotsByDay).forEach(([day, daySlots]) => {
      if (daySlots.some(s => s.status === 'available')) {
        set.add(Number(day));
      }
    });
    return set;
  }, [slotsByDay]);

  const todayInfo = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();
    return {
      day,
      month,
      year,
      midnight: new Date(year, month, day).getTime(),
    };
  }, []);

  const [filePreviewUrls, setFilePreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = selectedFiles.map(file => URL.createObjectURL(file));
    setFilePreviewUrls(urls);
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  const getSlotsForDate = (day: number) => slotsByDay[day] || [];

  const hasAvailability = (day: number) => availableDays.has(day);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    setSelectedDate(null);
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(date);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadError('');

    // Validate files
    const validFiles = files.filter(file => {
      // Check file type
      if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
        setUploadError('Only PNG and JPG files are allowed');
        return false;
      }
      // Check file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('Files must be under 10MB');
        return false;
      }
      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleBooking = async () => {
    if (!selectedSlot || !user || !tradie) return;
    setBookingLoading(true);
    setUploadError('');

    try {
      // Upload images first if any are selected
      const imageUrls: string[] = [];

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${user.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('job-images')
            .upload(filePath, file);

          if (uploadError) {
            throw new Error(`Failed to upload ${file.name}`);
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('job-images')
            .getPublicUrl(filePath);

          imageUrls.push(publicUrl);
        }
      }

      // Create scheduled time using custom times
      const slotDate = new Date(selectedSlot.start_time);
      const [startHour, startMin] = customStartTime.split(':').map(Number);
      const scheduledTime = new Date(slotDate);
      scheduledTime.setHours(startHour, startMin, 0, 0);

      // Create job with image URLs and custom time
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert({
          client_id: user.id,
          tradie_id: tradie.id,
          description: `${bookingDescription}\n\nRequested time: ${customStartTime} - ${customEndTime}`,
          status: 'pending',
          scheduled_time: scheduledTime.toISOString(),
          is_emergency: false,
          images_url: imageUrls.length > 0 ? imageUrls : null,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          location_address: locationAddress || null,
          access_instructions: accessInstructions || null,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      if (jobData) {
        await sendNotification({
          type: NOTIFICATION_TYPES.JOB_BOOKING_CONFIRMED,
          userId: tradie.id,
          title: 'New Booking Request',
          message: `${profile?.full_name || 'A client'} has requested a booking for ${scheduledTime.toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })} at ${customStartTime}`,
          jobId: (jobData as Record<string, string>).id,
          metadata: {
            client_id: user.id,
            scheduled_time: scheduledTime.toISOString(),
          },
        });
      }

      await supabase
        .from('availability_slots')
        .update({ status: 'booked', booked_by: user.id })
        .eq('id', selectedSlot.id);

      setBookingSuccess(true);
      setTimeout(() => {
        setBookingSuccess(false);
        setSelectedSlot(null);
        setBookingDescription('');
        setSelectedFiles([]);
        setCustomStartTime('');
        setCustomEndTime('');
        setLocationAddress('');
        setAccessInstructions('');
        onClose();
      }, 2000);
    } catch (error) {
      setUploadError(friendlyError(error, 'Unable to create booking. Please try again.'));
      setBookingLoading(false);
      return;
    }

    setBookingLoading(false);
  };

  const handleSlotClick = (slot: AvailabilitySlot) => {
    if (slot.status === 'available') {
      setSelectedSlot(slot);
      const startDate = new Date(slot.start_time);
      const endDate = new Date(slot.end_time);
      setCustomStartTime(
        `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
      );
      setCustomEndTime(
        `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
      );
      if (onSelectSlot) {
        onSelectSlot(slot);
      }
    }
  };

  const slotTimeRange = useMemo(() => {
    if (!selectedSlot) return { minTime: '00:00', maxTime: '23:59' };
    const start = new Date(selectedSlot.start_time);
    const end = new Date(selectedSlot.end_time);
    return {
      minTime: `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`,
      maxTime: `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`,
    };
  }, [selectedSlot]);

  const isValidTimeRange = useMemo(() => {
    if (!selectedSlot || !customStartTime || !customEndTime) return false;
    const { minTime, maxTime } = slotTimeRange;
    return customStartTime >= minTime && customEndTime <= maxTime && customStartTime < customEndTime;
  }, [selectedSlot, customStartTime, customEndTime, slotTimeRange]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isOpen) return null;

  const selectedDaySlots = selectedDate
    ? getSlotsForDate(selectedDate.getDate())
    : [];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onClose}
      />

      <div className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl bg-white rounded-2xl shadow-2xl z-50 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">
              {tradieDisplayName}'s Calendar
            </h3>
            <p className="text-sm text-gray-600">Select a date to view available time slots</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={previousMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <h4 className="font-semibold text-gray-900">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h4>
                  <button
                    onClick={nextMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {dayNames.map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
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
                    const hasSlots = hasAvailability(day);
                    const isSelected = selectedDate?.getDate() === day &&
                      selectedDate?.getMonth() === currentDate.getMonth();
                    const isToday = todayInfo.day === day &&
                      todayInfo.month === currentDate.getMonth() &&
                      todayInfo.year === currentDate.getFullYear();
                    const isPast = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).getTime() < todayInfo.midnight;

                    return (
                      <button
                        key={day}
                        onClick={() => handleDateClick(day)}
                        className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all relative min-w-[44px] min-h-[44px] ${
                          isSelected
                            ? 'bg-warm-500 text-white'
                            : isPast
                            ? 'opacity-50 hover:opacity-75'
                            : hasSlots
                            ? 'bg-secondary-50 text-secondary-800 hover:bg-secondary-100 font-semibold border border-secondary-200'
                            : 'hover:bg-gray-100 text-gray-700'
                        } ${isToday && !isSelected ? 'ring-2 ring-primary-500' : ''}`}
                      >
                        <span className={isPast && !isSelected ? 'text-gray-400' : ''}>
                          {day}
                        </span>
                        {hasSlots && !isSelected && (
                          <span className="absolute bottom-0.5 w-2 h-2 bg-secondary-500 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center flex-wrap gap-5 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-secondary-50 border-2 border-secondary-200 rounded" />
                    <span className="font-medium">Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-500 rounded" />
                    <span className="font-medium">Today</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h5 className="font-medium text-gray-900 mb-4">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-AU', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : 'Select a date'}
                </h5>

                {selectedDate ? (
                  selectedDaySlots.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedDaySlots.map((slot) => (
                        <button
                          key={slot.id}
                          onClick={() => handleSlotClick(slot)}
                          disabled={slot.status !== 'available'}
                          className={`w-full p-3 rounded-lg flex items-center gap-3 transition-all min-h-[44px] ${
                            slot.status === 'available'
                              ? 'bg-white border border-gray-200 hover:border-primary-500 hover:bg-primary-50 cursor-pointer'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">
                            {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                          </span>
                          <span
                            className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${
                              slot.status === 'available'
                                ? 'bg-secondary-100 text-secondary-700'
                                : slot.status === 'booked'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            {slot.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600 text-sm">No time slots available for this date.</p>
                  )
                ) : (
                  <p className="text-gray-600 text-sm">
                    Click on a highlighted date to see available time slots.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedSlot && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setSelectedSlot(null)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-md max-h-[90vh] flex flex-col">
            {bookingSuccess ? (
              <div className="text-center py-8 px-6">
                <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CalendarIcon className="w-8 h-8 text-secondary-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Booking Requested!</h3>
                <p className="text-gray-600">
                  Your booking request has been sent to {tradieDisplayName}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">Request Booking</h3>
                  <button
                    onClick={() => setSelectedSlot(null)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                  <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-5 h-5 text-primary-600" />
                      <h4 className="font-semibold text-gray-900">Choose Your Time</h4>
                    </div>
                    <p className="text-sm text-gray-700 mb-3">
                      {new Date(selectedSlot.start_time).toLocaleDateString('en-AU', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-gray-600 mb-3">
                      Available: {formatTime(selectedSlot.start_time)} - {formatTime(selectedSlot.end_time)}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                        <input
                          type="time"
                          step="300"
                          value={customStartTime}
                          onChange={(e) => setCustomStartTime(e.target.value)}
                          min={slotTimeRange.minTime}
                          max={slotTimeRange.maxTime}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                        <input
                          type="time"
                          step="300"
                          value={customEndTime}
                          onChange={(e) => setCustomEndTime(e.target.value)}
                          min={slotTimeRange.minTime}
                          max={slotTimeRange.maxTime}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        />
                      </div>
                    </div>
                    {!isValidTimeRange && customStartTime && customEndTime && (
                      <p className="text-xs text-red-600 mt-2">
                        Please select times within the available window
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Describe your project
                    </label>
                    <textarea {...proseInputProps}
                      value={bookingDescription}
                      onChange={(e) => setBookingDescription(e.target.value)}
                      placeholder="Tell the tradie about your project..."
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                    {tradie?.tradie_details?.trade_category && (
                      <details className="mt-2" open={bookingDescription.length < 40}>
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                          Quick-add suggestions for {tradie.tradie_details.trade_category}
                        </summary>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {getJobHints(tradie.tradie_details.trade_category).map((hint) => {
                            const isAdded = bookingDescription.includes(hint.replace(/:$/, ''));
                            return (
                              <button
                                key={hint}
                                type="button"
                                onClick={() => {
                                  if (!isAdded) {
                                    const separator = bookingDescription.trim() ? '. ' : '';
                                    setBookingDescription((prev) => prev.trim() + separator + hint + ' ');
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                  isAdded
                                    ? 'bg-secondary-50 text-secondary-600 border-secondary-200 cursor-default'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-warm-50 hover:border-warm-300 hover:text-warm-700'
                                }`}
                              >
                                {isAdded ? '✓ ' : '+ '}{hint}
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>

                  <div className="bg-warm-50 border border-warm-200 rounded-lg p-3">
                    <p className="text-sm text-warm-800 font-medium">
                      Please provide your contact details and job location so the tradie knows where to go.
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <User className="w-4 h-4 text-primary-600" />
                      Contact & Location
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Contact Name
                          <span className="text-red-500 ml-1">*</span>
                        </label>
                        <input
                          type="text"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="Your name"
                          required
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                            !contactName.trim() && selectedSlot ? 'border-red-300 bg-red-50' : 'border-gray-200'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Phone Number
                          <span className="text-red-500 ml-1">*</span>
                        </label>
                        <input
                          type="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="04XX XXX XXX"
                          required
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                            !contactPhone.trim() && selectedSlot ? 'border-red-300 bg-red-50' : 'border-gray-200'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Job Location Address
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      <AddressAutocomplete
                        value={locationAddress}
                        onChange={(value) => setLocationAddress(value)}
                        placeholder="Start typing the job address..."
                        className={`text-sm ${
                          !locationAddress.trim() && selectedSlot ? 'border-red-300 bg-red-50' : ''
                        }`}
                      />
                      {!locationAddress.trim() && selectedSlot && (
                        <p className="text-xs text-red-600 mt-1">Location address is required</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                        <Key className="w-3 h-3" />
                        Access Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={accessInstructions}
                        onChange={(e) => setAccessInstructions(e.target.value)}
                        placeholder="e.g., Gate code is 1234, key under mat..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-secondary-50 border border-secondary-100 px-3 py-2">
                        <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-secondary-500" />
                        <p className="text-[11px] text-secondary-800 leading-relaxed">
                          <span className="font-medium">For entry details only</span> — gate or alarm codes, where the key is, parking or lockbox info. Kept private and shown to your assigned tradie <span className="font-medium">only after they enter their security PIN</span>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Pictures (Optional)
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-primary-400 transition-colors cursor-pointer"
                    >
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 mb-1">Click to upload photos</p>
                      <p className="text-xs text-gray-600">PNG, JPG up to 10MB</p>
                    </div>

                    {selectedFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 bg-gray-50 rounded-lg p-3"
                          >
                            <img
                              src={filePreviewUrls[index]}
                              alt={file.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-gray-600">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {uploadError && (
                      <p className="mt-2 text-sm text-red-600">{uploadError}</p>
                    )}
                  </div>

                </div>

                <div className="border-t border-gray-100 p-6 bg-gray-50 rounded-b-2xl">
                  <button
                    onClick={handleBooking}
                    disabled={
                      !bookingDescription.trim() ||
                      !contactName.trim() ||
                      !contactPhone.trim() ||
                      !locationAddress.trim() ||
                      bookingLoading ||
                      !isValidTimeRange
                    }
                    className="w-full py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {bookingLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending Request...
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="w-5 h-5" />
                        Request Booking
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
