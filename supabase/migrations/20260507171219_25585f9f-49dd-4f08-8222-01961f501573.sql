CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  multiplier NUMERIC NOT NULL DEFAULT 1,
  event_name TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert settings" ON public.settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update settings" ON public.settings FOR UPDATE USING (true);

INSERT INTO public.settings (key, multiplier, event_name, active)
VALUES ('multiplier', 1, NULL, false);

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS multiplier NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS event_name TEXT;
CREATE POLICY "Anyone can delete sessions" ON public.sessions FOR DELETE USING (true);