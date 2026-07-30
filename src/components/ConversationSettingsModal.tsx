import { useState, useEffect } from 'react';
import { X, Archive, Trash2, UserPlus, UserMinus, Shield, Users, Phone, Mail, MapPin, Loader2, Pencil, Check, LogOut } from 'lucide-react';
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
  const [isGroup, setIsGroup] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadParticipants();
      loadConversationTitle();
    }
  }, [isOpen, conversationId]);

  const loadConversationTitle = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('title, is_group')
      .eq('id', conversationId)
      .maybeSingle();

    if (data) {
      setConversationTitle(data.title || '');
      setIsGroup(!!data.is_group);
    }
  };

  // Leave a group non-destructively — only marks the current user as left, the
  // thread and its messages stay intact for everyone else.
  const handleLeaveGroup = async () => {
    setLeaving(true);
    await supabase
      .from('conversation_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', currentUserId);
    setLeaving(false);
    onConversationUpdated();
    onClose();
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
        is_admin,
        profile:profiles(*, is_admin)
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
      <div className="bg-ct-surface rounded-ct-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-ct-line">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-ct-paper">Conversation Settings</h2>
            <button
              onClick={onClose}
              className="p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['general', 'General', Pencil],
              ['participants', 'Participants', Users],
              ['permissions', 'Permissions', Shield],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-ct-sm text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-ct-teal text-ct-ink shadow-sm'
                    : 'bg-ct-surface-2 text-ct-mute-2 hover:bg-ct-line'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-ct-mute-2 mb-2">
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
                        className="flex-1 px-4 py-2 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveTitle}
                        disabled={savingTitle}
                        className="p-2 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 transition-colors disabled:opacity-50"
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
                        className="p-2 text-ct-mute hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 px-4 py-2 bg-ct-surface-2 border border-ct-line rounded-ct-sm text-ct-mute-2">
                        {conversationTitle || 'No custom name set'}
                      </div>
                      <button
                        onClick={() => setEditingTitle(true)}
                        className="p-2 text-ct-mute hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-ct-mute">
                  Set a custom name to easily identify this conversation
                </p>
              </div>

              <div className="border-t border-ct-line pt-6">
                <h3 className="text-sm font-medium text-ct-paper mb-3">Delete Conversation</h3>
                {showDeleteConfirm ? (
                  <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md p-4">
                    <p className="text-sm text-ct-rose mb-4">
                      Are you sure you want to delete this conversation? This will remove all messages and cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-4 py-2 text-ct-mute-2 font-medium border border-ct-line rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteConversation}
                        disabled={deleting}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-ct-rose text-ct-ink font-medium rounded-ct-sm hover:brightness-110 transition-colors disabled:opacity-50"
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
                    className="flex items-center gap-2 px-4 py-2 text-ct-rose border border-ct-rose/[0.34] rounded-ct-sm hover:bg-ct-rose/[0.13] transition-colors"
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
                  <label className="block text-sm font-medium text-ct-mute-2 mb-2">
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
                      className="w-full px-4 py-2 border border-ct-line rounded-ct-sm focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-3 w-5 h-5 text-ct-mute animate-spin" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mt-2 bg-ct-surface border border-ct-line rounded-ct-sm shadow-lg">
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleAddParticipant(user.id)}
                          className="w-full px-4 py-3 text-left hover:bg-ct-surface-2 flex items-center justify-between border-b border-ct-line-soft last:border-b-0"
                        >
                          <div>
                            <p className="font-medium text-ct-paper">{user.full_name}</p>
                            <p className="text-sm text-ct-mute"><span className="break-words">{user.email}</span></p>
                          </div>
                          <UserPlus className="w-5 h-5 text-ct-mute-2" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-sm font-bold text-ct-paper mb-3">Current Participants</h3>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between gap-2 p-3 bg-ct-surface-2 border border-ct-teal/30 rounded-ct-md"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 bg-ct-surface-2 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-base font-bold text-ct-mute-2">
                              {participant.profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-ct-paper break-words">
                                {participant.profile?.full_name || 'Unknown'}
                                {participant.user_id === currentUserId && (
                                  <span className="ml-1.5 text-xs font-normal text-ct-mute">(You)</span>
                                )}
                              </p>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                participant.is_admin ? 'bg-ct-teal/[0.14] text-ct-teal' : 'bg-ct-surface-2 text-ct-mute-2'
                              }`}>
                                {participant.is_admin ? 'Owner' : 'Member'}
                              </span>
                            </div>
                            {participant.profile?.email && (
                              <p className="text-sm text-ct-mute break-all">{participant.profile.email}</p>
                            )}
                          </div>
                        </div>
                        {isAdmin && participant.user_id !== currentUserId && (
                          <button
                            onClick={() => handleRemoveParticipant(participant.id, participant.user_id)}
                            aria-label={`Remove ${participant.profile?.full_name || 'participant'}`}
                            className="p-2 text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors flex-shrink-0"
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
              <p className="text-sm text-ct-mute-2 mb-4">
                Control what information each participant can see in this conversation.
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {participants
                    .filter(p => p.user_id !== currentUserId)
                    .map((participant) => (
                      <div
                        key={participant.id}
                        className="border border-ct-line rounded-ct-sm p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 bg-ct-surface-2 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-ct-mute-2">
                              {participant.profile?.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-ct-paper">{participant.profile?.full_name}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 hover:bg-ct-surface-2 rounded-ct-sm cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-ct-mute" />
                              <span className="text-sm text-ct-mute-2">Can see phone numbers</span>
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
                              className="w-4 h-4 text-ct-mute-2 rounded focus:ring-ct-teal"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 hover:bg-ct-surface-2 rounded-ct-sm cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-ct-mute" />
                              <span className="text-sm text-ct-mute-2">Can see email addresses</span>
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
                              className="w-4 h-4 text-ct-mute-2 rounded focus:ring-ct-teal"
                            />
                          </label>

                          <label className="flex items-center justify-between p-2 hover:bg-ct-surface-2 rounded-ct-sm cursor-pointer">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-ct-mute" />
                              <span className="text-sm text-ct-mute-2">Can see addresses</span>
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
                              className="w-4 h-4 text-ct-mute-2 rounded focus:ring-ct-teal"
                            />
                          </label>
                        </div>
                      </div>
                    ))}

                  {participants.length <= 1 && (
                    <div className="text-center py-8 text-ct-mute">
                      No other participants to manage permissions for
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-ct-line bg-ct-surface-2 space-y-2.5">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('participants')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm font-medium hover:brightness-110 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Participant
            </button>
          )}
          <div className="flex gap-2.5">
            {isGroup && (
              <button
                onClick={handleLeaveGroup}
                disabled={leaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-ct-rose/[0.34] text-ct-rose rounded-ct-sm font-medium hover:bg-ct-rose/[0.13] transition-colors disabled:opacity-50"
              >
                {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Leave Group
              </button>
            )}
            {isArchived ? (
              <button
                onClick={handleUnarchiveConversation}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-ct-amber/[0.34] text-ct-amber rounded-ct-sm font-medium hover:bg-ct-amber/[0.13] transition-colors"
              >
                <Archive className="w-4 h-4" />
                Unarchive
              </button>
            ) : (
              <button
                onClick={handleArchiveConversation}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-ct-amber/[0.34] text-ct-amber rounded-ct-sm font-medium hover:bg-ct-amber/[0.13] transition-colors"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
