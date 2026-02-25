import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Conversation, ConversationParticipant, Message, Profile } from '../types/database';

export interface ParticipantWithProfile extends ConversationParticipant {
  profile: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null;
}

export interface DashboardConversation extends Conversation {
  participants: ParticipantWithProfile[];
  otherParticipants: ParticipantWithProfile[];
  lastMessage: Message | null;
  messages: Message[];
  myParticipation: ConversationParticipant;
}

interface UseDashboardConversationsOptions {
  userId: string | undefined;
  onError?: (message: string) => void;
}

export function useDashboardConversations({ userId, onError }: UseDashboardConversationsOptions) {
  const [conversations, setConversations] = useState<DashboardConversation[]>([]);

  // Stable ref for callback to avoid invalidating useCallback deps every render
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: myParticipations, error } = await supabase
        .from('conversation_participants')
        .select(`*, conversation:conversations(*)`)
        .eq('user_id', userId)
        .is('left_at', null)
        .is('archived_at', null)
        .order('joined_at', { ascending: false });

      if (error) throw error;
      if (!myParticipations) return;

      const conversationsWithDetails = await Promise.all(
        myParticipations.map(async (mp) => {
          const conv = (mp as Record<string, unknown>).conversation as Conversation;

          const { data: allParticipants } = await supabase
            .from('conversation_participants')
            .select('*, profile:profiles(id, full_name, email, avatar_url)')
            .eq('conversation_id', conv.id)
            .is('left_at', null);

          const { data: messages } = await supabase
            .from('messages')
            .select('*, sender_profile:profiles!messages_sender_id_fkey(full_name, email)')
            .eq('conversation_id', conv.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

          const typedParticipants = (allParticipants || []) as unknown as ParticipantWithProfile[];

          return {
            ...conv,
            participants: typedParticipants,
            lastMessage: messages && messages.length > 0 ? messages[messages.length - 1] as Message : null,
            messages: (messages || []) as Message[],
            myParticipation: mp as ConversationParticipant,
            otherParticipants: typedParticipants.filter((p) => p.user_id !== userId),
          } satisfies DashboardConversation;
        })
      );

      conversationsWithDetails.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setConversations(conversationsWithDetails);
    } catch {
      onErrorRef.current?.('Failed to load conversations. Please refresh.');
    }
  }, [userId]);

  const getConversationTitle = useCallback((conv: DashboardConversation): string => {
    if (conv.title) return conv.title;
    if (conv.is_group) {
      return conv.otherParticipants.map((p) => p.profile?.full_name || 'Unknown').join(', ');
    }
    return conv.otherParticipants[0]?.profile?.full_name || 'Unknown User';
  }, []);

  const getConversationInitial = useCallback((conv: DashboardConversation): string => {
    if (conv.is_group) return 'G';
    return conv.otherParticipants[0]?.profile?.full_name?.charAt(0) || '?';
  }, []);

  return {
    conversations,
    fetchConversations,
    getConversationTitle,
    getConversationInitial,
  };
}
