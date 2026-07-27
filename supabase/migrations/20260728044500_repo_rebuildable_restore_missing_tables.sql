-- Restore three tables that exist in production but have no CREATE TABLE
-- anywhere in this repo.
--
-- Companion to 20260728043000, which did the same for three functions. Found
-- the same way: provisioning a fresh project from supabase/migrations produced
-- 91 of production's 94 tables. Missing were platform_updates,
-- user_update_reads (the /admin/updates feature) and service_decline_tokens
-- (the emailed recurring-service decline links).
--
-- Definitions below are reconstructed from production's catalogs — columns,
-- defaults, constraints, indexes, RLS state and policies — so a rebuild lands
-- on the same shape. Idempotent, therefore a no-op against production.
--
-- NOTE on service_decline_tokens: RLS is enabled with NO policies, which is
-- deliberate, not an omission. The tokens are bearer secrets emailed to
-- clients; only the service role reads them, and a policy-free RLS table denies
-- every anon/authenticated request. Do not "fix" this by adding a policy.

-- ── platform_updates ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_updates (
    id uuid NOT NULL DEFAULT gen_random_uuid()
  , title text NOT NULL
  , content text NOT NULL
  , type text NOT NULL
  , priority text NOT NULL DEFAULT 'normal'::text
  , is_active boolean NOT NULL DEFAULT true
  , requires_acknowledgment boolean NOT NULL DEFAULT false
  , published_at timestamp with time zone NOT NULL DEFAULT now()
  , expires_at timestamp with time zone
  , created_by uuid
  , created_at timestamp with time zone NOT NULL DEFAULT now()
  , updated_at timestamp with time zone NOT NULL DEFAULT now()
  , CONSTRAINT platform_updates_pkey PRIMARY KEY (id)
  , CONSTRAINT platform_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
  , CONSTRAINT platform_updates_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))
  , CONSTRAINT platform_updates_type_check CHECK (type = ANY (ARRAY['tos'::text, 'policy'::text, 'feature'::text, 'recommendation'::text, 'maintenance'::text]))
);

CREATE INDEX IF NOT EXISTS idx_platform_updates_active
  ON public.platform_updates USING btree (is_active, published_at DESC) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_platform_updates_created_by
  ON public.platform_updates USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_platform_updates_type
  ON public.platform_updates USING btree (type);

ALTER TABLE public.platform_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active updates" ON public.platform_updates;
CREATE POLICY "Anyone can read active updates" ON public.platform_updates
  FOR SELECT USING (
    ((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())))
    OR (EXISTS (SELECT 1 FROM public.profiles
                 WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text))
  );

DROP POLICY IF EXISTS "Admins can insert updates" ON public.platform_updates;
CREATE POLICY "Admins can insert updates" ON public.platform_updates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

DROP POLICY IF EXISTS "Admins can update updates" ON public.platform_updates;
CREATE POLICY "Admins can update updates" ON public.platform_updates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

DROP POLICY IF EXISTS "Admins can delete updates" ON public.platform_updates;
CREATE POLICY "Admins can delete updates" ON public.platform_updates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

-- ── user_update_reads ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_update_reads (
    id uuid NOT NULL DEFAULT gen_random_uuid()
  , user_id uuid NOT NULL
  , update_id uuid NOT NULL
  , read_at timestamp with time zone NOT NULL DEFAULT now()
  , acknowledged_at timestamp with time zone
  , CONSTRAINT user_update_reads_pkey PRIMARY KEY (id)
  , CONSTRAINT user_update_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
  , CONSTRAINT user_update_reads_update_id_fkey FOREIGN KEY (update_id) REFERENCES public.platform_updates(id) ON DELETE CASCADE
  , CONSTRAINT user_update_reads_user_id_update_id_key UNIQUE (user_id, update_id)
);

CREATE INDEX IF NOT EXISTS idx_user_update_reads_user
  ON public.user_update_reads USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_update_reads_update
  ON public.user_update_reads USING btree (update_id);

ALTER TABLE public.user_update_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own update reads" ON public.user_update_reads;
CREATE POLICY "Users can read own update reads" ON public.user_update_reads
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can mark updates as read" ON public.user_update_reads;
CREATE POLICY "Users can mark updates as read" ON public.user_update_reads
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can acknowledge updates" ON public.user_update_reads;
CREATE POLICY "Users can acknowledge updates" ON public.user_update_reads
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- ── service_decline_tokens ──────────────────────────────────────────────────
-- RLS on, no policies: service-role only. See the note at the top.

CREATE TABLE IF NOT EXISTS public.service_decline_tokens (
    token uuid NOT NULL DEFAULT gen_random_uuid()
  , recurring_job_id uuid
  , client_id uuid
  , client_contact_id uuid
  , original_job_id uuid
  , trade_category text
  , service_label text
  , location text
  , agreed_price numeric
  , tradie_id uuid
  , action text
  , action_taken_at timestamp with time zone
  , new_job_id uuid
  , expires_at timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval)
  , created_at timestamp with time zone NOT NULL DEFAULT now()
  , CONSTRAINT service_decline_tokens_pkey PRIMARY KEY (token)
  , CONSTRAINT service_decline_tokens_recurring_job_id_fkey FOREIGN KEY (recurring_job_id) REFERENCES public.recurring_jobs(id) ON DELETE CASCADE
  , CONSTRAINT service_decline_tokens_action_check CHECK (action = ANY (ARRAY['request'::text, 'dismiss'::text]))
);

CREATE INDEX IF NOT EXISTS idx_service_decline_tokens_expires
  ON public.service_decline_tokens USING btree (expires_at);

ALTER TABLE public.service_decline_tokens ENABLE ROW LEVEL SECURITY;
