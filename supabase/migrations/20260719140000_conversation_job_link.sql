-- Group chat: let a conversation be linked to a specific job so all job-related
-- group chatter lives in one thread. The multi-participant foundation
-- (conversation_participants, is_group, title, participant-based RLS) already
-- exists — this only adds the optional job link.
alter table public.conversations add column if not exists job_id uuid references public.jobs(id) on delete set null;
create index if not exists conversations_job_id_idx on public.conversations (job_id);
