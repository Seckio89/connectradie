import { supabase } from './supabase';

export async function logAdminAction(action: string, targetType: string, targetId?: string, details?: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('admin_audit_log').insert({
    admin_id: user.id,
    action,
    target_type: targetType,
    target_id: targetId || null,
    details: details || null,
  });
}
