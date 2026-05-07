ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_active_last_seen ON public.sessions(last_seen) WHERE end_time IS NULL;