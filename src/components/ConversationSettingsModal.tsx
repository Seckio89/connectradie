import { useState, useEffect } from 'react';
import { X, Archive, Trash2, UserPlus, UserMinus, Shield, Users, Phone, Mail, MapPin, Loader2, Pencil, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ConversationParticipant, ConversationPermission, Profile } from '../types/database';

interface ConversationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  currentUserId: string;
  isAdmin: boolean;
  onConversationUpdated: () => void;
  isArchived?: boolean;
}

interface ParticipantWithProfile extends ConversationParticipant {
  profile?: Profile;
  permissions?: ConversationPermission[];
}

export default function ConversationSettingsModal({
  isOpen,
  onClose,
  conversationId,
  currentUserId,
  isAdmin,
  onConversationUpdated,
  isArchived = false,
}: ConversationSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'participants' | 'permissions'>('general');
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [addUserEmail, setAddUserEmail] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [conversationTitle, setConversationTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadParticipants();
      loadConversationTitle();
    }
  }, [isOpen, conversationId]);

  const loadConversationTitle = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', conversationId)
      .maybeSingle();

    if (data) {
      setConversationTitle(data.title || '');
    }
  };

  const handleSaveTitle = async () => {
    setSavingTitle(true);
    const { error } = await supabase
      .from('conversations')
      .update({ title: conversationTitle || null })
      .eq('id', conversationId);

    if (!error) {
      setEditingTitle(false);
      onConversationUpdated();
    }
    setSavingTitle(false);
  };

  const handleDeleteConversation = async () => {
    setDeleting(true);

    await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('conversation_id', conversationId);

    await supabase
      .from('conversation_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId);

    setDeleting(false);
    onConversationUpdated();
    onClose();
  };

  const loadParticipants = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('conversation_participants')
      .select(`
        *,
        profile:profiles(*)
      `)
      .eq('conversation_id', conversationId)
      .is('left_at', null);

    if (data) {
      const participantsWithPermissions = await Promise.all(
        data.map(async (p: Record<string, unknown> & { user_id: string }) => {
          const { data: perms } = await supabase
            .from('conversation_permissions')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('user_id', p.user_id);

          return {
            ...p,
            permissions: perms || [],
          };
        })
      );
      setParticipants(participantsWithPermissions as ParticipantWithProfile[]);
    }
    setLoading(false);
  };

  const handleArchiveConversation = async () => {
    await supabase
      .from('conversation_participants')
      .update({ archived_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId);

    onConversationUpdated();
    onClose();
  };

  const handleUnarchiveConversation = async () => {
    await supabase
      .from('conversation_participants')
      .update({ archived_at: null })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId);

    onConversationUpdated();
    onClose();
  };

  const handleSearchUsers = async (email: string) => {
    if (!email.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', `%${email}%`)
      .limit(5);

    if (data) {
      const existingIds = participants.map(p => p.user_id);
      setSearchResults((data as unknown as Profile[]).filter((u: Profile) => !existingIds.includes(u.id)));
    }
    setSearching(false);
  };

  const handleAddParticipant = async (userId: string) => {
    if (!isAdmin) return;

    const { error } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        is_admin: false,
      });

    if (!error) {
      setAddUserEmail('');
      setSearchResults([]);
      await loadParticipants();
      onConversationUpdated();
    }
  };

  const handleRemoveParticipant = async (participantId: string, userId: string) => {
    if (!isAdmin || userId === currentUserId) return;

    await supabase
      .from('conversation_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('id', participantId);

    await loadParticipants();
    onConversationUpdated();
  };

  const handleTogglePermission = async (
    userId: string,
    permissionType: 'can_see_phone' | 'can_see_email' | 'can_see_address',
    currentValue: boolean
  ) => {
    if (!isAdmin) return;

    const existingPerm = participants
      .find(p => p.user_id === userId)
      ?.permissions?.find(p => p.blocked_by === currentUserId);

    if (existingPerm) {
      await supabase
        .from('conversation_permissions')
        .update({ [permissionType]: !currentValue })
        .eq('id', existingPerm.id);
    } else {
      await supabase
        .from('conversation_permissions')
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          blocked_by: currentUserId,
          can_see_phone: permissionType === 'can_see_phone' ? false : true,
          can_see_email: permissionType === 'can_see_email' ? false : true,
          can_see_address: permissionType === 'can_see_address' ? false : true,
        });
    }

    await loadParticipants();
  };

  const getPermissionValue = (participant: ParticipantWithProfile, permType: 'can_see_phone' | 'can_see_email' | 'can_see_address') => {
    const myPermission = participant.permissions?.find(p => p.blocked_by === currentUserId);
    return myPermission ? myPermission[permType] : true;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Conversation Settings</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-warm-100 text-warm-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Pencil className="w-4 h-4 inline mr-2" />
              General
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'participants'
                  ? 'bg-warm-100 text-warm-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Participants
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'permissions'
                  ? 'bg-warm-100 text-warm-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Permissions
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Conversation Name
                </label>
                <div className="flex items-center gap-2">
                  {editingTitle ? (
                    <>
                      <input
                        type="text"
                        value={conversationTitle}
                        onChange={(e) => setConversationTitle(e.target.value)}
                        placeholder="Enter a name for this chat..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveTitle}
                        disabled={savingTitle}
                        className="p-2 bg-warm-500 text-white rounded-lg hover:bg-warm-600 transition-colors disabled:opacity-50"
                      >
                        {savingTitle ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Check className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingTitle(false);
                          loadConversationTitle();
                        }}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                        {conversationTitle || 'No custom name set'}
                      </div>
                      <button
                        onClick={() => setEditingTitle(true)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Set a custom name to easily identify this conversation
                </p>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Delete Conversation</h3>
                {showDeleteConfirm ? (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm text-red-700 mb-4">
                      Are you sure you want to delete this conversation? This will remove all messages and cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-4 py-2 text-gray-700 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteConversation}
                        disabled={deleting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Conversation
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'participants' && (
            <div className="space-y-6">
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add Participant
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={addUserEmail}
                      onChange={(e) => {
                        setAddUserEmail(e.target.value);
                        handleSearchUsers(e.target.value);
                      }}
                      placeholder="Search by email..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-3 w-5 h-5 text-gray-400 animate-spin" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleAddParticipant(user.id)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-b-0"
                        >
                          <div>
                            <p className="font-medium text-gray-900">{user.full_name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                          <UserPlus className="w-5 h-5 text-primary-600" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Current Participants</h3>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-primary-600">
                              {participant.profile?.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {participant.profile?.full_name}
                              {participant.user_id === currentUserId && (
                                <span className="ml-2 text-xs text-gray-500">(You)</span>
                              )}
                            </p>
                            <p className="text-sm text-gray-500">{participant.profile?.email}</p>
                            {participant.is_admin && (
                              <span className="text-xs text-primary-600 font-medium">Admin</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && participant.user_id !== currentUserId && (
                          <button
                            onClick={() => handleRemoveParticipant(participant.id, participant.user_id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Control what information each participant can see in this conversation.
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {participants
                    .filter(p => p.user_id !== currentUserId)
                    .map((participant) => (
                      <div
                        key={participant.id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-primary-600">
                              {participant.profile?.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{participant.profile?.full_name}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-gray-700">Can see phone numbers</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={getPermissionValue(participant, 'can_see_phone')}
                              onChange={() =>
                                handleTogglePermission(
                                  participant.user_id,
                                  'can_see_phone',
                                  getPermissionValue(participant, 'can_see_phone')
                                )
                              }
                              disabled={!isAdmin}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-gray-700">Can see email addresses</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={getPermissionValue(participant, 'can_see_email')}
                              onChange={() =>
                                handleTogglePermission(
                                  participant.user_id,
                                  'can_see_email',
                                  getPermissionValue(participant, 'can_see_email')
                                )
                              }
                              disabled={!isAdmin}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-gray-700">Can see addresses</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={getPermissionValue(participant, 'can_see_address')}
                              onChange={() =>
                                handleTogglePermission(
                                  participant.user_id,
                                  'can_see_address',
                                  getPermissionValue(participant, 'can_see_address')
                                )
                              }
                              disabled={!isAdmin}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                          </label>
                        </div>
                      </div>
                    ))}

                  {participants.length <= 1 && (
                    <div className="text-center py-8 text-gray-500">
                      No other participants to manage permissions for
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-3">
            {isArchived ? (
              <button
                onClick={handleUnarchiveConversation}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-warm-500 text-white rounded-lg hover:bg-warm-600 transition-colors"
              >
                <Archive className="w-4 h-4" />
                Unarchive Conversation
              </button>
            ) : (
              <button
                onClick={handleArchiveConversation}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Archive className="w-4 h-4" />
                Archive Conversation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
