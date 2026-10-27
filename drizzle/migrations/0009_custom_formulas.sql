CREATE TABLE public.custom_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Custom',
  name text NOT NULL,
  expression text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_formulas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_formulas TO authenticated;
GRANT ALL ON public.custom_formulas TO service_role;
ALTER TABLE public.custom_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read custom formulas" ON public.custom_formulas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage custom formulas" ON public.custom_formulas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));