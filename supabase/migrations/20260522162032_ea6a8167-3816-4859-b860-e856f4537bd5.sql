CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('text','image')),
  message text,
  image_url text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view broadcasts" ON public.broadcasts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert broadcasts" ON public.broadcasts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update broadcasts" ON public.broadcasts FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete broadcasts" ON public.broadcasts FOR DELETE USING (true);

CREATE INDEX idx_broadcasts_expires_at ON public.broadcasts(expires_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;