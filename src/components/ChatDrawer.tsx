import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Paperclip, Calendar, Loader2, ChevronLeft, ChevronRight, Clock, MapPin, Image as ImageIcon, User, DollarSign, AlertTriangle, Key, FileText, ShieldAlert, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TradieWithDetails, Message, AvailabilitySlot, BudgetType, JobComplexity } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { proseInputProps } from '../lib/proseInput';
import AddressAutocomplete from './AddressAutocomplete';
import { redactContactInfo, shouldAllowContactSharing } from '../lib/redaction';
import { redactName } from '../lib/contactGating';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tradie: TradieWithDetails | null;
}

function getTradieDisplayName(tradie: TradieWithDetails | null): string {
  if (!tradie) return 'Tradie';
  const d = tradie.tradie_details;
  const pro = d?.subscription_tier === 'pro' || d?.subscription_tier === 'business' || tradie.is_premium;
  return pro ? (d?.business_name || redactName(tradie.full_name)) : redactName(tradie.full_name);
}

export default function ChatDrawer({ isOpen, onClose, tradie }: ChatDrawerProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [jobImages, setJobImages] = useState<string[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [jobComplexity, setJobComplexity] = useState<JobComplexity>('standard');
  const [budgetType, setBudgetType] = useState<BudgetType>('request_quote');
  const [budgetAmount, setBudgetAmount] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, profile } = useAuth();

  useEffect(() => {
    if (isOpen && tradie && user) {
      initializeConversation();
      fetchAvailableSlots();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tradie, user]);

  useEffect(() => {
    if (profile) {
      setContactName(profile.full_name || '');
      setContactPhone(profile.phone || '');
    }
  }, [profile]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_id !== user?.id) {
            setMessages(prev => [...prev, newMsg]);
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) {
          console.error('Chat realtime subscription error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id]);

  const fetchAvailableSlots = async () => {
    if (!tradie) return;

    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const { data } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('tradie_id', tradie.id)
      .eq('status', 'available')
      .gte('start_time', new Date().toISOString())
      .lte('start_time', threeMonthsFromNow.toISOString())
      .order('start_time', { ascending: true });

    if (data) {
      setAvailableSlots(data as AvailabilitySlot[]);
    }
  };

  const initializeConversation = async () => {
    if (!tradie || !user) return;
    setMessages([]);
    setConversationId(null);
    setLoading(true);

    const { data: existingParticipations } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        conversation:conversations(*)
      `)
      .eq('user_id', user.id)
      .is('left_at', null);

    interface ParticipationRow {
      conversation_id: string;
      conversation: { id: string; is_group: boolean; [key: string]: unknown } | null;
    }

    if (existingParticipations) {
      const rows = existingParticipations as unknown as ParticipationRow[];
      const validParticipations = rows.filter(
        (p) => p.conversation && typeof p.conversation === 'object' && 'id' in p.conversation && !('error' in p.conversation)
      );
      for (const participation of validParticipations) {
        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', participation.conversation_id)
          .neq('user_id', user.id)
          .is('left_at', null);

        if (
          otherParticipants &&
          otherParticipants.length === 1 &&
          otherParticipants[0].user_id === tradie.id &&
          !participation.conversation?.is_group
        ) {
          setConversationId(participation.conversation_id);
          await fetchMessages(participation.conversation_id);
          setLoading(false);
          return;
        }
      }
    }

    const { data: newConversation } = await supabase
      .from('conversations')
      .insert({
        is_group: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (newConversation) {
      const convId = (newConversation as unknown as { id: string }).id;
      await supabase
        .from('conversation_participants')
        .insert([
          {
            conversation_id: convId,
            user_id: user.id,
            is_admin: true,
          },
          {
            conversation_id: convId,
            user_id: tradie.id,
            is_admin: true,
          },
        ]);

      setConversationId(convId);
      setMessages([]);
    }

    setLoading(false);
  };

  const fetchMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    setMessages((data || []) as Message[]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    availableSlots.forEach((slot) => {
      const dateKey = new Date(slot.start_time).toLocaleDateString('en-AU');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    });
    return map;
  }, [availableSlots]);

  const availableDateKeys = useMemo(() => new Set(Object.keys(slotsByDate)), [slotsByDate]);

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

  const selectedSlot = useMemo(() => {
    if (!selectedSlotId) return null;
    return availableSlots.find(s => s.id === selectedSlotId) || null;
  }, [selectedSlotId, availableSlots]);

  const timeOptionsForSlot = useMemo(() => {
    if (!selectedSlot) return [];
    const options: { value: string; label: string }[] = [];
    const start = new Date(selectedSlot.start_time);
    const end = new Date(selectedSlot.end_time);
    const current = new Date(start);

    while (current < end) {
      const timeValue = current.toISOString();
      const timeLabel = current.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      options.push({ value: timeValue, label: timeLabel });
      current.setMinutes(current.getMinutes() + 30);
    }
    return options;
  }, [selectedSlot]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    const maxSize = 10 * 1024 * 1024;
    const maxFiles = 5;
    const validFiles = Array.from(files).slice(0, maxFiles).filter(f => {
      if (f.size > maxSize) return false;
      if (!f.type.startsWith('image/')) return false;
      return true;
    });

    if (validFiles.length === 0) return;

    setUploadingImages(true);
    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${i}.${fileExt}`;

        const { error } = await supabase.storage
          .from('job-images')
          .upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('job-images')
          .getPublicUrl(fileName);

        uploadedUrls.push(urlData.publicUrl);
      }

      setJobImages([...jobImages, ...uploadedUrls]);
    } catch {
      // Upload failed silently - images won't be added
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSend = async (isBookingRequest = false) => {
    if (!newMessage.trim() || !tradie || !user || !conversationId) return;

    if (isBookingRequest && (!selectedSlotId || !selectedTime)) {
      setShowSlotPicker(true);
      return;
    }

    setSending(true);

    let jobId = null;
    if (isBookingRequest && selectedSlotId && selectedTime) {
      let projectId: string | null = null;

      const { data: existingProject } = await supabase
        .from('projects')
        .select('id')
        .eq('client_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingProject) {
        projectId = existingProject.id;
      } else {
        const tradieLabel = getTradieDisplayName(tradie);
        const { data: newProject } = await supabase
          .from('projects')
          .insert({
            client_id: user.id,
            title: tradieLabel,
            status: 'active',
          })
          .select('id')
          .single();

        if (newProject) {
          projectId = newProject.id;
        }
      }

      const { data: jobData } = await supabase
        .from('jobs')
        .insert({
          client_id: user.id,
          tradie_id: tradie.id,
          description: newMessage,
          status: 'pending',
          slot_id: selectedSlotId,
          scheduled_time: selectedTime,
          estimated_duration: estimatedDuration || null,
          images_url: jobImages.length > 0 ? jobImages : null,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          location_address: locationAddress || null,
          access_instructions: accessInstructions || null,
          job_complexity: jobComplexity,
          budget_type: budgetType,
          budget_amount: budgetType !== 'request_quote' && budgetAmount ? parseFloat(budgetAmount) : null,
          is_emergency: jobComplexity === 'emergency',
          project_id: projectId,
        })
        .select()
        .single();

      if (jobData) {
        jobId = (jobData as unknown as { id: string }).id;
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: tradie.id,
        conversation_id: conversationId,
        content: isBookingRequest ? `[Booking Request] ${newMessage}` : newMessage,
        is_booking_request: isBookingRequest,
        job_id: jobId,
      })
      .select()
      .single();

    if (!error && data) {
      const sentContent = (data as Message).content;
      setMessages([...messages, data as Message]);
      setNewMessage('');
      setSelectedSlotId(null);
      setSelectedTime(null);
      setShowSlotPicker(false);
      setSelectedDate(null);
      setEstimatedDuration('');
      setJobImages([]);
      setContactName('');
      setContactPhone('');
      setLocationAddress('');
      setAccessInstructions('');
      setJobComplexity('standard');
      setBudgetType('request_quote');
      setBudgetAmount('');
      await fetchAvailableSlots();

      // Notify recipient of new message
      try {
        const preview = (sentContent || '').slice(0, 80);
        await supabase.rpc('create_notification', {
          p_user_id: tradie.id,
          p_title: 'New Message',
          p_message: preview,
          p_type: 'new_message',
          p_channel: 'in_app',
          p_read: false,
          p_link: null,
          p_job_id: jobId || null,
          p_metadata: { conversation_id: conversationId, sender_id: user.id },
        });
      } catch {
        // Non-critical
      }
    }
    setSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const contactsUnlocked = useMemo(() => {
    if (!user || !tradie) return false;
    // Free tradies: always redact contact info to prevent bypassing the platform
    const d = tradie.tradie_details;
    const tradieIsPro = d?.subscription_tier === 'pro' || d?.subscription_tier === 'business' || tradie.is_premium;
    if (!tradieIsPro) return false;
    return shouldAllowContactSharing(messages, [user.id, tradie.id]);
  }, [messages, user, tradie]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-slide-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-lg font-bold text-primary-600">
                {tradie?.full_name?.charAt(0) || 'T'}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {getTradieDisplayName(tradie)}
              </h3>
              <p className="text-xs text-gray-500 capitalize">
                {tradie?.tradie_details?.trade_category}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onClose(); navigate('/messages'); }}
              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Open in full page"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Send className="w-8 h-8 text-gray-400" />
              </div>
              <h4 className="font-medium text-gray-900 mb-1">Start a conversation</h4>
              <p className="text-sm text-gray-600">
                Send a message to {getTradieDisplayName(tradie)} to discuss your job
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.sender_id === user?.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      isOwn
                        ? 'bg-warm-500 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-900 rounded-bl-md'
                    } ${message.is_booking_request ? 'border-2 border-warm-400' : ''}`}
                  >
                    {message.is_booking_request && (
                      <div className={`flex items-center gap-1 text-xs mb-1 ${isOwn ? 'text-primary-200' : 'text-warm-600'}`}>
                        <Calendar className="w-3 h-3" />
                        Booking Request
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">
                      {contactsUnlocked
                        ? message.content.replace('[Booking Request] ', '')
                        : redactContactInfo(message.content.replace('[Booking Request] ', ''))}
                    </p>
                    <p className={`text-xs mt-1 ${isOwn ? 'text-primary-200' : 'text-gray-400'}`}>
                      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {!contactsUnlocked && messages.length > 0 && (
            <div className="flex items-start gap-2 px-2 py-3 bg-warm-50 border border-warm-200 rounded-xl mx-1">
              <ShieldAlert className="w-4 h-4 text-warm-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-warm-700">
                Phone numbers and emails are hidden until both parties have sent a message. This keeps conversations on the platform.
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImages}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
              aria-label="Attach image"
            >
              {uploadingImages ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            <div className="flex-1 relative">
              <textarea
                {...proseInputProps}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                rows={1}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!newMessage.trim() || sending}
              className="p-3 bg-warm-500 text-white rounded-xl hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          <button
            onClick={() => {
              if (!newMessage.trim()) return;
              setShowSlotPicker(true);
            }}
            disabled={!newMessage.trim() || sending}
            className="mt-3 w-full py-2.5 border-2 border-dashed border-warm-300 text-warm-700 font-medium rounded-xl hover:bg-warm-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Calendar className="w-4 h-4" />
            {selectedTime
              ? `Booking for ${new Date(selectedTime).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} ✓`
              : 'Select Time & Request Booking'}
          </button>
        </div>
      </div>

      {showSlotPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Select Available Time</h3>
              <button
                onClick={() => setShowSlotPicker(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <h3 className="text-base font-semibold text-gray-900">
                      {currentMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                    </h3>
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-7 gap-2 mb-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
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
                            className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                              hasAvailability
                                ? isSelected
                                  ? 'bg-warm-500 text-white shadow-md'
                                  : isPast
                                  ? 'bg-green-50/50 text-green-500 opacity-50 hover:opacity-75 border border-green-100'
                                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                                : isPast
                                ? 'text-gray-300 opacity-50'
                                : 'text-gray-400 cursor-not-allowed'
                            } ${isToday && !isSelected ? 'ring-2 ring-warm-300' : ''}`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {availableSlots.length === 0 ? (
                  <div className="bg-warm-50 border border-warm-200 rounded-lg p-4">
                    <p className="text-sm text-warm-800">
                      This tradie hasn't set their availability yet. Please send a regular message to discuss timing.
                    </p>
                  </div>
                ) : selectedDate ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {selectedSlotId ? 'Select Your Preferred Time' : `Available Windows for ${selectedDate}`}
                      </h4>

                      {!selectedSlotId ? (
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

                            return (
                              <button
                                key={slot.id}
                                onClick={() => {
                                  setSelectedSlotId(slot.id);
                                  setSelectedTime(null);
                                }}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 border-gray-200 bg-white hover:border-warm-300 transition-all"
                              >
                                <span className="text-sm font-medium text-gray-900">{timeRange}</span>
                                <span className="text-xs text-gray-600">Select time</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <button
                            onClick={() => {
                              setSelectedSlotId(null);
                              setSelectedTime(null);
                            }}
                            className="text-sm text-warm-600 hover:text-warm-700 font-medium flex items-center gap-1"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Back to time windows
                          </button>

                          <div className="bg-warm-50 border border-warm-200 rounded-lg p-3 mb-3">
                            <p className="text-sm text-warm-800">
                              Available window: {selectedSlot && (
                                <>
                                  {new Date(selectedSlot.start_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                                  {' - '}
                                  {new Date(selectedSlot.end_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                                </>
                              )}
                            </p>
                          </div>

                          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                            {timeOptionsForSlot.map((option) => (
                              <button
                                key={option.value}
                                onClick={() => setSelectedTime(option.value)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                                  selectedTime === option.value
                                    ? 'bg-warm-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 text-center">
                    Click on a green date to see available time slots
                  </p>
                )}
              </div>

              <div className="mt-6 space-y-6 border-t border-gray-200 pt-6">
                <div className="bg-warm-50 border border-warm-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-warm-800 font-medium">
                    Please provide your contact details and job location so the tradie knows where to go.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-warm-600" />
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
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-500 focus:border-transparent ${
                          !contactName.trim() && selectedTime ? 'border-red-300 bg-red-50' : 'border-gray-200'
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
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-500 focus:border-transparent ${
                          !contactPhone.trim() && selectedTime ? 'border-red-300 bg-red-50' : 'border-gray-200'
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
                        !locationAddress.trim() && selectedTime ? 'border-red-300 bg-red-50' : ''
                      }`}
                    />
                    {!locationAddress.trim() && selectedTime && (
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-[11px] text-gray-500 flex items-start gap-1">
                      <Key className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
                      Kept private and only shown to your assigned tradie after they enter their security PIN. Share gate codes, key locations, or alarm details safely.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-warm-600" />
                    Job Details
                  </h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Job Complexity</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setJobComplexity('standard')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                          jobComplexity === 'standard'
                            ? 'bg-green-100 text-green-700 border-2 border-green-500'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setJobComplexity('emergency')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                          jobComplexity === 'emergency'
                            ? 'bg-red-100 text-red-700 border-2 border-red-500'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        Emergency
                      </button>
                      <button
                        type="button"
                        onClick={() => setJobComplexity('complex')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                          jobComplexity === 'complex'
                            ? 'bg-warm-100 text-warm-700 border-2 border-warm-500'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        Complex
                      </button>
                    </div>
                    {jobComplexity === 'emergency' && (
                      <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Urgent jobs may incur additional fees
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Estimated Duration
                    </label>
                    <select
                      value={estimatedDuration}
                      onChange={(e) => setEstimatedDuration(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-500 focus:border-transparent"
                    >
                      <option value="">Select duration...</option>
                      <option value="1 hour">1 Hour</option>
                      <option value="2 hours">2 Hours</option>
                      <option value="3 hours">3 Hours</option>
                      <option value="4 hours">4 Hours</option>
                      <option value="Half Day">Half Day (4-6 hours)</option>
                      <option value="Full Day">Full Day (8+ hours)</option>
                      <option value="Multiple Days">Multiple Days</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      Photos (Optional)
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImages}
                      className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-warm-400 transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-warm-600 disabled:opacity-50 text-sm"
                    >
                      {uploadingImages ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-4 h-4" />
                          Add Photos
                        </>
                      )}
                    </button>
                    {jobImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {jobImages.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                            <img src={url} alt={`Job ${idx + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            <button
                              onClick={() => setJobImages(jobImages.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-warm-600" />
                    Budget Preference
                  </h4>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-warm-300 transition-colors">
                      <input
                        type="radio"
                        name="budgetType"
                        checked={budgetType === 'request_quote'}
                        onChange={() => setBudgetType('request_quote')}
                        className="w-4 h-4 text-warm-600 border-gray-300 focus:ring-warm-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">Request a Quote</span>
                        <p className="text-xs text-gray-600">Let the tradie provide pricing</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-warm-300 transition-colors">
                      <input
                        type="radio"
                        name="budgetType"
                        checked={budgetType === 'fixed_budget'}
                        onChange={() => setBudgetType('fixed_budget')}
                        className="w-4 h-4 text-warm-600 border-gray-300 focus:ring-warm-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">I Have a Budget</span>
                        <p className="text-xs text-gray-600">Set a fixed price for the job</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-warm-300 transition-colors">
                      <input
                        type="radio"
                        name="budgetType"
                        checked={budgetType === 'hourly_rate'}
                        onChange={() => setBudgetType('hourly_rate')}
                        className="w-4 h-4 text-warm-600 border-gray-300 focus:ring-warm-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">Hourly Rate</span>
                        <p className="text-xs text-gray-600">Pay by the hour</p>
                      </div>
                    </label>
                    {budgetType !== 'request_quote' && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {budgetType === 'fixed_budget' ? 'Your Budget Amount' : 'Max Hourly Rate'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <input
                            type="number"
                            value={budgetAmount}
                            onChange={(e) => setBudgetAmount(e.target.value)}
                            placeholder={budgetType === 'fixed_budget' ? '500' : '75'}
                            className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowSlotPicker(false);
                  setSelectedSlotId(null);
                  setSelectedTime(null);
                  setSelectedDate(null);
                  setEstimatedDuration('');
                  setJobImages([]);
                  setContactName('');
                  setContactPhone('');
                  setLocationAddress('');
                  setAccessInstructions('');
                  setJobComplexity('standard');
                  setBudgetType('request_quote');
                  setBudgetAmount('');
                }}
                className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSend(true)}
                disabled={
                  !selectedSlotId ||
                  !selectedTime ||
                  !contactName.trim() ||
                  !contactPhone.trim() ||
                  !locationAddress.trim() ||
                  sending
                }
                className="px-5 py-2.5 bg-warm-500 text-white rounded-lg hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium min-h-[44px]"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Booking Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
