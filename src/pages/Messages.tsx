import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Loader2, Paperclip, Calendar, X, Lock, Image as ImageIcon, FileText, Mic, Settings, Archive, Search as SearchIcon, RotateCcw, AlertTriangle, CheckCheck, ArrowLeft, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Message, Conversation, ConversationParticipant, Profile } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import UnlockLeadModal from '../components/UnlockLeadModal';
import ConversationSettingsModal from '../components/ConversationSettingsModal';
import BookingRequestModal from '../components/BookingRequestModal';
import { redactContactInfo, shouldAllowContactSharing, detectCrossMessageDigitBypass } from '../lib/redaction';
import EmptyState from '../components/EmptyState';

interface ConversationWithDetails extends Conversation {
  job_id?: string; // Add this line to include job_id
  participants: (ConversationParticipant & { profile?: Profile })[];
  lastMessage?: Message & { sender_profile?: Profile };
  messages: (Message & { sender_profile?: Profile })[];
  unreadCount: number;
  isUnlocked?: boolean;
  myParticipation?: ConversationParticipant;
  otherParticipants: (ConversationParticipant & { profile?: Profile })[];
  otherParticipantTier?: string | null;
}

export default function Messages() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [unlockedClientIds, setUnlockedClientIds] = useState<string[]>([]);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showArchivedFilter, setShowArchivedFilter] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [showBookingRequestModal, setShowBookingRequestModal] = useState(false);
  const [selectedBookingMessageId, setSelectedBookingMessageId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [toast, setToast] = useState<{ message: string; show: boolean; isError?: boolean }>({ message: '', show: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [failedMessages, setFailedMessages] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const pendingSelectTradieRef = useRef<string | null>(null);

  const isTradie = profile?.role === 'tradie';

  useEffect(() => {
    if (user) {
      if (isTradie) {
        fetchUnlockedConnections();
      }
      fetchConversations();
    }
  }, [user, isTradie, showArchivedFilter]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as Message & { sender_profile?: Profile };
          if (newMsg.sender_id === user.id) return;

          setConversations(prev => prev.map(conv => {
            if (conv.id !== newMsg.conversation_id) return conv;
            return {
              ...conv,
              messages: [...conv.messages, newMsg],
              lastMessage: newMsg,
              unreadCount: conv.unreadCount + 1,
            };
          }));

          setSelectedConversation(prev => {
            if (!prev || prev.id !== newMsg.conversation_id) return prev;
            return {
              ...prev,
              messages: [...prev.messages, newMsg],
              lastMessage: newMsg,
            };
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error('Messages realtime subscription error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Typing indicator: subscribe to realtime changes for the selected conversation
  useEffect(() => {
    if (!user || !selectedConversation) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase
      .channel(`typing-${selectedConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        (payload) => {
          const record = payload.new as { user_id: string; is_typing: boolean } | undefined;
          if (!record || record.user_id === user.id) return;
          setTypingUsers(prev => {
            if (record.is_typing) {
              return prev.includes(record.user_id) ? prev : [...prev, record.user_id];
            }
            return prev.filter(id => id !== record.user_id);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setTypingUsers([]);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedConversation?.id]);

  // Mark messages as read when viewing a conversation (update read_at for unread messages)
  useEffect(() => {
    if (!selectedConversation || !user) return;
    const unreadMessages = selectedConversation.messages.filter(
      m => m.sender_id !== user.id && !m.read_at
    );
    if (unreadMessages.length > 0) {
      supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', selectedConversation.id)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .then();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id, selectedConversation?.messages?.length]);

  const setTypingStatus = useCallback(async (conversationId: string, isTyping: boolean) => {
    if (!user) return;
    await supabase
      .from('typing_indicators')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: user.id,
          is_typing: isTyping,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'conversation_id,user_id' }
      );
  }, [user]);

  const handleTyping = useCallback(() => {
    if (!selectedConversation) return;
    setTypingStatus(selectedConversation.id, true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (selectedConversation) {
        setTypingStatus(selectedConversation.id, false);
      }
    }, 3000);
  }, [selectedConversation, setTypingStatus]);

  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && conversations.length > 0 && !selectedConversation) {
      const targetConversation = conversations.find(c => c.id === conversationId);
      if (targetConversation) {
        handleConversationClick(targetConversation);
        searchParams.delete('conversation');
        setSearchParams(searchParams);
      }
    }
  }, [conversations, searchParams]);

  // Auto-create or open conversation when navigating from "Ask a Question"
  const creatingConvRef = useRef(false);
  useEffect(() => {
    const tradieId = searchParams.get('tradie');
    if (!tradieId || !user || loading || creatingConvRef.current) return;

    // Check if conversation with this tradie already exists
    const existing = conversations.find(c =>
      c.otherParticipants.some(p => p.user_id === tradieId)
    );

    if (existing) {
      handleConversationClick(existing);
      searchParams.delete('tradie');
      searchParams.delete('job');
      setSearchParams(searchParams);
      return;
    }

    // Create new conversation
    creatingConvRef.current = true;

    const createConversation = async () => {
      try {
        // Get tradie's name for conversation title
        const { data: tradieProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', tradieId)
          .maybeSingle();

        const title = tradieProfile?.full_name
          ? `Chat with ${tradieProfile.full_name}`
          : null;

        const { data: conv, error: convError } = await supabase
          .from('conversations')
          .insert({ created_by: user.id, title })
          .select()
          .single();

        if (convError || !conv) throw convError;

        // Add both participants
        const { error: partError } = await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: conv.id, user_id: user.id },
            { conversation_id: conv.id, user_id: tradieId },
          ]);

        if (partError) throw partError;

        // Clear params and mark for auto-select after reload
        pendingSelectTradieRef.current = tradieId;
        searchParams.delete('tradie');
        searchParams.delete('job');
        setSearchParams(searchParams);

        // Reload conversations — the pending ref will trigger auto-select
        await fetchConversations();
      } catch (err) {
        console.error('Failed to create conversation:', err);
        setToast({ message: 'Failed to start conversation. Please try again.', show: true, isError: true });
        searchParams.delete('tradie');
        searchParams.delete('job');
        setSearchParams(searchParams);
      } finally {
        creatingConvRef.current = false;
      }
    };

    createConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, searchParams, user?.id, loading]);

  // Auto-select newly created conversation
  useEffect(() => {
    if (!pendingSelectTradieRef.current || conversations.length === 0) return;
    const tradieId = pendingSelectTradieRef.current;
    const newConv = conversations.find(c =>
      c.otherParticipants.some(p => p.user_id === tradieId)
    );
    if (newConv) {
      handleConversationClick(newConv);
      pendingSelectTradieRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  useEffect(() => {
    if (selectedConversation) {
      const currentMessageCount = selectedConversation.messages.length;
      const prevMessageCount = prevMessageCountRef.current;

      if (currentMessageCount > prevMessageCount) {
        const container = messagesContainerRef.current;
        if (container) {
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          if (isNearBottom || prevMessageCount === 0) {
            scrollToBottom();
          }
        } else {
          scrollToBottom();
        }
      }

      prevMessageCountRef.current = currentMessageCount;
    }
  }, [selectedConversation?.messages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setAttachmentMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUnlockedConnections = async () => {
    if (!user || !isTradie) return;

    const { data } = await supabase
      .from('connections')
      .select('client_id')
      .eq('tradie_id', user.id);

    if (data) {
      setUnlockedClientIds(data.map((c) => c.client_id));
    }
  };

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: myParticipations } = await supabase
      .from('conversation_participants')
      .select(`
        *,
        conversation:conversations(*)
      `)
      .eq('user_id', user.id)
      .is('left_at', null)
      .order('joined_at', { ascending: false });

    if (myParticipations) {
      const conversationsWithDetails = await Promise.all(
        myParticipations
          .filter((mp: ConversationParticipant & { conversation: Conversation; archived_at: string | null }) => showArchivedFilter ? mp.archived_at !== null : mp.archived_at === null)
          .map(async (mp: ConversationParticipant & { conversation: Conversation; archived_at: string | null }) => {
            const conv = mp.conversation;

            const { data: allParticipants } = await supabase
              .from('conversation_participants')
              .select('*, profile:profiles(*)')
              .eq('conversation_id', conv.id)
              .is('left_at', null);

            const { data: messages } = await supabase
              .from('messages')
              .select('*, sender_profile:profiles!messages_sender_id_fkey(full_name, email)')
              .eq('conversation_id', conv.id)
              .is('deleted_at', null)
              .order('created_at', { ascending: true })
              .limit(50);

            const otherParticipants = (allParticipants || []).filter((p: { user_id: string }) => p.user_id !== user.id);
            const isUnlocked = !isTradie || otherParticipants.every((p: { user_id: string }) => unlockedClientIds.includes(p.user_id));

            // Fetch subscription tier for the other participant (to determine redaction rules)
            let otherParticipantTier: string | null = null;
            const otherUserId = otherParticipants[0]?.user_id;
            if (otherUserId) {
              const { data: td } = await supabase
                .from('tradie_details')
                .select('subscription_tier')
                .eq('profile_id', otherUserId)
                .maybeSingle();
              otherParticipantTier = td?.subscription_tier || null;
            }

            const unreadCount = (messages || []).filter(
              (m: { receiver_id: string | null; read_at: string | null }) => m.receiver_id === user.id && !m.read_at
            ).length;

            return {
              ...conv,
              participants: allParticipants || [],
              lastMessage: messages && messages.length > 0 ? messages[messages.length - 1] : undefined,
              messages: messages || [],
              unreadCount,
              isUnlocked,
              myParticipation: mp,
              otherParticipants,
              otherParticipantTier,
            };
          })
      );

      conversationsWithDetails.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setConversations(conversationsWithDetails);
    }

    setLoading(false);
  }, [user, isTradie, unlockedClientIds, showArchivedFilter]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUnlock = async () => {
    if (!selectedConversation || !user) return;

    const otherUserId = selectedConversation.otherParticipants[0]?.user_id;
    if (!otherUserId) return;

    const { error } = await supabase
      .from('connections')
      .insert({
        tradie_id: user.id,
        client_id: otherUserId,
      });

    if (!error) {
      const newUnlockedIds = [...unlockedClientIds, otherUserId];
      setUnlockedClientIds(newUnlockedIds);
      await fetchConversations();
    }
  };

  const handleConversationClick = async (conv: ConversationWithDetails) => {
    prevMessageCountRef.current = 0;
    setSelectedConversation(conv);

    if (conv.unreadCount > 0 && user) {
      const unreadIds = conv.messages
        .filter((m: Message & { sender_profile?: Profile }) => m.receiver_id === user.id && !m.read_at)
        .map((m: Message & { sender_profile?: Profile }) => m.id);

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds);

        setConversations(prev =>
          prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)
        );
      }
    }

  };

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride || newMessage;
    if (!messageToSend.trim() || !selectedConversation || !user) return;

    setSending(true);

    const messageContent = messageToSend;

    const otherParticipants = selectedConversation.participants.filter(p => p.user_id !== user.id);
    const receiverId = otherParticipants[0]?.user_id || user.id;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        conversation_id: selectedConversation.id,
        content: messageContent,
        is_booking_request: false,
      })
      .select('*, sender_profile:profiles!messages_sender_id_fkey(full_name, email)')
      .single();

    if (!error && data) {
      const updatedConv = {
        ...selectedConversation,
        messages: [...selectedConversation.messages, data],
        lastMessage: data,
      };
      setSelectedConversation(updatedConv);
      setConversations(prev =>
        prev.map(c => c.id === selectedConversation.id ? updatedConv : c)
      );
      setNewMessage('');
      // Clear typing status on send
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTypingStatus(selectedConversation.id, false);

      // Notify recipient
      try {
        await supabase.from('notifications').insert({
          user_id: receiverId,
          type: 'new_message',
          title: 'New Message',
          message: messageContent.slice(0, 80),
          metadata: { conversation_id: selectedConversation.id, sender_id: user.id },
          read: false,
        });
      } catch {
        // Non-critical
      }
    } else if (error) {
      // Track failed message for retry
      const failedId = `${Date.now()}`;
      setFailedMessages(prev => new Set(prev).add(failedId));
      setToast({ message: 'Message failed to send. Tap to retry.', show: true, isError: true });
      setTimeout(() => setToast({ message: '', show: false }), 4000);
    }
    setSending(false);
  };

  const handleRetryMessage = async (content: string) => {
    setFailedMessages(new Set());
    // Pass content directly to handleSend to avoid stale state
    await handleSend(content);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending) handleSend();
    }
  };

  const handleBookingRequestClick = (messageId: string) => {
    setSelectedBookingMessageId(messageId);
    setShowBookingRequestModal(true);
  };

  const handleBookingRequestReply = async (replyMessage: string) => {
    if (!selectedConversation || !user) return;

    const otherParticipants = selectedConversation.participants.filter(p => p.user_id !== user.id);
    const receiverId = otherParticipants[0]?.user_id || user.id;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        conversation_id: selectedConversation.id,
        content: replyMessage,
        is_booking_request: false,
      })
      .select('*, sender_profile:profiles!messages_sender_id_fkey(full_name, email)')
      .single();

    if (!error && data) {
      const updatedConv = {
        ...selectedConversation,
        messages: [...selectedConversation.messages, data],
        lastMessage: data,
      };
      setSelectedConversation(updatedConv);
      setConversations(prev =>
        prev.map(c => c.id === selectedConversation.id ? updatedConv : c)
      );
      setShowBookingRequestModal(false);
    }
  };

  const getAttachmentType = (file: File): string => {
    const mimeType = file.type;
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConversation || !user) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setToast({ message: 'File size must be less than 10MB', show: true, isError: true });
      setTimeout(() => setToast({ message: '', show: false }), 3000);
      return;
    }

    setUploadingFile(true);
    setAttachmentMenuOpen(false);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const attachmentType = getAttachmentType(file);
      const otherParticipants = selectedConversation.participants.filter(p => p.user_id !== user.id);
      const receiverId = otherParticipants[0]?.user_id || user.id;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: receiverId,
          conversation_id: selectedConversation.id,
          content: `Sent a ${attachmentType}`,
          is_booking_request: false,
          attachment_url: fileName,
          attachment_type: attachmentType,
          attachment_name: file.name,
          attachment_size: file.size,
        })
        .select('*, sender_profile:profiles!messages_sender_id_fkey(full_name, email)')
        .single();

      if (!error && data) {
        const updatedConv = {
          ...selectedConversation,
          messages: [...selectedConversation.messages, data],
          lastMessage: data,
        };
        setSelectedConversation(updatedConv);
        setConversations(prev =>
          prev.map(c => c.id === selectedConversation.id ? updatedConv : c)
        );
      }
    } catch {
      setToast({ message: 'Failed to upload file. Please try again.', show: true, isError: true });
      setTimeout(() => setToast({ message: '', show: false }), 3000);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAttachmentClick = (acceptType: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptType;
      fileInputRef.current.click();
    }
    setAttachmentMenuOpen(false);
  };

  const getAttachmentUrl = (fileName: string) => {
    const { data } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(fileName);
    return data.publicUrl;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  const getOtherParticipantName = (conv: ConversationWithDetails) => {
    const other = conv.otherParticipants[0]?.profile;
    return other?.full_name || 'Unknown User';
  };

  const formatMessageDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const shouldShowDateSeparator = (messages: (Message & { sender_profile?: Profile })[], index: number) => {
    if (index === 0) return true;
    const current = new Date(messages[index].created_at).toDateString();
    const previous = new Date(messages[index - 1].created_at).toDateString();
    return current !== previous;
  };

  const getConversationTitle = (conv: ConversationWithDetails) => {
    if (conv.title) return conv.title;
    if (conv.is_group) {
      return conv.otherParticipants.map(p => p.profile?.full_name || 'Unknown').join(', ');
    }
    return conv.otherParticipants[0]?.profile?.full_name || 'Unknown User';
  };

  const getConversationInitial = (conv: ConversationWithDetails) => {
    if (conv.is_group) return 'G';
    return conv.otherParticipants[0]?.profile?.full_name?.charAt(0) || '?';
  };

  const isProTradie = (conv: ConversationWithDetails) => {
    // If the other participant is a pro/business tradie, skip all redaction
    const tier = conv.otherParticipantTier;
    return tier === 'pro' || tier === 'business';
  };

  const isContactSharingAllowed = (conv: ConversationWithDetails) => {
    if (isProTradie(conv)) return true;
    if (!user) return false;
    const otherUser = conv.otherParticipants[0]?.user_id;
    if (!otherUser) return false;
    return shouldAllowContactSharing(conv.messages, [user.id, otherUser]);
  };

  const maybeRedact = (text: string, conv: ConversationWithDetails) => {
    if (isContactSharingAllowed(conv)) return text;
    return redactContactInfo(text);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <button
            onClick={() => setShowArchivedFilter(!showArchivedFilter)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
              showArchivedFilter
                ? 'bg-warm-100 text-warm-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Archive className="w-4 h-4" />
            {showArchivedFilter ? 'Show Active' : 'Archived'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="grid md:grid-cols-[340px_1fr] h-[calc(100vh-14rem)] overflow-hidden">
            <div className="border-r border-gray-200 overflow-y-auto flex flex-col" style={{ scrollbarWidth: 'thin', scrollbarColor: '#DDD0CC #F5F0EF' }}>
              <div className="px-4 pt-4 pb-3">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 placeholder:text-gray-400"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No Messages Yet"
                  description={
                    showArchivedFilter
                      ? 'No archived conversations to show.'
                      : isTradie
                      ? 'When clients enquire or you quote on a job, conversations will appear here. Browse leads to get started.'
                      : 'Post a job or save a tradie to start a conversation. Messages with tradies will appear here.'
                  }
                  actionLabel={!showArchivedFilter ? (isTradie ? 'Browse Leads' : 'Post a Job') : undefined}
                  onAction={!showArchivedFilter ? () => navigate(isTradie ? '/work' : '/post-lead') : undefined}
                  compact
                />
              ) : (
                <div>
                  {conversations.filter((conv) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    const title = getConversationTitle(conv).toLowerCase();
                    const lastMsg = conv.lastMessage?.content?.toLowerCase() || '';
                    return title.includes(q) || lastMsg.includes(q);
                  }).map((conv) => {
                    const isSelected = selectedConversation?.id === conv.id;
                    const hasUnread = conv.unreadCount > 0;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => handleConversationClick(conv)}
                        className={`w-full px-4 py-3.5 text-left transition-colors relative ${
                          isSelected
                            ? 'bg-primary-50 border-l-[3px] border-l-primary-600'
                            : 'border-l-[3px] border-l-transparent hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-600'
                          }`}>
                            <span className="text-sm font-bold">
                              {getConversationInitial(conv)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-900'}`}>
                                {getOtherParticipantName(conv)}
                              </h3>
                              <span className={`text-xs flex-shrink-0 ml-2 ${hasUnread ? 'text-warm-600 font-semibold' : 'text-gray-400'}`}>
                                {conv.lastMessage ? formatRelativeTime(conv.lastMessage.created_at) : ''}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <p className={`text-xs truncate pr-2 ${hasUnread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                                {conv.lastMessage
                                  ? (conv.lastMessage.sender_id === user?.id ? 'You: ' : '') + maybeRedact(conv.lastMessage.content, conv)
                                  : 'No messages yet'}
                              </p>
                              {hasUnread && (
                                <span className="w-5 h-5 bg-warm-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                                  {conv.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col h-full overflow-hidden">
              {selectedConversation ? (
                <>
                  <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedConversation(null)}
                        className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-white">
                          {getConversationInitial(selectedConversation)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">
                          {getOtherParticipantName(selectedConversation)}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {selectedConversation.is_group
                            ? `${selectedConversation.participants.length} members`
                            : isTradie ? 'Client' : 'Tradie'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors"
                      aria-label="Conversation settings"
                    >
                      <Settings className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  <div
                    ref={messagesContainerRef}
                    className="flex-1 min-h-0 messages-scrollbar px-5 py-4 space-y-3 bg-gray-50/50"
                  >
                    {selectedConversation.messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                          <MessageSquare className="w-7 h-7 text-primary-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 mb-1">Start the conversation</h3>
                        <p className="text-sm text-gray-500 max-w-xs">
                          Send a message to {getOtherParticipantName(selectedConversation).split(' ')[0]} about your job. Ask questions, discuss details, or request a quote.
                        </p>
                      </div>
                    )}
                    {(() => {
                      const crossMessageRedactedIds = !isContactSharingAllowed(selectedConversation)
                        ? detectCrossMessageDigitBypass(selectedConversation.messages)
                        : new Set<string>();
                      return selectedConversation.messages.map((message, index) => {
                      const isOwn = message.sender_id === user?.id;
                      const isCrossMessageRedacted = crossMessageRedactedIds.has(message.id);
                      const showDate = shouldShowDateSeparator(selectedConversation.messages, index);
                      return (
                        <div key={message.id}>
                          {showDate && (
                            <div className="flex items-center justify-center my-3">
                              <span className="px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-medium text-gray-500 shadow-sm">
                                {formatMessageDateSeparator(message.created_at)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div
                            onClick={
                              message.is_booking_request
                                ? () => handleBookingRequestClick(message.id)
                                : undefined
                            }
                            className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                              isOwn
                                ? 'bg-primary-700 text-white rounded-br-md'
                                : 'bg-white text-gray-900 rounded-bl-md border border-gray-200 shadow-sm'
                            } ${
                              message.is_booking_request
                                ? 'border-2 border-warm-400 cursor-pointer hover:shadow-lg transition-shadow'
                                : ''
                            }`}
                          >
                            {message.is_booking_request && (
                              <div
                                className={`flex items-center gap-1 text-xs mb-1 ${
                                  isOwn ? 'text-primary-300' : 'text-warm-600'
                                }`}
                              >
                                <Calendar className="w-3 h-3" />
                                Booking Request
                              </div>
                            )}

                            {message.attachment_url ? (
                              <div className="space-y-2">
                                {message.attachment_type === 'image' ? (
                                  <img
                                    src={getAttachmentUrl(message.attachment_url ?? '')}
                                    alt={message.attachment_name || 'Image'}
                                    loading="lazy"
                                    decoding="async"
                                    className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(getAttachmentUrl(message.attachment_url ?? ''), '_blank')}
                                  />
                                ) : (
                                  <a
                                    href={getAttachmentUrl(message.attachment_url ?? '')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                      isOwn ? 'bg-primary-800 hover:bg-primary-900' : 'bg-gray-100 hover:bg-gray-200'
                                    }`}
                                  >
                                    {message.attachment_type === 'pdf' && <FileText className="w-4 h-4" />}
                                    {message.attachment_type === 'audio' && <Mic className="w-4 h-4" />}
                                    {(message.attachment_type === 'video' || message.attachment_type === 'other') && <Paperclip className="w-4 h-4" />}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{message.attachment_name}</p>
                                      {message.attachment_size && (
                                        <p className={`text-xs ${isOwn ? 'text-primary-300' : 'text-gray-500'}`}>
                                          {(message.attachment_size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                      )}
                                    </div>
                                  </a>
                                )}
                                {message.content && !message.content.startsWith('Sent a ') && (
                                  <p className="text-sm whitespace-pre-wrap">
                                    {isCrossMessageRedacted ? '[hidden]' : maybeRedact(message.content, selectedConversation)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">
                                {isCrossMessageRedacted
                                  ? '[hidden]'
                                  : maybeRedact(message.content.replace('[Booking Request] ', ''), selectedConversation)}
                              </p>
                            )}

                            <div className={`flex items-center gap-1 mt-1.5 ${isOwn ? 'justify-end' : ''}`}>
                              <p className={`text-[11px] ${isOwn ? 'text-primary-300' : 'text-gray-400'}`}>
                                {new Date(message.created_at).toLocaleTimeString('en-AU', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              {isOwn && message.read_at && (
                                <CheckCheck className="w-3 h-3 text-primary-300" aria-label="Seen" />
                              )}
                            </div>
                            {message.is_booking_request && (
                              <p className={`text-xs mt-1 font-medium ${isOwn ? 'text-primary-100' : 'text-warm-600'}`}>
                                Click to view details
                              </p>
                            )}
                          </div>
                        </div>
                        </div>
                      );
                    });
                    })()}
                    {selectedConversation.messages.length > 0 && !isContactSharingAllowed(selectedConversation) && (
                      <div className="flex items-start gap-2 px-3 py-3 bg-warm-50 border border-warm-200 rounded-xl mx-1">
                        <Lock className="w-4 h-4 text-warm-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-warm-700">
                          For your safety, contact details such as phone numbers and emails are hidden to keep communication on the platform.
                        </p>
                      </div>
                    )}
                    {typingUsers.length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <p className="text-xs text-gray-500">
                          {(() => {
                            const names = typingUsers.map(uid => {
                              const p = selectedConversation.otherParticipants.find(op => op.user_id === uid);
                              return p?.profile?.full_name?.split(' ')[0] || 'Someone';
                            });
                            return names.length === 1
                              ? `${names[0]} is typing...`
                              : `${names.join(', ')} are typing...`;
                          })()}
                        </p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="px-5 py-3 border-t border-gray-200 bg-white">
                    {failedMessages.size > 0 && (
                      <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <p className="text-xs text-red-700 flex-1">Message failed to send.</p>
                        <button
                          onClick={() => handleRetryMessage(newMessage)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Retry
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <div className="relative" ref={attachmentMenuRef}>
                        <button
                          onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                          disabled={uploadingFile}
                          className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                          aria-label="Attach file"
                        >
                          {uploadingFile ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Paperclip className="w-5 h-5" />
                          )}
                        </button>
                        {attachmentMenuOpen && (
                          <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-48 z-10">
                            <button
                              onClick={() => handleAttachmentClick('image/*')}
                              disabled={uploadingFile}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <ImageIcon className="w-4 h-4 text-secondary-600" />
                              <span className="text-sm text-gray-700">Photo</span>
                            </button>
                            <button
                              onClick={() => handleAttachmentClick('application/pdf')}
                              disabled={uploadingFile}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <FileText className="w-4 h-4 text-red-600" />
                              <span className="text-sm text-gray-700">PDF</span>
                            </button>
                            <button
                              onClick={() => handleAttachmentClick('audio/*')}
                              disabled={uploadingFile}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Mic className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-gray-700">Audio</span>
                            </button>
                            <button
                              onClick={() => handleAttachmentClick('*/*')}
                              disabled={uploadingFile}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Paperclip className="w-4 h-4 text-gray-600" />
                              <span className="text-sm text-gray-700">All Files</span>
                            </button>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                      <div className="flex-1 relative">
                        <textarea
                          value={newMessage}
                          onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                          onKeyDown={handleKeyPress}
                          placeholder="Type a message..."
                          rows={1}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 text-sm placeholder:text-gray-400 transition-all"
                        />
                      </div>
                      <button
                        onClick={() => handleSend()}
                        disabled={!newMessage.trim() || sending}
                        className="p-2.5 bg-primary-700 text-white rounded-xl hover:bg-primary-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[42px] min-w-[42px] flex items-center justify-center"
                        aria-label="Send message"
                      >
                        {sending ? (
                          <Loader2 className="w-4.5 h-4.5 animate-spin" />
                        ) : (
                          <Send className="w-4.5 h-4.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-50/50">
                  <div className="text-center px-6">
                    <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-6 h-6 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Select a conversation</h3>
                    <p className="text-xs text-gray-500">Choose a conversation from the list to view messages</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <UnlockLeadModal
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          setSelectedConversation(null);
        }}
        onUnlock={handleUnlock}
        clientName={selectedConversation ? getConversationTitle(selectedConversation) ?? 'this client' : 'this client'}
        jobId={selectedConversation?.job_id ?? ''}
      />

      {selectedConversation && (
        <ConversationSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          conversationId={selectedConversation.id}
          currentUserId={user?.id || ''}
          isAdmin={selectedConversation.myParticipation?.is_admin || false}
          isArchived={selectedConversation.myParticipation?.archived_at !== null}
          onConversationUpdated={() => {
            fetchConversations();
            setShowSettingsModal(false);
          }}
        />
      )}

      {selectedBookingMessageId && selectedConversation && (
        <BookingRequestModal
          isOpen={showBookingRequestModal}
          onClose={() => {
            setShowBookingRequestModal(false);
            setSelectedBookingMessageId(null);
          }}
          messageId={selectedBookingMessageId}
          conversationId={selectedConversation.id}
          onReply={handleBookingRequestReply}
        />
      )}
      {toast.show && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium animate-slide-in ${toast.isError ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  );
}
