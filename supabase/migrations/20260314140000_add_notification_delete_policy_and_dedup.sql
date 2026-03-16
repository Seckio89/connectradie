-- 1. Add DELETE policy so users can delete their own notifications
CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Deduplicate existing notifications: keep only the most recent per user + type + job_id
DELETE FROM notifications a
USING notifications b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.type = b.type
  AND a.job_id IS NOT NULL
  AND a.job_id = b.job_id;
