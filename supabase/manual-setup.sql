-- ============================================================
-- Horas Biblio — estructura completa de base de datos
-- Ejecutar UNA VEZ en el SQL Editor de tu proyecto Supabase.
-- ============================================================

-- Función util para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ------------------------------------------------------------
-- 1) sessions: registros de check-in / check-out
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  total_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  multiplier numeric NOT NULL DEFAULT 1,
  event_name text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO anon, authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sessions"   ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sessions" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.sessions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete sessions" ON public.sessions FOR DELETE USING (true);

-- ------------------------------------------------------------
-- 2) settings: modo evento / multiplicador global
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1,
  event_name text,
  active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings"   ON public.settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert settings" ON public.settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update settings" ON public.settings FOR UPDATE USING (true);

-- ------------------------------------------------------------
-- 3) broadcasts: anuncios de texto e imagen temporales
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  message text,
  image_url text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO anon, authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view broadcasts"   ON public.broadcasts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert broadcasts" ON public.broadcasts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update broadcasts" ON public.broadcasts FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete broadcasts" ON public.broadcasts FOR DELETE USING (true);

-- ------------------------------------------------------------
-- 4) past_rankings: historial de temporadas cerradas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.past_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.past_rankings TO anon, authenticated;
GRANT ALL ON public.past_rankings TO service_role;
ALTER TABLE public.past_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view past_rankings"   ON public.past_rankings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert past_rankings" ON public.past_rankings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update past_rankings" ON public.past_rankings FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete past_rankings" ON public.past_rankings FOR DELETE USING (true);

DROP TRIGGER IF EXISTS update_past_rankings_updated_at ON public.past_rankings;
CREATE TRIGGER update_past_rankings_updated_at
BEFORE UPDATE ON public.past_rankings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 5) Storage: bucket público para imágenes de anuncios
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('announcements_images', 'announcements_images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read announcements_images"
ON storage.objects FOR SELECT USING (bucket_id = 'announcements_images');

CREATE POLICY "Public upload announcements_images"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'announcements_images');

CREATE POLICY "Public delete announcements_images"
ON storage.objects FOR DELETE USING (bucket_id = 'announcements_images');
