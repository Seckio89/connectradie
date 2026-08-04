import { useState, useEffect } from 'react';
import { X, Bell, Shield, Sparkles, Lightbulb, Wrench, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * A platform_updates row as this banner consumes it.
 *
 * `type` and `priority` are plain strings, matching the generated row.
 * platform_updates_type_check / _priority_check restrict them to the keys of
 * typeConfig / priorityConfig below, but PostgREST types text columns as
 * `string`, so the lookups fall back rather than assume.
 */
interface PlatformUpdate {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: string;
  requires_acknowledgment: boolean;
  published_at: string;
}

type TypeConfig = { icon: typeof Shield; label: string; color: string; bg: string; border: string; badge: string };

const FALLBACK_TYPE: TypeConfig = { icon: Wrench, label: 'Update', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', border: 'border-ct-line', badge: 'bg-ct-surface-2 text-ct-mute-2' };
const FALLBACK_PRIORITY = { bar: 'bg-ct-surface-2' };

const typeConfig: Record<string, TypeConfig | undefined> = {
  tos: { icon: Shield, label: 'Terms of service', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', border: 'border-ct-line', badge: 'bg-ct-surface-2 text-ct-mute-2' },
  policy: { icon: Shield, label: 'Policy update', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', border: 'border-ct-line', badge: 'bg-ct-surface-2 text-ct-mute-2' },
  feature: { icon: Sparkles, label: 'New feature', color: 'text-ct-amber', bg: 'bg-ct-amber/[0.13]', border: 'border-ct-amber/[0.34]', badge: 'bg-ct-amber/[0.13] text-ct-amber' },
  recommendation: { icon: Lightbulb, label: 'Recommendation', color: 'text-ct-amber', bg: 'bg-ct-amber/[0.13]', border: 'border-ct-amber/[0.34]', badge: 'bg-ct-amber/[0.13] text-ct-amber' },
  maintenance: { icon: Wrench, label: 'Maintenance', color: 'text-ct-mute-2', bg: 'bg-ct-surface-2', border: 'border-ct-line', badge: 'bg-ct-surface-2 text-ct-mute-2' },
};

const priorityConfig: Record<string, { bar: string } | undefined> = {
  low: { bar: 'bg-ct-line' },
  normal: { bar: 'bg-ct-surface-2' },
  high: { bar: 'bg-ct-amber/[0.13]' },
  critical: { bar: 'bg-ct-rose/[0.13]' },
};

export default function PlatformUpdateBanner() {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (user) fetchUnreadUpdates();
  }, [user]);

  const fetchUnreadUpdates = async () => {
    if (!user) return;

    // Fetch active updates not yet read by this user
    const { data } = await supabase
      .from('platform_updates')
      .select('*')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('priority', { ascending: true }) // critical first
      .order('published_at', { ascending: false });

    if (!data) return;

    // Fetch user's read records
    const { data: reads } = await supabase
      .from('user_update_reads')
      .select('update_id, acknowledged_at')
      .eq('user_id', user.id);

    const readMap = new Map(
      (reads || []).map(r => [r.update_id, r.acknowledged_at])
    );

    // Filter: show unread updates, or unacknowledged ones that require acknowledgment
    const unread = data.filter((u) => {
      const isRead = readMap.has(u.id);
      const isAcknowledged = readMap.get(u.id) !== null && readMap.get(u.id) !== undefined;
      if (u.requires_acknowledgment && !isAcknowledged) return true;
      return !isRead;
    });

    // Sort: critical first, then high, normal, low
    const priorityOrder: Record<string, number | undefined> = { critical: 0, high: 1, normal: 2, low: 3 };
    unread.sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));

    setUpdates(unread);
  };

  const markAsRead = async (updateId: string) => {
    if (!user) return;

    await supabase
      .from('user_update_reads')
      .upsert(
        { user_id: user.id, update_id: updateId, read_at: new Date().toISOString() },
        { onConflict: 'user_id,update_id' }
      );

    setDismissed(prev => new Set(prev).add(updateId));
    // Remove from list after animation
    setTimeout(() => {
      setUpdates(prev => prev.filter(u => u.id !== updateId));
    }, 300);
  };

  const acknowledgeUpdate = async (updateId: string) => {
    if (!user) return;

    await supabase
      .from('user_update_reads')
      .upsert(
        {
          user_id: user.id,
          update_id: updateId,
          read_at: new Date().toISOString(),
          acknowledged_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,update_id' }
      );

    setDismissed(prev => new Set(prev).add(updateId));
    setTimeout(() => {
      setUpdates(prev => prev.filter(u => u.id !== updateId));
    }, 300);
  };

  const dismissAll = async () => {
    if (!user) return;
    const nonRequired = updates.filter(u => !u.requires_acknowledgment);
    for (const update of nonRequired) {
      await supabase
        .from('user_update_reads')
        .upsert(
          { user_id: user.id, update_id: update.id, read_at: new Date().toISOString() },
          { onConflict: 'user_id,update_id' }
        );
    }
    setUpdates(prev => prev.filter(u => u.requires_acknowledgment));
    setShowAll(false);
  };

  const visibleUpdates = showAll ? updates : updates.slice(0, 2);

  if (updates.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {visibleUpdates.map((update) => {
        const config = typeConfig[update.type] ?? FALLBACK_TYPE;
        const pConfig = priorityConfig[update.priority] ?? FALLBACK_PRIORITY;
        const Icon = config.icon;
        const isExpanded = expandedId === update.id;
        const isDismissed = dismissed.has(update.id);

        return (
          <div
            key={update.id}
            className={`relative overflow-hidden rounded-ct-md border transition-all duration-300 ${
              isDismissed ? 'opacity-0 scale-95' : 'opacity-100'
            } ${config.border} ${config.bg}`}
          >
            {/* Priority bar */}
            <div className={`absolute top-0 left-0 w-1 h-full ${pConfig.bar}`} />

            <div className="pl-4 pr-3 py-3">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-1.5 rounded-ct-sm ${config.badge}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[0.625rem] font-semibold uppercase tracking-wider ${config.color}`}>
                      {config.label}
                    </span>
                    {update.priority === 'critical' && (
                      <span className="flex items-center gap-1 text-[0.625rem] font-bold text-ct-rose bg-ct-rose/[0.13] px-1.5 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Urgent
                      </span>
                    )}
                    <span className="text-[0.625rem] text-ct-mute">
                      {new Date(update.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-ct-paper">{update.title}</h4>

                  {isExpanded ? (
                    <div className="mt-2 text-sm text-ct-mute-2 whitespace-pre-line leading-relaxed">
                      {update.content}
                    </div>
                  ) : (
                    <p className="text-xs text-ct-mute-2 mt-0.5 line-clamp-1">{update.content}</p>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : update.id)}
                      className="text-xs font-medium text-ct-mute hover:text-ct-mute-2 flex items-center gap-0.5 transition-colors"
                    >
                      {isExpanded ? 'Show less' : 'Read more'}
                      <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>

                    {update.requires_acknowledgment ? (
                      <button
                        onClick={() => acknowledgeUpdate(update.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-ct-ink bg-ct-teal rounded-ct-sm hover:bg-ct-teal/[0.14] transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        I Acknowledge
                      </button>
                    ) : (
                      <button
                        onClick={() => markAsRead(update.id)}
                        className="text-xs font-medium text-ct-mute hover:text-ct-mute-2 transition-colors"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>

                {!update.requires_acknowledgment && (
                  <button
                    onClick={() => markAsRead(update.id)}
                    className="p-1 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm hover:bg-ct-surface/50 transition-colors flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Show more / dismiss all controls */}
      {updates.length > 2 && (
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2 flex items-center gap-1 transition-colors"
          >
            <Bell className="w-3 h-3" />
            {showAll ? 'Show fewer' : `${updates.length - 2} more update${updates.length - 2 > 1 ? 's' : ''}`}
          </button>
          {showAll && (
            <button
              onClick={dismissAll}
              className="text-xs font-medium text-ct-mute hover:text-ct-mute-2 transition-colors"
            >
              Dismiss all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
