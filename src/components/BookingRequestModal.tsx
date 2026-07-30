import { proseInputProps } from '../lib/proseInput';
import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Loader2, AlertCircle, Clock, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Job, Profile, Message, AvailabilitySlot } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import JobDetailsCard from './JobDetailsCard';

type MessageWithProfiles = Message & {
  sender_profile: Profile;
  receiver_profile: Profile;
};

type TabType = 'details' | 'availability';

interface BookingRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  conversationId: string;
  onReply: (message: string) => Promise<void>;
}

export default function BookingRequestModal({
  isOpen,
  onClose,
  messageId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  conversationId: _conversationId,
  onReply,
}: BookingRequestModalProps) {
  const { user, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [client, setClient] = useState<Profile | null>(null);
  const [tradie, setTradie] = useState<Profile | null>(null);
  const [message, setMessage] = useState<MessageWithProfiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAllSlots, setShowAllSlots] = useState(false);

  const isTradie = profile?.role === 'tradie';

  useEffect(() => {
    if (isOpen && messageId) {
      fetchBookingDetails();
    }
  }, [isOpen, messageId]);

  useEffect(() => {
    if (job?.slot_id && availabilitySlots.length > 0) {
      const requestedSlot = availabilitySlots.find(s => s.id === job.slot_id);
      if (requestedSlot) {
        const dateKey = new Date(requestedSlot.start_time).toLocaleDateString('en-AU');
        setSelectedDate(dateKey);
        setActiveTab('availability');
      }
    }
  }, [job, availabilitySlots]);

  const fetchBookingDetails = async () => {
    if (!user) return;
    setLoading(true);

    const { data: messageData } = await supabase
      .from('messages')
      .select('*, sender_profile:profiles!messages_sender_id_fkey(*), receiver_profile:profiles!messages_receiver_id_fkey(*)')
      .eq('id', messageId)
      .single();

    if (messageData) {
      setMessage(messageData as MessageWithProfiles);

      let tradieProfileId: string | null = null;
      const msgWithProfiles = messageData as unknown as MessageWithProfiles;

      if (isTradie) {
        setClient(msgWithProfiles.sender_profile);
        setTradie(msgWithProfiles.receiver_profile);
        tradieProfileId = user.id;

        const { data: connectionData } = await supabase
          .from('connections')
          .select('*')
          .eq('tradie_id', user.id)
          .eq('client_id', msgWithProfiles.sender_id)
          .maybeSingle();

        setIsUnlocked(!!connectionData);
      } else {
        setClient(msgWithProfiles.sender_profile);
        setTradie(msgWithProfiles.receiver_profile);
        tradieProfileId = msgWithProfiles.receiver_id;
      }

      if (msgWithProfiles.job_id) {
        const { data: jobData } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', msgWithProfiles.job_id)
          .single();

        if (jobData) {
          const typedJob = jobData as unknown as Job;
          setJob(typedJob);
          if (typedJob.tradie_id) {
            tradieProfileId = typedJob.tradie_id;
          }
        }
      }

      if (tradieProfileId) {
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

        const { data: slotsData, error: slotsError } = await supabase
          .from('availability_slots')
          .select('*')
          .eq('tradie_id', tradieProfileId)
          .eq('status', 'available')
          .gte('start_time', new Date().toISOString())
          .lte('start_time', threeMonthsFromNow.toISOString())
          .order('start_time', { ascending: true });

        if (slotsError) {
          // Slots fetch failed - calendar will show empty
        }

        if (slotsData) {
          setAvailabilitySlots(slotsData as AvailabilitySlot[]);
        }
      }
    }

    setLoading(false);
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    await onReply(replyText);
    setReplyText('');
    setSending(false);
  };

  const { daysInMonth, startingDayOfWeek } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { daysInMonth: lastDay.getDate(), startingDayOfWeek: firstDay.getDay() };
  }, [currentMonth]);

  const slotsByDate = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    availabilitySlots.forEach((slot) => {
      const dateKey = new Date(slot.start_time).toLocaleDateString('en-AU');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    });
    return map;
  }, [availabilitySlots]);

  const availableDateKeys = useMemo(() => {
    return new Set(Object.keys(slotsByDate));
  }, [slotsByDate]);

  const hasAvailabilityOnDate = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateKey = date.toLocaleDateString('en-AU');
    return availableDateKeys.has(dateKey);
  };

  const selectedDateSlots = useMemo(() => {
    if (!selectedDate) return [];
    return slotsByDate[selectedDate] || [];
  }, [selectedDate, slotsByDate]);

  const todayDateString = new Date().toDateString();

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-ct-surface rounded-ct-md shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header - Pinned to Top */}
        <div className="flex-none p-6 border-b border-ct-line-soft flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ct-teal rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-ct-ink" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ct-paper">Booking Request</h2>
              {client && (
                <p className="text-sm text-ct-mute-2">
                  From {client.full_name} {message?.created_at && `• ${new Date(message.created_at).toLocaleDateString('en-AU')}`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-ct-mute" />
          </button>
        </div>

        {/* Tabs - Pinned Below Header */}
        <div className="flex-none border-b border-ct-line bg-ct-surface-2">
          <div className="flex">
            <button
              onClick={() => setActiveTab('details')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors min-h-[44px] ${
                activeTab === 'details'
                  ? 'text-ct-amber border-b-2 border-ct-teal/30 bg-ct-surface'
                  : 'text-ct-mute-2 hover:text-ct-paper'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('availability')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors min-h-[44px] ${
                activeTab === 'availability'
                  ? 'text-ct-amber border-b-2 border-ct-teal/30 bg-ct-surface'
                  : 'text-ct-mute-2 hover:text-ct-paper'
              }`}
            >
              Availability
            </button>
          </div>
        </div>

        {/* Scrollable Body - The Middle */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-ct-amber animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <>
                  {job && (
                    <>
                      <JobDetailsCard
                        job={job}
                        client={client}
                        isUnlocked={isUnlocked}
                        showClientDetails={isTradie}
                      />

                      {job.is_emergency && (
                        <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm p-4">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-ct-rose" />
                            <p className="text-sm font-medium text-ct-paper">Emergency Job - Immediate Attention Required</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="border-t border-ct-line pt-6">
                    <h3 className="text-sm font-medium text-ct-mute-2 mb-3">Send a Message</h3>
                    <textarea {...proseInputProps}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={
                        isTradie && !isUnlocked
                          ? 'Unlock this lead to send messages...'
                          : 'Ask for more details or confirm the booking...'
                      }
                      disabled={(isTradie && !isUnlocked) || sending}
                      rows={4}
                      className="w-full px-4 py-3 border border-ct-line rounded-ct-sm resize-none focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal transition-all disabled:bg-ct-surface-2 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              )}

              {activeTab === 'availability' && (
                <>
                  {tradie && (
                    <div className="p-3 bg-ct-surface-2 border border-ct-line rounded-ct-sm text-sm text-ct-mute-2">
                      <strong>Viewing availability for:</strong> {tradie.full_name || 'Tradie'}
                      <br />
                      <strong>Total available slots:</strong> {availabilitySlots.length}
                    </div>
                  )}

                  <div className="bg-ct-surface border border-ct-line rounded-ct-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-ct-surface-2 border-b border-ct-line">
                      <button
                        onClick={previousMonth}
                        className="p-2 hover:bg-ct-line rounded-ct-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <ChevronLeft className="w-5 h-5 text-ct-mute-2" />
                      </button>
                      <h3 className="text-base font-semibold text-ct-paper">
                        {currentMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                      </h3>
                      <button
                        onClick={nextMonth}
                        className="p-2 hover:bg-ct-line rounded-ct-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <ChevronRight className="w-5 h-5 text-ct-mute-2" />
                      </button>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-7 gap-2 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                          <div key={day} className="text-center text-xs font-medium text-ct-mute py-2">
                            {day}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                          <div key={`empty-${i}`} className="aspect-square" />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const hasAvailability = hasAvailabilityOnDate(day);
                          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                          const dateKey = date.toLocaleDateString('en-AU');
                          const isSelected = selectedDate === dateKey;
                          const isToday = todayDateString === date.toDateString();
                          const now = new Date();
                          const isPast = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());

                          return (
                            <button
                              key={day}
                              onClick={() => setSelectedDate(hasAvailability ? dateKey : null)}
                              disabled={!hasAvailability}
                              className={`aspect-square rounded-ct-sm text-sm font-medium transition-all ${
                                hasAvailability
                                  ? isSelected
                                    ? 'bg-ct-teal text-ct-ink shadow-md'
                                    : isPast
                                    ? 'bg-ct-teal/[0.14]/50 text-ct-teal opacity-50 hover:opacity-75 border border-ct-teal/30'
                                    : 'bg-ct-teal/[0.14] text-ct-teal hover:bg-ct-teal/[0.14] border border-ct-teal/30'
                                  : isPast
                                  ? 'text-ct-mute opacity-50'
                                  : 'text-ct-mute cursor-not-allowed'
                              } ${isToday && !isSelected ? 'ring-2 ring-ct-teal' : ''}`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {availabilitySlots.length === 0 ? (
                    <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm p-4">
                      <p className="text-sm text-ct-paper flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {isTradie
                          ? 'You haven\'t set any available time slots yet. Go to your dashboard to add availability.'
                          : 'The tradie hasn\'t set their availability yet. Green dates will appear when slots are available.'}
                      </p>
                    </div>
                  ) : selectedDate ? (
                    <div className="bg-ct-surface-2 rounded-ct-sm p-4 border border-ct-line">
                      <h4 className="text-sm font-medium text-ct-mute-2 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Available Times for {selectedDate}
                      </h4>
                      <div className="space-y-2">
                        {selectedDateSlots.map((slot) => {
                          const startDate = new Date(slot.start_time);
                          const endDate = new Date(slot.end_time);
                          const timeRange = `${startDate.toLocaleTimeString('en-AU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })} - ${endDate.toLocaleTimeString('en-AU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`;
                          const isRequestedSlot = job?.slot_id === slot.id;

                          return (
                            <div
                              key={slot.id}
                              className={`flex items-center justify-between px-4 py-3 rounded-ct-sm border-2 ${
                                isRequestedSlot
                                  ? 'bg-ct-amber/[0.13] border-ct-teal'
                                  : 'bg-ct-surface border-ct-line'
                              }`}
                            >
                              <span className="text-sm font-medium text-ct-paper">{timeRange}</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                isRequestedSlot
                                  ? 'bg-ct-teal text-ct-ink'
                                  : 'bg-ct-teal/[0.14] text-ct-teal'
                              }`}>
                                {isRequestedSlot ? 'Requested' : 'Available'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-ct-mute-2 text-center">
                        {isTradie
                          ? 'Green dates show your available time slots'
                          : 'Click on a green date to see available time slots'}
                      </p>

                      {availabilitySlots.length > 0 && (
                        <div className="bg-ct-surface-2 rounded-ct-sm p-4 border border-ct-line">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-ct-mute-2">All Available Slots</h4>
                            {availabilitySlots.length > 10 && (
                              <button
                                onClick={() => setShowAllSlots(!showAllSlots)}
                                className="text-xs text-ct-mute-2 hover:text-ct-mute-2 font-medium"
                              >
                                {showAllSlots ? 'Show Less' : `Show All (${availabilitySlots.length})`}
                              </button>
                            )}
                          </div>
                          <div className="space-y-2 max-h-60 overflow-y-auto messages-scrollbar">
                            {(showAllSlots ? availabilitySlots : availabilitySlots.slice(0, 10)).map((slot) => {
                              const startDate = new Date(slot.start_time);
                              const endDate = new Date(slot.end_time);
                              return (
                                <div key={slot.id} className="text-xs bg-ct-surface p-2 rounded-ct-xs border border-ct-line">
                                  <strong>{startDate.toLocaleDateString('en-AU')}</strong>
                                  {' '}
                                  {startDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                                  {' - '}
                                  {endDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              );
                            })}
                            {!showAllSlots && availabilitySlots.length > 10 && (
                              <button
                                onClick={() => setShowAllSlots(true)}
                                className="w-full py-2 text-sm font-medium text-ct-mute-2 hover:text-ct-mute-2 bg-ct-surface-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                              >
                                Click to view {availabilitySlots.length - 10} more slots
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer - Pinned to Bottom */}
        <div className="flex-none p-6 border-t border-ct-line-soft bg-ct-surface-2 rounded-b-ct-lg">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors font-medium min-h-[44px]"
            >
              Close
            </button>
            {activeTab === 'details' && (
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || sending || (isTradie && !isUnlocked)}
                className="px-5 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium min-h-[44px]"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Reply
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
