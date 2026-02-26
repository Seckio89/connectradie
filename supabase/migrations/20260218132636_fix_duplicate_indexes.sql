/*
  # Fix Duplicate Indexes

  Drop duplicate indexes, keeping the more descriptive name in each case.

  ## Duplicates Found
  - jobs: idx_jobs_client vs idx_jobs_client_id (identical) → drop idx_jobs_client_id
  - jobs: idx_jobs_flash_boost vs idx_jobs_is_flash_boost (identical) → drop idx_jobs_is_flash_boost
  - jobs: idx_jobs_tradie vs idx_jobs_tradie_id (identical) → drop idx_jobs_tradie_id
  - messages: idx_messages_sender vs idx_messages_sender_id (identical) → drop idx_messages_sender_id
*/

DROP INDEX IF EXISTS public.idx_jobs_client_id;
DROP INDEX IF EXISTS public.idx_jobs_is_flash_boost;
DROP INDEX IF EXISTS public.idx_jobs_tradie_id;
DROP INDEX IF EXISTS public.idx_messages_sender_id;
